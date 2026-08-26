# CESIZen — Environnement de déploiement conteneurisé

Document de référence : commandes de lancement, choix techniques et argumentaire de soutenance.

Dernière mise à jour : août 2026
 
---

## 1. Démarrage rapide (mémo du jour J)

Depuis la racine du projet `cesiZen/` :

```bash
# 1. Démarrer Docker Desktop AVANT (icône baleine verte, "Engine running")
 
# 2. Construire et lancer les trois services
docker compose up -d --build
 
# 3. Créer / mettre à jour le schéma de base
docker compose exec -u www-data backend php bin/console do:mi:mi --no-interaction
 
# 4. Vérifier
docker compose ps
```

| Service | URL | Rôle |
|---|---|---|
| Frontend React | https://localhost:3443 | Interface utilisateur (Nginx, TLS auto-signé local — accepter l'avertissement du navigateur) |
| API Symfony | http://localhost:8080/api | API REST (Apache + PHP 8.4) |
| MySQL | localhost:3307 | Base de données |

**À faire avant la soutenance :** lancer `docker compose up -d --build` au moins 10 minutes avant le passage. Le premier build prend plusieurs minutes ; ensuite le démarrage est quasi instantané grâce au cache Docker.
 
---

## 2. Architecture déployée

```
        Navigateur
             |
             v
   [ frontend ] Nginx  :3443 (HTTPS, certificat auto-signé local)
      |  sert le build React (fichiers statiques)
      |  relaie /api  ------------------>  [ backend ] Apache + PHP 8.4  :8080
                                                 |  Symfony 8 + API Platform + JWT
                                                 v
                                          [ db ] MySQL 8.0  :3307
                                                 |
                                          volume db_data (persistance)
```

Trois conteneurs isolés, reliés par le réseau interne créé automatiquement par Docker Compose. Chaque service est joignable par son nom (`db`, `backend`, `frontend`) : c'est pourquoi la chaîne de connexion Symfony pointe vers `mysql://cesizen:cesizen@db:3306/...` et non vers `localhost`.
 
---

## 3. Fichiers créés et rôle de chacun

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | Orchestration des 3 services, réseau, volumes, ordre de démarrage |
| `backend/Dockerfile` | Image PHP 8.4 + Apache + extensions + dépendances Composer |
| `backend/apache-vhost.conf` | Vhost Apache : `DocumentRoot` sur `public/` + `FallbackResource` |
| `backend/.dockerignore` | Exclut `vendor`, `var`, `.env`, `config/jwt` de l'image |
| `frontend/Dockerfile` | Build multi-étapes : Node compile, Nginx sert |
| `frontend/nginx.conf` | Routage SPA + proxy `/api` vers le backend |
| `frontend/.dockerignore` | Exclut `node_modules`, `dist`, `.env` |
 
---

## 4. Choix techniques et justifications (à défendre à l'oral)

### 4.1 Pourquoi Docker

- **Reproductibilité** : le même environnement du poste de développement à la production. Élimine le « ça marche chez moi ».
- **Isolation** : PHP 8.4 et MySQL 8.0 tournent dans des versions figées, indépendantes de ce qui est installé sur la machine hôte.
- **Déploiement externalisé** : le Ministère peut reprendre le projet et le déployer sans procédure d'installation manuelle — c'est explicitement demandé dans le cahier des charges.
- **Portabilité** : les mêmes fichiers fonctionnent sur un VPS, un cloud souverain ou un serveur du Ministère.
### 4.2 Build multi-étapes du frontend

Le `Dockerfile` React comporte deux étapes : une image Node qui compile, puis une image Nginx qui ne reçoit que le résultat (`dist`).

**Bénéfices :** l'image finale ne contient ni Node, ni `node_modules`, ni le code source. Elle passe de plusieurs centaines de Mo à quelques dizaines. Moins de code embarqué = surface d'attaque réduite.

### 4.3 Le proxy Nginx vers `/api`

Nginx relaie les appels `/api` vers le conteneur backend. Conséquences :

- **Pas de problème CORS** : pour le navigateur, tout vient de la même origine.
- **Un seul port exposé** en production : le backend n'a pas besoin d'être accessible publiquement.
- **Configuration React inchangée** entre les environnements : `VITE_API_URL` reste vide, les appels sont relatifs.
> Subtilité à connaître : les variables Vite (`VITE_*`) sont injectées **au moment du build**, pas à l'exécution. Changer une variable impose de reconstruire l'image.

### 4.4 Le healthcheck sur MySQL

