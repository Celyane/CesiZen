# Conteneurisation Docker — architecture et fonctionnement

**Statut au 2026-08-26 : la conteneurisation Docker est le mode de déploiement retenu pour
CesiZen.** Trois conteneurs (frontend Nginx, backend Apache, base MySQL) orchestrés par
`docker-compose.yml`, vérifiés par un build complet et un démarrage réel de la stack (`docker
compose build && docker compose up`, HTTPS testé, communication inter-conteneurs testée, isolation
réseau testée).

Ce document explique les concepts de base pour qui n'est pas familier avec Docker, puis détaille
l'architecture réellement en place : les choix techniques, pourquoi chacun a été fait, et les
problèmes déjà rencontrés et résolus pendant sa mise au point.

---

## 1. Concepts de base

| Terme | Définition |
|---|---|
| **Image** | Un gabarit figé et versionné : système de fichiers + dépendances + code, empaqueté une fois pour toutes. Ne change pas une fois construite. |
| **Conteneur** | Une instance en cours d'exécution d'une image — un processus isolé (son propre système de fichiers, réseau, dépendances) qui tourne sur le noyau de la machine hôte, sans virtualiser un OS complet (contrairement à une VM). |
| **`Dockerfile`** | La recette qui décrit comment construire une image : à partir de quelle image de base, quelles dépendances installer, quels fichiers copier, quelle commande lancer au démarrage. |
| **`docker-compose.yml`** | Décrit un groupe de conteneurs qui doivent fonctionner ensemble (ici : frontend, backend, base de données), leur réseau commun, leurs volumes, leur ordre de démarrage. Une seule commande (`docker compose up`) démarre tout l'ensemble. |
| **Volume** | Un espace de stockage qui survit à la suppression du conteneur. Sans volume, tout ce qu'un conteneur écrit disparaît quand il est détruit. |
| **Réseau Docker Compose** | Un réseau interne créé automatiquement, où chaque service est joignable par son nom (`db`, `backend`) plutôt que par une IP. |
| **Healthcheck** | Une commande que Docker exécute périodiquement dans un conteneur pour savoir s'il est réellement prêt (pas juste démarré). |
| **Build multi-étapes (`multi-stage build`)** | Un `Dockerfile` qui utilise plusieurs images successives : une pour compiler/construire, une autre — plus légère — pour exécuter le résultat. L'image finale ne contient pas les outils de compilation. |

