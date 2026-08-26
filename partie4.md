# Partie 4 — Sécurisation et déploiement de CesiZen

Récapitulatif de ce qui est mis en place (ou reste à mettre en place) pour la partie
« Déployer et sécuriser les applications informatiques », en transposant à CesiZen la
démarche déjà éprouvée sur le projet BLOC4_CTGL_group (Spring Boot/Angular). Les principes
et la structure de pipeline sont génériques (n'importe quel framework) ; leur application
concrète ici passe par la stack réelle de CesiZen : **PHP 8.4 / Symfony / API Platform**
(backend, Apache), **React / Vite** (frontend, Nginx), **MySQL 8.0**, Docker Compose,
GitHub Actions.

**Convention** : chaque point cite le fichier concerné et son état — **[FAIT]** (vérifié dans
le code), **[EN COURS]** (modifié sur la branche `feature-security`, pas encore mergé) ou
**[À FAIRE]** (n'existe pas encore, proposé par analogie avec BLOC4_CTGL). Le détail de
l'audit (OWASP Top 10, matrice de risques) est dans `docs/securisation.md` ; ce document-ci
se concentre sur la chaîne CI/CD/Docker/déploiement.

---

## 0-2. Principes directeurs et patterns applicatifs

### 0. Principes directeurs (ANSSI — génériques, indépendants du framework)

1. **Défense en profondeur** : aucune vérification de sécurité ne doit reposer sur le seul
   frontend ou le seul réseau — tout est revérifié côté serveur.
2. **Moindre privilège** : chaque compte (BDD, conteneur, token CI) n'a que les droits
   strictement nécessaires.
3. **Sécurité par défaut** : toute nouvelle route est fermée par défaut, l'ouverture est
   l'exception explicite.
4. **Économie de mécanismes** : s'appuyer sur les mécanismes éprouvés du framework
   (Symfony Security, `password_hash`/Argon2id via Sodium) plutôt que réinventer de la
   cryptographie.
5. **Traçabilité** : toute action sensible (auth, admin) est journalisée.

### 1. Authentification

| Pattern générique | Instanciation CesiZen (PHP/Symfony) | État |
|---|---|---|
| Hachage de mot de passe résistant au GPU | `security.yaml` : algorithme `auto` → **Argon2id** (extension `sodium` présente dans l'image PHP, vérifié `php -m`) | **[FAIT]** |
| JWT signé, durée de vie courte | Lexik JWT, `token_ttl: 3600`, firewalls `login`/`api` stateless | **[FAIT]** |
| Rate limiting sur les routes d'auth | `symfony/rate-limiter` : `login_throttling` (5/min IP+email), `register_ip` (5/min) | **[FAIT]** |
| Contraintes de robustesse du mot de passe | `AuthController::register` (8 car. min, lettre+chiffre) | **[FAIT]** sur `/api/register` uniquement — **[À FAIRE]** l'étendre à `updateMe` et à la création admin |
| Compte désactivé bloqué à l'authentification | `Security/UserChecker.php::checkPreAuth` (`isActive`) | **[FAIT]** |

### 2. RBAC / anti-IDOR

- Hiérarchie `ROLE_USER < ROLE_REDACTOR < ROLE_ADMIN`, verrou générique
  `{ path: ^/api, roles: IS_AUTHENTICATED_FULLY }` en fin d'`access_control` — toute route
  oubliée reste protégée par défaut. **[FAIT]**
- Contrôle au niveau objet (pas seulement route) : `ApiResourceController::update/delete`
  vérifie `$isAdmin || $isAuthor` ; `ApiUserController::toggleActive/delete` empêche un
  admin de s'auto-désactiver. **[FAIT]**

### Anti-injection

- Accès BDD exclusivement via Doctrine ORM, aucune requête SQL concaténée trouvée dans
  `backend/src/Controller/`. **[FAIT]**
- Identifiants de route typés par injection d'entité Symfony (`Resource $resource` en
  paramètre), ce qui exclut l'injection SQL classique sur ce vecteur. **[FAIT]**

### Erreurs et journalisation

- `backend/config/packages/monolog.yaml` : erreurs journalisées en JSON structuré vers
  `stderr` en `prod` (exploitable directement par un collecteur de logs de conteneurs), codes
  404/405 exclus pour ne pas noyer les vraies anomalies. **[FAIT]**
- Mot de passe jamais renvoyé par l'API (vérifié dans les sérialisations manuelles). **[FAIT]**
- **[À FAIRE]** revue régulière des messages d'exception métier pour garantir qu'aucune
  donnée personnelle n'y transite involontairement (ex. erreur de validation Doctrine citant
  la valeur en cause).

### Transport (en-têtes, CORS)

- En-têtes de sécurité posés côté Apache (`backend/apache-vhost.conf`) et Nginx
  (`frontend/nginx.conf`) : `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`. **[FAIT]**
- CSP scindée : `default-src 'none'` sur l'API (JSON pur), exception ciblée `/api/docs`
  (Swagger UI) via `SetEnvIf Request_URI` + `Header ... env=`. **[FAIT]**
- CORS piloté par variable d'environnement `CORS_ALLOW_ORIGIN`
  (`nelmio_cors.yaml`), jamais de wildcard combiné à `allowCredentials`. **[FAIT]**

---

## 3-4. Détection de fuite de secrets et structure de la CI

### 3. Gitleaks — état actuel : **[À FAIRE]**

CesiZen n'a aujourd'hui **aucun scan de secrets en CI** (`.github/workflows/ci.yml` ne
contient pas de job dédié, contrairement à BLOC4_CTGL). C'est d'autant plus nécessaire ici
qu'un secret (`JWT_PASSPHRASE`) a réellement fuité dans l'historique du dépôt (voir
`docs/securisation.md` §5) — cas d'usage exact que Gitleaks est censé prévenir à l'avenir.

Transposition proposée du modèle BLOC4_CTGL (`.github/workflows/ci.yml` job `secrets-scan` +
`.gitleaksignore`) :

```yaml
secrets-scan:
  name: Secrets (Gitleaks)
  runs-on: ubuntu-latest
  permissions:
    contents: read
    pull-requests: read   # l'action lit le diff de la PR via l'API
  steps:
    - uses: actions/checkout@v4
      with: { fetch-depth: 0 }
    - uses: gitleaks/gitleaks-action@v2
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Principe de l'acquittement par **empreinte exacte** (`.gitleaksignore`, format
`<sha_du_commit>:<chemin>:<règle>:<ligne>`) plutôt que par chemin ou par règle : une
empreinte n'acquitte qu'*une occurrence précise dans un commit précis* — toute nouvelle
fuite dans le même fichier reste détectée. À utiliser pour acquitter la ligne historique de
`JWT_PASSPHRASE` déjà traitée par rotation (secret changé, ancienne valeur sans valeur
opérationnelle mais toujours lisible dans `git log`).

### 4. Structure de la CI — jobs parallèles, ce qui bloque vs ce qui reste en rapport

État actuel (`.github/workflows/ci.yml`) :

| Job | Rôle | Parallèle avec | Bloquant |
|---|---|---|---|
| `tests-backend` | 54 tests PHPUnit + `composer audit --no-dev` | `code-quality`, `build-frontend` | **Oui** — un avis de sécurité `composer audit` fait échouer la CI |
| `code-quality` | PHPStan, PHP-CS-Fixer, PHPMD, PHPCPD via l'image `jakzal/phpqa` | `tests-backend`, `build-frontend` | **Oui** — voir détail ci-dessous |
| `build-frontend` | `npm ci` + `npm run build` | `tests-backend`, `code-quality` | Oui (échec de build) |
| `build-images` | `docker build` backend + frontend | — (`needs: [tests-backend, code-quality, build-frontend]`) | Oui, mais ne publie rien |

**[FAIT]** — `code-quality` (`.github/workflows/ci.yml`), ajouté sur ce même chantier :
quatre outils packagés dans une seule image Docker (`jakzal/phpqa:php8.4`), sans dépendance
Composer supplémentaire à maintenir dans `composer.json` :

| Outil | Config | Seuil retenu | Justification |
|---|---|---|---|
| PHPStan | `backend/phpstan.neon` | niveau **3** | Seul niveau propre sur le code actuel sans dépendance ajoutée. Le niveau 4 introduit un faux positif classique sur les entités Doctrine (`property.unusedType` sur `$id`, jamais assigné directement — géré par réflexion) : nécessite l'extension `phpstan/phpstan-doctrine`, non ajoutée ici pour ne pas alourdir `composer.json` sur ce chantier. **[À FAIRE]** montée de niveau progressive une fois cette extension ajoutée. |
| PHP-CS-Fixer | `backend/.php-cs-fixer.php` | `@PSR12` | Style de code standard, pas de règle projet supplémentaire. 8 fichiers ont été reformatés (accolades sur les `if` en une ligne, espacement `fn ($x)`) pour partir d'une base propre — vérifié par les 54 tests PHPUnit rejoués après coup, aucune régression. |
| PHPMD | `backend/phpmd.xml` | rulesets `cleancode` (sans `StaticAccess`), `codesize` (seuils `CyclomaticComplexity`=12, `NPathComplexity`=450), `controversial`, `design`, `unusedcode` — `naming` exclu en bloc | Le ruleset `naming` par défaut (ex. `ShortVariable`) signale `$id`/`$em` comme trop courts alors que ce sont des conventions Symfony/Doctrine du projet entier ; `StaticAccess` est exclu car le socle EasyAdmin impose des appels statiques par conception. Les seuils de complexité par défaut (10/200) auraient forcé un découpage artificiel des contrôleurs `update()`/`updateMe()`, qui enchaînent des `if (isset(...))` indépendants — complexité mesurée élevée, lisibilité réelle inchangée. Deux violations réelles corrigées avant activation : un `else` évitable (`ApiResourceController::toggleFavorite`) et un import manquant (`SecurityController`). |
| PHPCPD | — (défaut) | — | Aucun code dupliqué détecté sur `src/`, pas de configuration nécessaire. |

Écarts restants vs le modèle BLOC4_CTGL, à transposer :

- **[À FAIRE]** `secrets-scan` (Gitleaks) en job parallèle indépendant — voir §3.
- **[À FAIRE]** `npm audit --audit-level=high` côté frontend, absent aujourd'hui alors que
  `composer audit` est déjà bloquant côté backend (`docs/securisation.md` le signale déjà
  comme reste exposé sur A06).
- **Décision à prendre, par analogie avec BLOC4_CTGL** : un scan de dépendances lourd
  (type OWASP Dependency-Check) mérite d'être **non bloquant** (rapport seul, artifact
  archivé) s'il dépend d'un service externe instable (NVD) — la même logique s'applique à
  `npm audit` si son verdict dépend de paquets non montables en version sans casser
  l'appli (ex. dépendance de dev obsolète sans correctif) : documenter le compromis plutôt
  que rendre la CI rouge en permanence et donc ignorée.
- `permissions:` du workflow à restreindre explicitement (`contents: read`) — **[À FAIRE]**,
  absent du `ci.yml` actuel.

---

## 5. Logique de CD (Continuous Delivery, pas Deployment)

**État actuel : [À FAIRE]** — aucun `cd.yml` n'existe dans `.github/workflows/`. Le job
`build-images` de `ci.yml` construit les images mais ne les publie nulle part
(`docs/securisation.md`, section 1/CI, le note déjà : « la CI valide et construit, mais ne
déploie pas »).

Transposition du modèle BLOC4_CTGL — distinction à assumer explicitement :

- **Continuous Delivery** (ce qu'on met en place) : chaque push sur `main` amène des images
  **prêtes à déployer** — construites, scannées, publiées sur un registre, taguées par le
  SHA du commit. Le déclenchement de la mise en production reste un geste humain
  (`./deploy.sh <sha>`).
- **Continuous Deployment** (ce qu'on ne fait pas, faute de VPS/runner auto-hébergé
  disponible) : la publication d'image déclencherait automatiquement le déploiement. Écarté
  pour la même raison que dans BLOC4_CTGL — un runner GitHub est éphémère, il n'y a rien à
  cibler en SSH sans machine hôte persistante dédiée au projet.

Points structurants du `cd.yml` à transposer :

1. **Tag par SHA immuable** en plus d'un tag mouvant (`latest` sur `main` uniquement) :
   `ghcr.io/<owner>/cesizen-backend:${{ github.sha }}` — c'est ce tag précis, jamais
   `latest`, qui est déployé et qui sert de point de rollback.
2. **Scan Trivy bloquant avant publication** (`exit-code: 1` sur `CRITICAL,HIGH`,
   `ignore-unfixed: true` pour ne pas bloquer sur des CVE sans correctif des images de base
   `php:8.4-apache`/`nginx:alpine`) — une image vulnérable ne doit jamais atteindre le
   registre.
3. **Résumé de run** (`GITHUB_STEP_SUMMARY`) affichant la commande exacte de déploiement —
   passage de relais explicite entre le pipeline et l'humain qui déclenche la mise en
   production.

---

## 6. Conteneurisation Docker

| Pratique | BLOC4_CTGL | CesiZen aujourd'hui | État |
|---|---|---|---|
| Multi-stage build | Backend (Maven→JRE) et frontend (Node→Nginx) | Frontend uniquement (`frontend/Dockerfile` : Node build → `nginx:alpine`) ; le backend PHP n'a pas d'étape de compilation à isoler (pas de build step Composer à exclure du runtime au même sens qu'un JAR) | **[FAIT]** côté pertinent |
| Utilisateur non-root | `USER app` (backend), `nginx-unprivileged` (frontend) | Aucun `USER` dans `backend/Dockerfile` ni `frontend/Dockerfile` — les deux images tournent en root par défaut | **[À FAIRE]** |
| `.dockerignore` excluant secrets/VCS | `.git`, `.env`, `vendor`, `var`, `config/jwt`, `tests` | Identique, déjà corrigé (`backend/.dockerignore`, `frontend/.dockerignore`) — incident du fichier mal nommé (`dockerignore` sans point) documenté et corrigé dans `docs/securisation.md` §1/A05 | **[FAIT]** |
| Segmentation réseau (DB jamais exposée à Internet) | réseau `back` Docker `internal: true`, aucun `ports:` sur MySQL | `docker-compose.yml` publie `"3307:3306"` sur l'hôte — MySQL est donc joignable depuis la machine hôte (pas depuis Internet en soi, mais hors du principe « aucun port publié ») | **[À FAIRE]** en profil production (garder le port ouvert reste défendable en local pour un accès direct à un client SQL) |
| Healthchecks en chaîne | `db` → `backend` (`depends_on: condition: service_healthy`) → `frontend`/proxy | Seul `db` a un `healthcheck` (`mysqladmin ping`) ; `backend` en dépend (`condition: service_healthy`) mais `backend` lui-même n'a pas de healthcheck, donc `frontend` ne peut pas attendre un backend réellement prêt | **[À FAIRE]** ajouter un healthcheck HTTP sur le backend (ex. `curl`/`wget` sur une route légère) |

Transposition proposée pour le non-root (backend PHP/Apache) :

```dockerfile
# après l'installation des dépendances et le chown existant
# Apache lui-même doit démarrer root pour se binder sur le port 80 puis
# dropper ses privilèges vers www-data pour les workers — c'est déjà son
# comportement par défaut (mod_unixd). Le gain principal ici est de
# s'assurer qu'aucun autre process du conteneur (cron, shell de debug)
# n'hérite silencieusement de root.
```

Pour Nginx (frontend), l'équivalent direct du `nginx-unprivileged` de BLOC4_CTGL est
transposable tel quel : `FROM nginxinc/nginx-unprivileged:alpine`, écoute sur 8080 au lieu
de 80, utilisateur non-root par construction de l'image — changement mécanique, sans logique
métier à adapter.

---

## 7. Garde-fous minimaux d'un script de déploiement

**État actuel : [À FAIRE]** — CesiZen n'a pas de `deploy.sh` ; le déploiement documenté dans
`deploiement-cesizen.md` reste `docker compose up -d --build` manuel, sans les garde-fous
ci-dessous.

Les trois garde-fous non négociables du `deploy.sh` de BLOC4_CTGL, transposables tels quels
(la logique ne dépend pas du framework applicatif, seulement de Docker Compose + MySQL) :

1. **Refus d'un secret par défaut** : si `.env` contient encore une valeur d'exemple
   (`APP_SECRET=a_changer_avant_la_prod`, constat déjà fait dans
   `docs/securisation.md` §5) ou `DB_PASSWORD`/`JWT_PASSPHRASE` vide, le script s'arrête
   avant de démarrer quoi que ce soit :
   ```bash
   grep -qE '^APP_SECRET=(a_changer_avant_la_prod|changeme)?$' .env && {
     echo "ERREUR : APP_SECRET est vide ou vaut la valeur d'exemple." >&2
     exit 1
   }
   ```
2. **Sauvegarde avant toute migration** : `docker compose up -d --wait db`, puis
   `mysqldump --single-transaction` de la base **avant** d'exécuter
   `doctrine:migrations:migrate`. Distinguer première installation (base vide, rien à
   sauvegarder) d'un échec de sauvegarde réel (base non vide, dump vide ou en erreur → on
   s'arrête, migrer sans filet est irréversible).
3. **Vérification de santé post-déploiement** : `curl --fail` sur une route de santé du
   backend après le redémarrage des conteneurs, avant de considérer le déploiement réussi —
   suppose d'ajouter d'abord la route/healthcheck mentionné en §6.

---

## 8. Séparation TLS test-local vs production

**État : [FAIT]** sur `feature-security` :

- `frontend/nginx.conf` : bloc `server { listen 443 ssl; ... }` avec
  `ssl_certificate /etc/nginx/certs/localhost.pem`.
- `docker-compose.yml` : montage `./frontend/certs:/etc/nginx/certs:ro`, seul le port
  `3443:443` est publié sur l'hôte — le port 80 (HTTP en clair) n'est **plus exposé du tout**,
  contrairement à un premier essai qui l'avait laissé accessible en parallèle sur `3000`.
  Choix assumé : pour ce projet, l'accès local passe uniquement par HTTPS, pas par un HTTP en
  clair laissé disponible « en plus ».
- `.gitignore` : ajout de `frontend/certs/` — les certificats ne sont jamais commités.

Différence avec le modèle BLOC4_CTGL à considérer avant de finaliser : leur approche
(`docker/nginx-local-tls/entrypoint.sh`) **génère le certificat auto-signé au démarrage du
conteneur** (`openssl req -x509 ... -subj "/CN=localhost"`) plutôt que de dépendre d'un
dossier `certs/` produit manuellement sur la machine hôte (ex. via `mkcert`) et monté en
volume. Avantage de leur variante : zéro prérequis sur le poste de dev (pas d'outil externe
à installer), le certificat est reproductible et jetable — recréé au premier démarrage si le
volume ne le contient pas déjà. Ils l'isolent en plus dans un **service Compose optionnel**
séparé (`docker-compose.https.yml` en overlay, `docker compose -f docker-compose.yml -f
docker-compose.https.yml up nginx-tls`) plutôt que de modifier le service `frontend` par
défaut — ce qui évite qu'un TLS de test local devienne accidentellement le comportement par
défaut de `docker compose up`.

**Ce que ce document recommande** : documenter explicitement, à côté du bloc TLS ajouté dans
`frontend/nginx.conf`, que ce certificat est **auto-signé, pour test local uniquement** —
exactement le commentaire que porte le `Dockerfile` de BLOC4_CTGL
(`docker/nginx-local-tls/Dockerfile:1-2`). Pour la production, la terminaison TLS reste
**hors de ce conteneur** : reverse proxy dédié (ou service managé) avec un certificat
Let's Encrypt réel — c'est déjà le point noté comme *risque #1, criticité Élevée* dans la
matrice de `docs/securisation.md` §2, non résolu par le TLS de test local en cours d'ajout
ici.

---

## 9. Gouvernance documentaire

Chaîne **analyse de risques → règles → checklist PR**, telle qu'appliquée dans BLOC4_CTGL
(`Analyse_Risques_EBIOS_RM.md` → `SECURISATION.md`/`Claude.md` → grille de revue), transposée
à l'état actuel de CesiZen :

| Maillon | BLOC4_CTGL | CesiZen | État |
|---|---|---|---|
| Analyse de risques | `docs/Analyse_Risques_EBIOS_RM.md` (méthode EBIOS RM) | `docs/securisation.md` §1-2 (OWASP Top 10 + matrice probabilité/impact/criticité) — méthode différente (OWASP plutôt qu'EBIOS RM) mais même fonction | **[FAIT]**, méthode alternative assumée |
| Règles opposables (pour humains et pour un agent IA) | `docs/SECURISATION.md` (règles non négociables) + `docs/Claude.md` (contexte projet, stack, anti-patterns à refuser) | Aucun équivalent — `docs/securisation.md` est un audit narratif, pas un jeu de règles courtes et actionnables | **[À FAIRE]** |
| Checklist obligatoire avant PR | `SECURISATION.md` §10 (secrets, `@PreAuthorize`, SQL, sanitization, logs, dépendances, migrations, profil prod) | Absente du dépôt (pas de `PULL_REQUEST_TEMPLATE.md`, pas de section checklist dans `.github/`) | **[À FAIRE]** |
| Traçabilité règle ↔ risque | `SECURISATION.md` §11 (tableau règle → scénario EBIOS → mesure du PACS) | Chaque section de `docs/securisation.md` cite déjà le fichier concerné (convention explicite en tête de document) — traçabilité **inverse** (du constat vers le code) plutôt que règle → risque | Fonction équivalente assurée différemment |

**Proposition concrète transposable directement** : extraire de `docs/securisation.md` les
points marqués « à faire » en une checklist courte (`.github/PULL_REQUEST_TEMPLATE.md`),
sur le modèle de `SECURISATION.md` §10 — ex. « Aucun secret dans le diff (`gitleaks`
passe) », « Nouvel endpoint : rôle vérifié + tests d'autorisation », « Aucune requête SQL
concaténée », « Migration Doctrine rétro-compatible », « Comportement vérifié en profil
`prod` ».

---

## Tableau d'équivalences par framework

Pour transposer rapidement un pattern de sécurité d'un stack à un autre — colonne
**PHP/Symfony** = ce qui existe réellement dans CesiZen aujourd'hui, les trois autres
colonnes sont la référence de transposition rapide.

| Pattern | PHP/Symfony (CesiZen) | Java/Spring | Node/Express | Python/Django |
|---|---|---|---|---|
| Hachage mot de passe | `security.yaml` `'auto'` → Argon2id (ext. `sodium`) | `PasswordEncoder` BCrypt (facteur 12) | `argon2`/`bcrypt` npm, jamais `crypto.createHash` seul | `django.contrib.auth.hashers` (PBKDF2/Argon2 par défaut) |
| Auth stateless | Lexik JWT Bundle, firewall `stateless: true` | jjwt + filtre `OncePerRequestFilter` | `jsonwebtoken` + middleware | `djangorestframework-simplejwt` |
| RBAC déclaratif | `#[IsGranted('ROLE_ADMIN')]` + `access_control` deny-by-default | `@PreAuthorize` + `anyRequest().authenticated()` | middleware `requireRole()` sur chaque route | `permission_classes` DRF / `@login_required` |
| Anti-injection SQL | Doctrine ORM/DQL, paramètres bindés | Spring Data JPA/JPQL | ORM (Prisma/Sequelize) ou requêtes paramétrées (`?`) | Django ORM, jamais `.raw()` non paramétré |
| Validation des entrées | `#[Assert\...]` sur l'entité/DTO | Bean Validation `@Valid`/`@NotBlank` | `zod`/`joi` sur le body | Serializers DRF / `forms.Form` |
| Sanitization contenu riche | À ajouter si contenu HTML utilisateur (absent du périmètre actuel) | OWASP Java HTML Sanitizer | `DOMPurify` (côté serveur via `jsdom`) | `bleach` |
| Migrations de schéma | Doctrine Migrations (`migrations/`) | Flyway (`V<n>__description.sql`) | Prisma Migrate / Knex | Django Migrations |
| Scan de secrets CI | Gitleaks (à ajouter, §3) | Gitleaks | Gitleaks / `trufflehog` | Gitleaks / `detect-secrets` |
| Audit de dépendances | `composer audit` (déjà bloquant) + `npm audit` (à ajouter) | OWASP Dependency-Check | `npm audit` | `pip-audit` |
| Image runtime non-root | À ajouter (`USER`, §6) | `USER app` (adduser dédié) | `node:alpine` + `USER node` | `USER django` (adduser dédié) |
| Scan d'image avant publication | Trivy (à ajouter en CD, §5) | Trivy | Trivy | Trivy |