```yaml
depends_on:
  db:
    condition: service_healthy
```

Sans cela, Symfony démarre avant que MySQL accepte les connexions et plante. Le `healthcheck` interroge MySQL toutes les 5 secondes ; le backend n'est lancé qu'une fois la base réellement prête. C'est la gestion des dépendances de démarrage.

### 4.5 Le volume nommé `db_data`

Les données MySQL sont stockées dans un volume Docker, pas dans le conteneur. Reconstruire ou supprimer le conteneur ne détruit pas les données. En production, ce volume est la cible des sauvegardes.

### 4.6 Gestion des secrets

Ne sont **ni dans l'image Docker, ni dans Git** :

- les clés JWT (`config/jwt`) — générées à l'exécution
- le fichier `.env` et les mots de passe
- `APP_SECRET`
  Ils sont injectés par variables d'environnement au lancement du conteneur. C'est la bonne pratique attendue : un secret commité dans Git reste dans l'historique même après suppression, et impose une rotation complète des identifiants.

---

## 5. Problèmes rencontrés et résolus (excellent matériau pour les questions du jury)

### 5.1 404 sur toutes les routes sauf `/`

**Symptôme :** `/` répondait, `/api` renvoyait un 404 brut d'Apache.

**Cause :** `backend/public/.htaccess` n'était pas versionné (seul `index.php` l'était) et le vhost Apache ne comportait aucune directive redirigeant les URL inconnues vers le contrôleur frontal. Apache cherchait donc un fichier réellement nommé `/api` et abandonnait avant même d'exécuter PHP.

**Solution :** création de `backend/apache-vhost.conf` avec la directive recommandée par Symfony :

```apache
<Directory /var/www/html/public>
    AllowOverride All
    Require all granted
    FallbackResource /index.php
</Directory>
```

copiée dans l'image par le `Dockerfile` en remplacement de `000-default.conf`.

**Pourquoi c'est mieux qu'un `.htaccess` :** la configuration est versionnée avec le projet et lue une seule fois au démarrage d'Apache, au lieu d'être relue à chaque requête.

### 5.2 Erreur 500 — permission denied sur le cache

**Symptôme :** `Cannot rename ... /var/www/html/var/cache/prod/easyadmin/... : Permission denied`

**Cause :** Apache s'exécute sous l'utilisateur `www-data`, mais les commandes lancées via `docker compose exec` le sont en `root`. Un `cache:clear` en root crée des fichiers que `www-data` ne peut plus écrire.

**Solution :** exécuter systématiquement les commandes Symfony sous le bon utilisateur :

```bash
docker compose exec -u www-data backend php bin/console <commande>
```

et préchauffer le cache pendant le build, suivi d'un `chown -R www-data:www-data var config/jwt`.

### 5.3 Clés JWT absentes du conteneur

`config/jwt` étant volontairement exclu de l'image (secret), les clés doivent être générées dans le conteneur :

```bash
docker compose exec backend php bin/console lexik:jwt:generate-keypair --skip-if-exists
docker compose exec backend chown -R www-data:www-data config/jwt
```

C'est une contrainte assumée : elle garantit que les clés privées ne circulent jamais dans une image ou un dépôt Git.
 
---

## 5bis. Versioning et gestion des sources

### 5bis.1 Stratégie de branches (Git Flow simplifié)

| Branche | Rôle |
|---|---|
| `main` | Production. Uniquement des versions taguées, jamais de commit direct. |
| `develop` | Intégration. Reçoit les fonctionnalités terminées et validées. |
| `feature/xxx` | Une fonctionnalité ou évolution, liée à un ticket. |
| `fix/xxx` | Une correction d'anomalie, liée à un ticket. |
| `hotfix/xxx` | Correction urgente partant directement de `main`. |

**Conventions de commit** — format *Conventional Commits* avec référence au ticket :

```
feat: ajoute le tracker d'émotions (#14)
fix: corrige la réinitialisation de mot de passe (#12)
docs: complète le guide de déploiement
chore: met à jour les dépendances
```

Le numéro entre parenthèses crée automatiquement le lien entre le commit et le ticket sur GitHub : traçabilité complète entre une demande client et le code qui y répond.

**Tags de version** — chaque livraison est taguée (`v1.0.0`), ce qui matérialise le lien entre une version identifiée et un déploiement.

### 5bis.2 Protection de la branche `main`

Un ruleset GitHub est configuré sur `main` :

