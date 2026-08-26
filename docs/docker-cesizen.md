# Conteneurisation Docker — concepts et archive du dispositif retiré

**Statut au 2026-08-26 : la conteneurisation Docker a été retirée du dépôt actif** (suppression de
`docker-compose.yml`, `backend/Dockerfile`, `backend/compose.yaml`, `frontend/Dockerfile`). Le
déploiement courant est décrit sans Docker dans `docs/deploiement-cesizen.md`.

Ce document a deux objectifs :
1. Expliquer les concepts de base (image, conteneur, `Dockerfile`, `docker-compose`) pour qui n'est
   pas familier avec l'outil — utile en soutenance ou en relecture.
2. Archiver la description de l'architecture conteneurisée qui avait été mise en place sur ce
   projet, avec les choix techniques et les problèmes résolus à l'époque — pour ne pas perdre ce
   travail, et servir de base directe si la conteneurisation est réintroduite plus tard.

Fichiers de configuration serveur encore présents dans le dépôt mais **orphelins** (plus copiés
dans aucune image, plus utilisés par rien) : `backend/apache-vhost.conf`, `frontend/nginx.conf`,
`backend/.dockerignore`, `frontend/.dockerignore`. Ils sont volontairement conservés car
directement réutilisables — voir §5.

---

## 1. Concepts de base

| Terme | Définition |
|---|---|
| **Image** | Un gabarit figé et versionné : système de fichiers + dépendances + code, empaqueté une fois pour toutes. Ne change pas une fois construite. |
| **Conteneur** | Une instance en cours d'exécution d'une image — un processus isolé (son propre système de fichiers, réseau, dépendances) qui tourne sur le noyau de la machine hôte, sans virtualiser un OS complet (contrairement à une VM). |
| **`Dockerfile`** | La recette qui décrit comment construire une image : à partir de quelle image de base, quelles dépendances installer, quels fichiers copier, quelle commande lancer au démarrage. |
| **`docker-compose.yml`** | Décrit un groupe de conteneurs qui doivent fonctionner ensemble (ici : frontend, backend, base de données), leur réseau commun, leurs volumes, leur ordre de démarrage. Une seule commande (`docker compose up`) démarre tout l'ensemble. |
| **Volume** | Un espace de stockage qui survit à la suppression du conteneur. Sans volume, tout ce qu'un conteneur écrit disparaît quand il est détruit. |
| **Réseau Docker Compose** | Un réseau interne créé automatiquement, où chaque service est joignable par son nom (`db`, `backend`) plutôt que par une IP — c'est pourquoi une chaîne de connexion pointait vers `mysql://cesizen:cesizen@db:3306/...` et non vers `localhost`. |
| **Healthcheck** | Une commande que Docker exécute périodiquement dans un conteneur pour savoir s'il est réellement prêt (pas juste démarré) — utilisé ici pour empêcher le backend de démarrer avant que MySQL accepte des connexions. |
| **Build multi-étapes (`multi-stage build`)** | Un `Dockerfile` qui utilise plusieurs images successives : une pour compiler/construire, une autre — plus légère — pour exécuter le résultat. L'image finale ne contient pas les outils de compilation. |

