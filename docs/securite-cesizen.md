# Sécurisation de CesiZen

Document de référence sur la sécurisation de l'application (RGPD, bonnes pratiques, gestion des
secrets, API et tokens, risques). Basé sur une lecture directe du code au 2026-08-26, après le
retrait de la conteneurisation Docker du dépôt.

Stack : Symfony 8 + API Platform 4 (backend, `backend/`), React 18 + Vite (frontend, `frontend/`),
authentification JWT via LexikJWTAuthenticationBundle, MySQL 8.

---

## 1. Gestion des secrets

**Règle appliquée : aucun secret réel dans Git, uniquement des `.env` locaux non versionnés.**

| Fichier | Versionné ? | Contenu |
|---|---|---|
| `backend/.env` | Oui | Valeurs neutres/placeholders (`change_me_generate_with_openssl_rand_hex_32`), sert de documentation des variables attendues |
| `backend/.env.local` | Non (`.gitignore`) | Vraies valeurs de dev (`DATABASE_URL`, `APP_SECRET`, `JWT_PASSPHRASE`) |
| `backend/.env.test` | Oui | Secret jetable dédié aux tests (`$ecretf0rt3st`), sans valeur en dehors de la CI/des tests locaux |
| `backend/.env.dev`, `.env.example` | Oui | Gabarits |
| `frontend/.env` | Oui | Ne contient qu'une clé non sensible : `VITE_API_URL` (URL de l'API, pas un secret) |
| `.env` (racine) | **Non** (`.gitignore` racine) | Résidu de l'ancienne configuration Docker Compose (`APP_SECRET`, mots de passe MySQL) — vérifié absent de `git ls-files` |
| `backend/config/jwt/{private,public}.pem` | Non (`backend/.gitignore`) | Paire de clés RSA JWT, générée localement via `php bin/console lexik:jwt:generate-keypair` |

Vérification faite : `git ls-files | grep -iE "\.env"` ne retourne que les fichiers gabarits
ci-dessus, jamais un `.env`/`.env.local` contenant une vraie valeur.

**Incident historique (déjà traité, à connaître)** : `backend/.env` avec un vrai `JWT_PASSPHRASE`
a été committé puis retiré du suivi git sur une branche antérieure. Le retrait seul n'efface pas
l'historique — la valeur reste visible via `git log -p`. La clé privée protégée par cette
passphrase a été régénérée depuis, ce qui neutralise l'exposition (l'ancienne passphrase ne
protège plus rien). Point de vigilance permanent : **le dépôt est maintenant public**
(`Celyane/CesiZen`, visibilité `PUBLIC`), donc tout secret committé aujourd'hui serait visible
immédiatement par n'importe qui, sans délai de découverte.