- *Require a pull request before merging* : aucun commit direct, tout passe par une Pull Request
- *Required approvals* : **0**
> **Choix assumé sur les approbations.** En contexte d'équipe, on exigerait 1 à 2 revues croisées obligatoires. Le projet étant mené en individuel, GitHub interdisant l'auto-approbation, exiger une revue rendrait tout merge impossible. Le passage obligatoire par Pull Request est conservé — c'est lui qui porte la valeur : historique lisible, point de contrôle unique, et emplacement où brancher les vérifications automatiques de la CI.

### 5bis.3 Limitation GitHub sur les dépôts privés

**Constat :** GitHub n'applique pas les rulesets sur un dépôt privé en compte gratuit (message : *« Your rulesets won't be enforced on this private repository until you move to GitHub Team »*). La règle est correctement configurée mais reste inactive.

**Options examinées :**

1. Passer le dépôt en public — écarté (voir ci-dessous)
2. Souscrire GitHub Pro / Team — non retenu pour un projet d'évaluation
3. **Retenu :** conserver la règle configurée et documentée, appliquer la discipline de branches manuellement
   **Pourquoi le dépôt reste privé :** l'historique Git contient d'anciens commits incluant un fichier `.env` avec la chaîne `DATABASE_URL`. Rendre le dépôt public exposerait ces valeurs de façon permanente, y compris dans les commits anciens — les dépôts publics sont scannés en continu par des robots à la recherche de secrets. Le risque de fuite l'emporte sur le bénéfice d'activer une règle de protection.

**En contexte professionnel** (organisation GitHub Team ou GitLab autohébergé pour un projet du Ministère), la protection serait effective, complétée par : revue de code obligatoire, vérifications CI bloquantes, et signature des commits.

### 5bis.4 Enseignement sur la gestion des secrets

Cette situation illustre une règle importante : **un secret commité reste dans l'historique Git même après suppression du fichier**. Ajouter un fichier au `.gitignore` n'efface pas le passé.

Bonnes pratiques appliquées depuis :

- `.env` exclu du versioning, `.env.example` versionné avec des valeurs neutres
- clés JWT générées à l'exécution, jamais dans l'image ni dans Git
- secrets injectés par variables d'environnement au lancement des conteneurs
- en cas de fuite avérée : rotation des identifiants **avant** tout nettoyage d'historique, un secret exposé étant considéré comme compromis
  Vérification systématique avant un changement de visibilité :

```bash
git log --all --full-history --name-only | grep -E "\.env|jwt/" | sort -u
```
 
---

## 5ter. Intégration continue (GitHub Actions)

### 5ter.1 Ce que fait la chaîne

Fichier : `.github/workflows/ci.yml`

Déclenchement : à chaque push sur `main` ou `develop`, et à chaque Pull Request visant ces branches.

```
   Push / Pull Request
            |
     +------+------+
     |             |            (en parallèle)
     v             v
[ Tests backend ]  [ Build frontend ]
  PHPUnit, 54 tests   npm ci + npm run build
  ~46 s               ~16 s
     |             |
     +------+------+
            |  (les deux doivent réussir : needs)
            v
   [ Build des images Docker ]
     backend + frontend, ~2 min
```

### 5ter.2 Détail du job « Tests backend »

Sur une machine Ubuntu neuve, GitHub :

1. démarre un service MySQL 8.0 avec healthcheck
2. installe PHP 8.4 et les extensions `pdo_mysql`, `intl`, `zip`
3. restaure le cache Composer (clé calculée sur le hash de `composer.lock`)
4. installe les dépendances
5. **génère les clés JWT** — nécessaire car `config/jwt` n'est pas versionné
6. crée la base de test et applique les migrations
7. exécute les 54 tests PHPUnit
   Les secrets utilisés en CI (`APP_SECRET`, identifiants MySQL) sont des valeurs jetables, propres à l'environnement d'exécution éphémère, sans lien avec les environnements réels.

### 5ter.3 Pourquoi trois jobs distincts

| Job | Risque couvert |
|---|---|
| Tests backend | Régression fonctionnelle sur l'API |
| Build frontend | Erreur de compilation React non détectée en local |
| Build des images | `Dockerfile` cassé, dépendance manquante, environnement non reproductible |

Le troisième job dépend des deux premiers (`needs`) : **aucune image n'est construite si le code n'est pas validé**. C'est une chaîne de qualité, pas une simple série de vérifications.

### 5ter.4 Lien avec la protection de branche

Les trois vérifications sont déclarées comme *required status checks* sur `main`, avec l'option *Require branches to be up to date before merging*.