**Pourquoi conteneuriser** : reproductibilité (le même environnement du poste de dev à la
production, élimine le « ça marche chez moi »), isolation de version (PHP/MySQL figés
indépendamment de ce qui est installé sur la machine hôte), portabilité (les mêmes fichiers
fonctionnent sur n'importe quel serveur qui a Docker).

---

## 2. Architecture qui avait été mise en place sur CesiZen

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

Trois conteneurs isolés reliés par le réseau interne créé automatiquement par Docker Compose.

### Rôle de chaque fichier (tel qu'il existait avant suppression)

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | Orchestration des 3 services, réseau, volumes, ordre de démarrage |
| `backend/Dockerfile` | Image PHP 8.4 + Apache + extensions + dépendances Composer |
| `backend/apache-vhost.conf` *(encore présent)* | Vhost Apache : `DocumentRoot` sur `public/` + `FallbackResource`, en-têtes de sécurité HTTP |
| `backend/.dockerignore` *(encore présent)* | Exclut `vendor`, `var`, `.env`, `config/jwt` de l'image |
| `frontend/Dockerfile` | Build multi-étapes : Node compile, Nginx sert |
| `frontend/nginx.conf` *(encore présent)* | Routage SPA + proxy `/api` vers le backend, en-têtes de sécurité HTTP |
| `frontend/.dockerignore` *(encore présent)* | Exclut `node_modules`, `dist`, `.env` |

---

## 3. Choix techniques et justifications

### 3.1 Build multi-étapes du frontend

Le `Dockerfile` React comportait deux étapes : une image Node qui compile, puis une image Nginx
qui ne reçoit que le résultat (`dist`). **Bénéfice** : l'image finale ne contient ni Node, ni
`node_modules`, ni le code source — plusieurs centaines de Mo économisés, et surface d'attaque
réduite (moins de code embarqué).

### 3.2 Le proxy Nginx vers `/api`

Nginx relayait les appels `/api` vers le conteneur backend :
- **Pas de problème CORS** : pour le navigateur, tout vient de la même origine.
- **Un seul port exposé** en production : le backend n'a pas besoin d'être accessible publiquement.
- **Configuration React inchangée** entre environnements : `VITE_API_URL` reste vide, appels relatifs.
> Point technique à retenir : les variables Vite (`VITE_*`) sont injectées **au moment du build**,
> pas à l'exécution. Changer une variable impose de reconstruire l'image — ce point reste vrai même
> sans Docker, voir `docs/deploiement-cesizen.md`.

### 3.3 Le healthcheck sur MySQL

```yaml
depends_on:
  db:
    condition: service_healthy
```

Sans cela, Symfony démarre avant que MySQL accepte les connexions et plante. Le healthcheck
interroge MySQL toutes les 5 secondes ; le backend n'est lancé qu'une fois la base réellement
prête.

### 3.4 Le volume nommé `db_data`

Les données MySQL étaient stockées dans un volume Docker, pas dans le conteneur : reconstruire ou
supprimer le conteneur ne détruit pas les données. En production, ce volume est la cible naturelle
des sauvegardes.

### 3.5 Gestion des secrets en environnement conteneurisé

N'étaient **ni dans l'image Docker, ni dans Git** : les clés JWT (générées à l'exécution dans le
conteneur), le fichier `.env` et les mots de passe, `APP_SECRET`. Injectés par variables
d'environnement au lancement du conteneur — c'est la bonne pratique attendue, un secret commité
dans Git restant dans l'historique même après suppression du fichier. Ce principe reste
intégralement valable dans le déploiement actuel sans Docker (voir `docs/securite-cesizen.md` §1).

---

## 4. Problèmes rencontrés et résolus à l'époque (matériau utile en soutenance)

### 4.1 404 sur toutes les routes sauf `/`

**Symptôme** : `/` répondait, `/api` renvoyait un 404 brut d'Apache.
**Cause** : `backend/public/.htaccess` n'était pas versionné et le vhost Apache ne comportait
aucune directive redirigeant les URL inconnues vers le contrôleur frontal.
**Solution** : `backend/apache-vhost.conf` avec la directive recommandée par Symfony :

```apache
<Directory /var/www/html/public>
    AllowOverride All
    Require all granted
    FallbackResource /index.php
</Directory>
```

Meilleur qu'un `.htaccess` : configuration versionnée, lue une seule fois au démarrage d'Apache
plutôt qu'à chaque requête.

### 4.2 Erreur 500 — permission denied sur le cache

**Symptôme** : `Cannot rename ... /var/www/html/var/cache/prod/.../: Permission denied`.
**Cause** : Apache s'exécute sous l'utilisateur `www-data`, mais les commandes lancées via
`docker compose exec` le sont en `root` — un `cache:clear` en root crée des fichiers que
`www-data` ne peut plus écrire.
**Solution** : exécuter les commandes Symfony sous le bon utilisateur
(`docker compose exec -u www-data backend php bin/console <commande>`) et préchauffer le cache
pendant le build, suivi d'un `chown -R www-data:www-data var config/jwt`.

### 4.3 Clés JWT absentes du conteneur

`config/jwt` étant volontairement exclu de l'image (secret), les clés devaient être générées dans
le conteneur au premier démarrage :

```bash
docker compose exec backend php bin/console lexik:jwt:generate-keypair --skip-if-exists
docker compose exec backend chown -R www-data:www-data config/jwt
```

Contrainte assumée : garantit que les clés privées ne circulent jamais dans une image ou un dépôt
Git — le même principe est appliqué aujourd'hui côté CI (génération des clés à chaque exécution,
voir `docs/deploiement-cesizen.md` §2).

---

## 5. Si la conteneurisation est réintroduite un jour

Base de travail directement réutilisable :
- `backend/apache-vhost.conf` et `frontend/nginx.conf` décrivent déjà la configuration serveur
  attendue (routage SPA, proxy `/api`, en-têtes de sécurité HTTP) — à recopier tels quels dans de
  nouveaux `Dockerfile`.
- `backend/.dockerignore` et `frontend/.dockerignore` définissent déjà les exclusions correctes
  (secrets, dépendances, code source superflu).
- Les choix d'architecture (§2-§3) et les problèmes déjà résolus (§4) évitent de refaire le même
  travail de mise au point.

Ce qui manquerait à reconstruire : les `Dockerfile` backend et frontend eux-mêmes, et le
`docker-compose.yml` d'orchestration.