**Règle à suivre pour la suite** : tout nouveau secret (clé API tierce, identifiants SMTP, etc.)
va dans `backend/.env.local` (ou variables d'environnement du serveur en production), jamais dans
un fichier suivi par git. Avant chaque commit sensible : `git status` puis relecture du diff des
fichiers `.env*` inclus.

---

## 2. Fonctionnement des tokens et sécurisation de l'API

### Authentification

- **Type** : JWT stateless (RS256, paire de clés asymétrique), délivré par
  `POST /api/login` (email + mot de passe), bundle `lexik/jwt-authentication-bundle`.
- **Durée de vie** : 3600 secondes (`backend/config/packages/lexik_jwt_authentication.yaml`).
- **Transport** : header `Authorization: Bearer <token>`, ajouté automatiquement côté client par
  un intercepteur Axios (`frontend/src/api/axios.js`).
- **Stockage côté client** : `localStorage` (`AuthContext.jsx`, `api/axios.js`). Sur un `401`,
  l'intercepteur purge le token et redirige vers `/login`.
- **Mots de passe** : hachage `'auto'` (`security.yaml`) → Argon2id (extension `sodium` présente),
  recommandé OWASP/CNIL. Jamais renvoyé par l'API (exclu de toutes les sérialisations manuelles).

### Contrôle d'accès

- `backend/config/packages/security.yaml` : liste blanche explicite de routes publiques
  (`/api/login`, `/api/register`, `/api/docs`, lectures GET de `resources`/`breathing-exercices`),
  puis verrou générique `^/api → IS_AUTHENTICATED_FULLY`. Toute nouvelle route est donc **fermée
  par défaut** sauf déclaration explicite.
- Hiérarchie de rôles : `ROLE_ADMIN > ROLE_REDACTOR > ROLE_USER`, appliquée via
  `#[IsGranted(...)]` sur les contrôleurs sensibles.
- Contrôle **au niveau objet**, pas seulement au niveau route : `ApiResourceController` vérifie
  `$isAdmin || $isAuthor` avant modification/suppression d'une ressource (empêche qu'un
  utilisateur modifie le contenu d'un autre — IDOR).
- Rate limiting : 5 tentatives/minute par IP+email sur `/api/login` (`login_throttling` natif du
  firewall), 5/minute par IP sur `/api/register` (`symfony/rate-limiter`).
- `UserChecker` bloque l'authentification d'un compte désactivé (`isActive`).

### Écarts connus (assumés, pas corrigés dans ce document)

- Pas de révocation ni de refresh token : un token volé reste utilisable jusqu'à expiration (1h).
  Mitigation actuelle : TTL court, throttling au login.
- `isVerified` (email non confirmé) n'est vérifié nulle part : un compte créé avec un email non
  possédé reste pleinement fonctionnel.
- La validation de robustesse du mot de passe (longueur, présence chiffre/lettre) ne couvre que
  `/api/register` — pas `updateMe` ni la création de compte par un admin.

### CORS et en-têtes HTTP

- CORS restreint par regex d'origine, piloté par la variable d'environnement `CORS_ALLOW_ORIGIN`
  (`nelmio_cors.yaml`) — pas d'origine `*`, pas de valeur figée dans le code.
- **Régression à corriger** : les en-têtes de sécurité HTTP (CSP, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`) étaient posés dans
  `backend/apache-vhost.conf` et `frontend/nginx.conf`. Ces deux fichiers **ne sont plus utilisés
  par rien** depuis la suppression des `Dockerfile` — ils étaient copiés dans les images Docker,
  qui n'existent plus. **Ces en-têtes ne sont donc actuellement appliqués nulle part.**
  Action à faire avant tout déploiement réel : soit réintroduire ces fichiers de config dans le
  serveur web choisi (Apache/Nginx classique), soit les remplacer par un
  `EventListener` Symfony sur `kernel.response` (indépendant du serveur web, recommandé si
  l'hébergement final n'est pas encore fixé) — voir `docs/deploiement-cesizen.md`.

---

## 3. RGPD — état des lieux

### Données traitées

Uniquement des données personnelles ordinaires (pas de donnée de santé au sens de l'article 9) :
email, nom/prénom, mot de passe (haché), rôle, statut de vérification/activation, historique
d'usage (exercices complétés, ressources lues/favorites). Modèle minimal — pas de champ superflu
(téléphone, adresse, date de naissance) : conforme au principe de minimisation.

### Droits des personnes

| Droit | Implémentation | État |
|---|---|---|
| Accès | `GET /api/me`, `GET /api/me/activity` | Couvert |
| Rectification | `PUT /api/me` | Couvert |
| Effacement | `DELETE /api/me` | Couvert |
| Portabilité | — | **Manquant** — pas de route d'export structuré des données |
| Opposition/limitation | — | **Manquant** — aucun mécanisme dédié |

### Consentement — écart à corriger en priorité

La case à cocher RGPD (`frontend/src/pages/Register.jsx`) bloque la soumission du formulaire tant
qu'elle n'est pas cochée, mais sa valeur **n'est jamais transmise à l'API** (`register` ne poste
que `firstname`, `lastname`, `email`, `password`) et **`User` n'a aucun champ de consentement**.
Conséquence concrète : aucune preuve exploitable en cas de contrôle qu'un utilisateur donné a
consenti. Correctif recommandé : ajouter `consentGivenAt` (`\DateTimeImmutable`, nullable) sur
`User`, transmis par le frontend et persisté à l'inscription.

### Durées de conservation (à faire valider formellement, proposition de travail)

Durée de vie du compte + purge sous 30 jours après une suppression. Aucun mécanisme de purge
automatique n'existe dans le code — la suppression n'est déclenchée que par une action explicite.

### Ce qui est déjà correct

- Minimisation des données collectées.
- Mot de passe jamais exposé dans les réponses API.
- Droits d'accès/rectification/effacement fonctionnels et vérifiés par test manuel.

---

## 4. Bonnes pratiques de code déjà en place

| Pratique | Preuve |
|---|---|
| ORM systématique, pas de SQL brut | Doctrine (`EntityManagerInterface`), aucune requête concaténée trouvée dans `backend/src/Controller/` |
| Validation d'entrée | `#[Assert\NotBlank]`, `#[Assert\Email]` sur `User`, contraintes dédiées sur le mot de passe à l'inscription |
| Dépendances à jour et auditées | `composer audit --no-dev` bloquant en CI, `Dependabot` actif sur composer/npm/GitHub Actions |
| Analyse statique | PHPStan niveau 3, bloquant en CI (job `code-quality`) |
| Style de code | PHP-CS-Fixer (PSR-12), bloquant en CI |
| Détection de code mort/complexe | PHPMD, bloquant en CI |
| Détection de duplication | PHPCPD, bloquant en CI |
| Tests automatisés | Suite PHPUnit backend, exécutée en CI à chaque PR |
| Verrouillage des versions | `composer.lock`, `package-lock.json` versionnés |

---

## 5. Tableau des risques

| Risque | Gravité | Mesure en place dans le code |
|---|---|---|
| Absence de HTTPS/TLS en production | **Élevée** | Aucune — dépend de l'hébergement choisi ; `Strict-Transport-Security` prêt à s'activer dès que le TLS existe (voir §2, régression à corriger). En local, le serveur Symfony CLI sert désormais en HTTPS (`symfony server:ca:install` + `server:start`, corrigé le 2026-08-26 — incohérence précédente avec `--no-tls` dans le guide) |
| En-têtes de sécurité HTTP non appliqués (régression post-Docker) | **Élevée** | Configs existantes mais orphelines (`apache-vhost.conf`, `nginx.conf`) — à rebrancher ou remplacer par un listener Symfony |
| Vol de JWT (XSS) — stockage `localStorage`, pas de révocation | **Moyenne** | TTL court (1h), CSP prévue (voir régression ci-dessus), échappement React par défaut |
| Consentement RGPD non tracé côté serveur | **Moyenne** | Aucune — case UI seulement, non transmise à l'API |
| Compte non vérifié (`isVerified`) pleinement fonctionnel | **Moyenne** | Aucune — champ existant mais jamais contrôlé |
| Validation de mot de passe absente hors `/api/register` | **Moyenne** | Partielle — seule la route d'inscription est protégée |
| Absence de sauvegarde de la base de données | **Élevée** | Aucune — pas de script/tâche planifiée dans le dépôt |
| Fuite de secret par commit accidentel | Moyenne (déjà survenu une fois) | `.gitignore` sur tous les `.env*` sensibles, gabarits neutres versionnés, rotation déjà effectuée une fois |
| Dépendance vulnérable non détectée entre deux cycles | Faible (bien couvert) | `composer audit` bloquant en CI + Dependabot hebdomadaire ; équivalent `npm audit` encore absent côté frontend |
| Injection SQL | Faible (bien couvert) | ORM Doctrine systématique, aucun SQL brut |
| IDOR (modification de la ressource d'un autre utilisateur) | Faible (bien couvert) | Contrôle d'accès au niveau objet dans les contrôleurs |

---

## 6. Actions restantes priorisées

1. Rebrancher les en-têtes de sécurité HTTP (CSP, HSTS, etc.) — cassés depuis le retrait de Docker.
2. Mettre en place des sauvegardes automatisées de la base MySQL.
3. Persister le consentement RGPD (`consentGivenAt` sur `User`).
4. Étendre la validation de mot de passe à `updateMe` et à la création admin.
5. Bloquer les actions sensibles tant que `isVerified` est faux, ou documenter ce choix comme
   volontaire.
6. Ajouter `npm audit` bloquant en CI (équivalent frontend de `composer audit`).
7. Ajouter une route d'export des données personnelles (portabilité RGPD).