Conséquence : une Pull Request dont un seul job échoue **ne peut pas être mergée**. Et l'option « branche à jour » garantit que les tests s'exécutent contre l'état réel de la cible, pas contre un état obsolète — ce qui évite qu'une PR verte casse `main` une fois combinée à une autre.

*(Rappel : ces règles sont configurées mais non appliquées par GitHub sur un dépôt privé en compte gratuit — voir section 5bis.3.)*

### 5ter.5 Le pas vers le déploiement continu

La chaîne actuelle relève de l'**intégration continue** : elle valide et construit. Pour aller au **déploiement continu**, il resterait deux étapes :

1. pousser les images taguées vers un registre (GitHub Container Registry, Docker Hub, ou registre privé du Ministère)
2. déclencher, sur un tag de version `vX.Y.Z`, un déploiement sur le serveur cible (`docker compose pull && docker compose up -d`)
   Ce découpage est volontaire : en contexte de commande publique, la mise en production reste généralement une décision humaine, déclenchée par un tag après validation en recette.

### 5ter.6 Utilisation quotidienne

```bash
# Travailler sur une évolution
git checkout develop && git pull
git checkout -b feature/ma-fonctionnalite
# ... développement ...
git commit -m "feat: description (#numero_ticket)"
git push -u origin feature/ma-fonctionnalite
# → ouvrir une Pull Request sur GitHub
# → la CI s'exécute automatiquement
# → merge possible uniquement si les 3 checks sont verts
```

> **Point de vigilance :** le workflow ne se déclenche que sur `main`, `develop` et les Pull Requests. Un push sur une branche `feature/*` seule ne lance rien — c'est le comportement attendu, la vérification a lieu au moment de la Pull Request.
 
---

## 6. Scénario de démonstration API

À rejouer devant le jury pour prouver que la chaîne complète fonctionne.

```bash
# 1. Créer un compte
curl -X POST http://localhost:8080/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@cesizen.fr","password":"Demo1234!"}'
 
# 2. S'authentifier et récupérer un token JWT
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@cesizen.fr","password":"Demo1234!"}'
 
# 3. Accéder à une ressource protégée
TOKEN="<coller le token>"
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api
```

Démonstration équivalente depuis l'interface : https://localhost:3443, onglet Réseau des outils de développement, connexion → requête `/api/login` en 200 avec le token en réponse.
 
---

## 7. Les trois environnements du plan de déploiement