**Pourquoi conteneuriser** : reproductibilité (le même environnement du poste de dev à la
production, élimine le « ça marche chez moi »), isolation de version (PHP/MySQL figés
indépendamment de ce qui est installé sur la machine hôte), portabilité (les mêmes fichiers
fonctionnent sur n'importe quel serveur qui a Docker).

---

## 2. Architecture

```
        Navigateur
             |
             v (HTTPS, certificat auto-signé)
   [ frontend ]  Nginx non-root, localhost:3443 -> 8443
      |  sert le build React (fichiers statiques)
      |  relaie /api  ------------------>  [ backend ]  Apache + PHP 8.4, localhost:8080 -> 8080
      |                                          |  Symfony 8 + API Platform + JWT
      |                                          v
      |                                    [ db ]  MySQL 8.0 — AUCUN port publié sur l'hôte
      |                                          |
      |                                    volume nommé db_data (persistance)
      |
   réseau "front" (frontend + backend)
                                          réseau "back" (backend + db, internal:true)
```

**Deux réseaux Docker distincts**, pas un seul :
- `front` : relie frontend et backend. Le frontend peut appeler le backend par son nom (`http://backend:8080`).
- `back` : relie backend et db, déclaré `internal: true` — **aucun trafic ne peut sortir de ce
  réseau vers l'extérieur**, et le frontend n'en fait pas partie. Le frontend ne peut donc
  physiquement pas atteindre la base de données, même s'il essayait (vérifié : une requête du
  conteneur frontend vers `db:3306` échoue avec *bad address*, le nom n'est même pas résolu).

**Exposition minimale sur l'hôte** — seuls deux ports sont publiés, et uniquement sur les
interfaces de boucle locale `127.0.0.1` et `::1` (jamais `0.0.0.0`, jamais accessible depuis le
réseau). Les deux sont publiées explicitement pour que `localhost` fonctionne quelle que soit la
résolution DNS locale (certains systèmes résolvent `localhost` en IPv6 `::1` en priorité) :
- `localhost:3443` → frontend (HTTPS) : le seul point d'entrée pensé pour un usage normal.
- `localhost:8080` → backend (HTTP) : accès direct à l'API depuis la machine hôte uniquement,
  utile pour du test manuel (Swagger, `curl`) sans jamais être joignable depuis l'extérieur.

**La base de données ne publie aucun port.** Elle n'est joignable ni depuis l'hôte, ni depuis
Internet — seul le conteneur `backend`, sur le réseau interne `back`, peut s'y connecter. Vérifié
par un test de connexion direct depuis l'hôte sur le port MySQL.

### Rôle de chaque fichier

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | Orchestration des 3 services, réseaux `front`/`back`, volume, ordre de démarrage, exposition minimale des ports |
| `backend/Dockerfile` | Build 2 étapes : dépendances Composer isolées, puis image PHP 8.4 + Apache, exécutée en utilisateur non-root `www-data` |
| `backend/apache-vhost.conf` | Vhost Apache sur le port non privilégié 8080, `FallbackResource` vers `index.php`, en-têtes de sécurité HTTP (CSP, HSTS, etc.) |
| `backend/docker-entrypoint.sh` | Génère la paire de clés JWT au premier démarrage si elle est absente (elle n'est jamais dans l'image) |
| `backend/.dockerignore` | Exclut `.git`, `.env`/`.env.*.local`, `vendor`, `var`, `config/jwt`, `tests` du contexte de build |
| `frontend/Dockerfile` | Build multi-étapes : Node compile le build React, puis image Nginx non-root (`nginxinc/nginx-unprivileged`) qui ne sert que le résultat |
| `frontend/nginx.conf` | Deux blocs `server` : HTTP interne (8080, non publié) et HTTPS (8443, seul publié), proxy `/api` vers le backend, en-têtes de sécurité HTTP |
| `frontend/.dockerignore` | Exclut `node_modules`, `dist`, `.env`, `.git` |
| `frontend/certs/` | Certificat auto-signé local (`localhost.pem`/`localhost-key.pem`), monté en lecture seule dans le conteneur frontend |

---

## 3. Choix techniques et justifications

### 3.1 Réseau segmenté plutôt qu'un réseau unique

Séparer `front` et `back` (ce dernier `internal: true`) applique le principe de moindre
privilège au niveau réseau : même si le conteneur frontend était compromis, il n'a **aucun accès
réseau** à la base de données — pas de route, pas de résolution DNS du nom `db`. Seul le backend,
qui a un besoin légitime, est sur les deux réseaux à la fois.

### 3.2 Utilisateurs non-root des deux côtés

- Backend : bascule vers `www-data` (déjà l'utilisateur par défaut d'Apache) après avoir donné les
  droits nécessaires sur `var/`, `config/jwt/` et les répertoires de logs/PID Apache.
- Frontend : image `nginxinc/nginx-unprivileged`, tourne en UID 101 (jamais root), y compris
  pendant la mise à jour des paquets système (`apk upgrade` en root le temps de la commande
  uniquement, puis retour en 101).

`security_opt: ["no-new-privileges:true"]` sur `backend` et `frontend` dans `docker-compose.yml`
interdit à tout processus du conteneur d'obtenir plus de privilèges qu'il n'en a au démarrage
(protection contre l'exploitation d'un setuid binaire, par exemple).

### 3.3 Build multi-étapes du frontend

Le `Dockerfile` React comporte deux étapes : une image Node qui compile, puis une image Nginx qui
ne reçoit que le résultat (`dist`). **Bénéfice** : l'image finale ne contient ni Node, ni
`node_modules`, ni le code source — surface d'attaque réduite, image plus légère.

### 3.4 HTTPS local et sa limite assumée

Le frontend sert en HTTPS sur le port publié (certificat auto-signé, `frontend/certs/`, jamais
commité). `Strict-Transport-Security` et le reste des en-têtes de sécurité sont posés sur ce bloc.
**Limite assumée** : un certificat auto-signé est valable pour du test local, pas pour un vrai
déploiement public — un navigateur affichera un avertissement de sécurité tant qu'il n'est pas
remplacé par un certificat de confiance (Let's Encrypt ou équivalent) au moment d'un déploiement
réel, typiquement via un reverse proxy en amont plutôt que dans ce conteneur.

### 3.5 Le proxy Nginx vers `/api`

Nginx relaie les appels `/api` vers le conteneur backend :
- **Pas de problème CORS** : pour le navigateur, tout vient de la même origine.
- **Le backend n'a pas besoin d'être publiquement accessible** — son port `8080` n'est ouvert que
  sur `127.0.0.1` pour du debug, pas pour un usage normal.
- **Configuration React inchangée** entre environnements : `VITE_API_URL` reste vide, appels relatifs.
> Point technique à retenir : les variables Vite (`VITE_*`) sont injectées **au moment du build**,
> pas à l'exécution. Changer une variable impose de reconstruire l'image.

### 3.6 Healthchecks en chaîne

```yaml
backend:
  depends_on:
    db:
      condition: service_healthy
frontend:
  depends_on:
    backend:
      condition: service_healthy
```

Le backend n'est lancé qu'une fois MySQL réellement prêt (pas juste démarré) ; le frontend n'est
lancé qu'une fois le backend capable de répondre à l'API (`GET /api/resources` testé en interne).
Évite les erreurs de connexion transitoires au démarrage à froid de toute la stack.

### 3.7 Le volume nommé `db_data`

Les données MySQL sont stockées dans un volume Docker, pas dans le conteneur : reconstruire ou
supprimer le conteneur ne détruit pas les données. En production, ce volume est la cible naturelle
des sauvegardes (non encore automatisées, voir `docs/securite-cesizen.md`).

### 3.8 Gestion des secrets

Ni dans l'image, ni dans Git : `APP_SECRET`, `DB_PASSWORD`, `DB_ROOT_PASSWORD` viennent d'un
`.env` à la racine (non versionné, `.gitignore`), lu par `docker-compose.yml` au lancement. Les
clés JWT sont générées dans le conteneur backend à son premier démarrage
(`docker-entrypoint.sh`) — jamais copiées depuis l'image ni depuis le dépôt.

---

## 4. Démarrage

```bash
# Depuis la racine du projet, avec un .env contenant APP_SECRET, DB_PASSWORD, DB_ROOT_PASSWORD
docker compose build
docker compose up -d
docker compose exec -u www-data backend php bin/console doctrine:migrations:migrate --no-interaction
docker compose ps
```

| Service | Accès | Rôle |
|---|---|---|
| `frontend` | https://localhost:3443 | Interface utilisateur (accepter l'avertissement de certificat auto-signé) |
| `backend` | http://localhost:8080/api | API REST, accès direct pour debug uniquement |
| `db` | Aucun accès depuis l'hôte | Uniquement joignable par `backend`, sur le réseau interne |

---

## 5. Problèmes rencontrés et résolus (historique de mise au point)

### 5.1 404 sur toutes les routes sauf `/`

**Symptôme** : `/` répondait, `/api` renvoyait un 404 brut d'Apache.
**Cause** : le vhost Apache ne comportait aucune directive redirigeant les URL inconnues vers le
contrôleur frontal.
**Solution** : `FallbackResource /index.php` dans `backend/apache-vhost.conf`, versionné et lu une
seule fois au démarrage d'Apache plutôt qu'à chaque requête via un `.htaccess`.

### 5.2 401 permanent malgré un token JWT valide

**Symptôme** : toute route protégée (`/api/me`, panneau admin) répondait `401 JWT Token not
found`, même avec un `Authorization: Bearer ...` valide envoyé par le client.
**Cause** : `mod_php` (Apache 2.4.13+) ne transmet pas l'en-tête `Authorization` à PHP par défaut.
**Solution** : `CGIPassAuth On` dans le bloc `<Directory>` de `backend/apache-vhost.conf` (valide
uniquement en contexte `<Directory>`/`.htaccess`, pas directement sous `<VirtualHost>`).

### 5.3 Erreur 500 — permission denied sur le cache

**Symptôme** : `Cannot rename ... /var/www/html/var/cache/prod/.../: Permission denied`.
**Cause** : Apache s'exécute en `www-data`, mais une commande lancée via `docker compose exec`
sans préciser l'utilisateur s'exécute en `root` — un `cache:clear` en root crée des fichiers que
`www-data` ne peut plus écrire ensuite.
**Solution** : toujours préciser l'utilisateur (`docker compose exec -u www-data backend php
bin/console <commande>`), et préchauffer le cache pendant le build avec le bon propriétaire
(`chown -R www-data:www-data var config/jwt`).

### 5.4 Clés JWT absentes du conteneur

`config/jwt` étant volontairement exclu de l'image (secret), les clés doivent être générées au
premier démarrage du conteneur — géré automatiquement par `backend/docker-entrypoint.sh`, qui ne
régénère rien si les clés existent déjà (persistantes tant que le conteneur n'est pas recréé sans
volume dédié).

---

## 6. Commandes utiles

```bash
# État des services
docker compose ps

# Logs (tous, ou un service)
docker compose logs -f
docker compose logs backend --tail=50

# Commande Symfony (toujours avec -u www-data)
docker compose exec -u www-data backend php bin/console cache:clear
docker compose exec -u www-data backend php bin/console doctrine:migrations:migrate

# Reconstruire un seul service après modification de son Dockerfile
docker compose up -d --build backend

# Tout arrêter (les données du volume db_data sont conservées)
docker compose down

# Tout arrêter ET effacer les données
docker compose down -v
```

---

## 7. Limites assumées et pistes pour un vrai déploiement en production

- **Certificat auto-signé** : à remplacer par un certificat de confiance (Let's Encrypt ou
  équivalent) via un reverse proxy en amont, pas dans ce conteneur — voir
  `docs/deploiement-cesizen.md`.
- **Pas de sauvegarde automatisée du volume `db_data`** — à mettre en place avant toute mise en
  production réelle (voir `docs/securite-cesizen.md`).
- **Un seul conteneur MySQL, sans réplication** — proportionné à l'échelle actuelle
  (démonstrateur), à revoir avant une montée en charge.
- **Rotation des clés JWT** : aucune politique définie — à documenter (ex. rotation annuelle ou
  sur incident), avec chevauchement ancienne/nouvelle clé le temps que les tokens en circulation
  expirent.