Un seul est réellement déployé (l'environnement de test), les deux autres sont décrits — conformément à la consigne.

| | Développement | Test / Recette | Production |
|---|---|---|---|
| **Emplacement** | Poste du développeur | Serveur de test | Hébergeur UE (souverain, HDS si données de santé) |
| **`APP_ENV`** | `dev` | `test` | `prod` |
| **Code** | Volume monté (rechargement à chaud) | Image construite par la CI | Image taguée validée en recette |
| **Base** | MySQL conteneurisé, jeu de données factices | Réinitialisée à chaque campagne de tests | Managée, sauvegardée quotidiennement |
| **Outils** | Vite dev server, Xdebug, profiler Symfony | Tests automatisés, accès client pour la recette | Supervision, logs centralisés, alerting |
| **HTTPS** | Non | Certificat auto-signé | Certificat valide via reverse proxy |
| **Accès** | Développeur seul | Équipe + client (Ministère) | Public |

**Ressources à prévoir pour la production :** VM 2 vCPU / 4 Go RAM / 40 Go SSD, nom de domaine, certificat TLS, espace de sauvegarde, service de supervision, registre d'images Docker.

### Rôle de la CI dans le passage entre environnements

```
  Poste développeur          GitHub Actions              Serveurs
  -----------------          --------------              --------
  branche feature/*
        |
        | Pull Request
        v
                        tests + build + images
                                |
                                | merge dans develop
                                v
                                                    → environnement de TEST
                                                      (recette client)
                                |
                                | merge dans main + tag vX.Y.Z
                                v
                                                    → environnement de PRODUCTION
```

Chaque promotion d'un environnement à l'autre passe par une validation automatisée. Aucun code n'atteint un serveur sans avoir traversé les trois vérifications.
 
---

## 8. Commandes utiles

```bash
# État des services
docker compose ps
 
# Logs (tous, ou un service)
docker compose logs -f
docker compose logs backend --tail=50
 
# Ouvrir un shell dans un conteneur
docker compose exec backend bash
 
# Commande Symfony (toujours avec -u www-data)
docker compose exec -u www-data backend php bin/console cache:clear
docker compose exec -u www-data backend php bin/console debug:router
 
# Vérifier la base
docker compose exec db mysql -ucesizen -pcesizen -e "SHOW TABLES;" cesizen
 
# Reconstruire un seul service
docker compose up -d --build backend
 
# Tout arrêter (les données sont conservées)
docker compose down
 
# Tout arrêter ET effacer les données
docker compose down -v
```
 
---

## 9. Points d'attention avant la soutenance

- [ ] Démarrer Docker Desktop en avance
- [ ] Faire un test à froid : `docker compose down` puis `up -d --build` → tout doit fonctionner sans rattrapage manuel
- [ ] Chronométrer le démarrage pour savoir si la démo peut se faire en direct
- [ ] Préparer un jeu de données de démonstration (fixtures ou compte déjà créé)
- [ ] Garder ce document et les commandes curl ouverts dans un onglet
- [ ] Vérifier qu'aucun secret n'est versionné : `git ls-files | grep -E "^\.env$|jwt/"`
---

## 10. Questions probables du jury

**« Pourquoi Docker plutôt qu'une installation classique sur serveur ? »**
Reproductibilité, isolation des versions, et surtout la possibilité pour le Ministère de déléguer le déploiement : l'infrastructure est décrite dans des fichiers versionnés, pas dans une procédure manuelle.

**« Comment gérez-vous les secrets ? »**
Aucun secret dans l'image ni dans Git. Clés JWT générées à l'exécution, mots de passe injectés par variables d'environnement. En production, on passerait à un gestionnaire de secrets ou aux secrets Docker/Kubernetes.

**« Que se passe-t-il si le conteneur MySQL est supprimé ? »**
Les données survivent : elles sont dans un volume nommé, pas dans le conteneur. C'est ce volume qui est sauvegardé.

**« Comment passeriez-vous en production ? »**
Même `docker-compose.yml`, variables d'environnement différentes, un reverse proxy en frontal pour le HTTPS, images taguées et poussées sur un registre, déploiement déclenché par la CI sur un tag de version.

**« Votre chaîne est-elle de l'intégration continue ou du déploiement continu ? »**
De l'intégration continue : elle teste, compile et construit les images à chaque Pull Request. Le déploiement continu demanderait deux étapes de plus — pousser les images vers un registre et déclencher la mise à jour du serveur sur un tag de version. C'est un choix : en commande publique, la mise en production reste une décision humaine après recette.

**« Pourquoi construire les images alors que les tests suffisent ? »**
Parce que les deux couvrent des risques différents. Les tests valident le comportement du code ; le build vérifie que l'environnement est reproductible. Un `Dockerfile` peut casser sans qu'aucun test ne bouge — une dépendance système retirée, par exemple. Et le build ne s'exécute qu'après validation des tests, via `needs`.

**« Que se passe-t-il si un test échoue ? »**
La Pull Request affiche le check en rouge et le merge est bloqué par la règle de protection. Il faut corriger et repousser : la CI se relance automatiquement sur le nouveau commit.

**« Pourquoi générer les clés JWT dans la CI ? »**
Parce qu'elles ne sont pas versionnées — c'est volontaire, une clé privée n'a rien à faire dans un dépôt Git. Chaque exécution de CI génère donc sa propre paire, jetable, dans un environnement éphémère.

**« Pourquoi la protection de branche n'est-elle pas active ? »**
Elle est configurée, mais GitHub réserve les rulesets aux comptes payants sur les dépôts privés. Le dépôt reste privé parce que l'historique contient un ancien `.env` : le rendre public exposerait ces valeurs de façon permanente. En organisation Team ou sur GitLab, la règle serait effective.

**« Pourquoi 0 approbation requise sur les Pull Requests ? »**
Parce que je suis seule sur le projet et que GitHub interdit l'auto-approbation : exiger une revue rendrait tout merge impossible. En équipe, on passerait à 1 ou 2 revues obligatoires. Le passage par PR est conservé pour la traçabilité et pour servir de point de contrôle à la CI.

**« Un secret a été commité : que faites-vous ? »**
D'abord la rotation des identifiants — un secret exposé est compromis, le nettoyage de l'historique ne suffit pas. Ensuite seulement la réécriture d'historique si nécessaire. Et en préventif : `.env` ignoré, `.env.example` versionné, secrets injectés à l'exécution.

**« Pourquoi Apache pour le back et Nginx pour le front ? »**
Apache est le choix par défaut le mieux documenté pour Symfony avec `mod_php`. Nginx est plus léger et plus performant pour servir des fichiers statiques et jouer le rôle de proxy. Chaque conteneur utilise l'outil adapté à son usage.
 ****