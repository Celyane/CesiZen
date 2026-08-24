# Sécurisation de CesiZen

Document produit dans le cadre du bloc 3 « Déployer et sécuriser les applications informatiques »
(titre Concepteur Développeur d'Applications). Il s'appuie sur une analyse du code du dépôt à la
date de rédaction, complétée par un audit ciblé ayant donné lieu à cinq corrections appliquées
et vérifiées (54 tests PHPUnit rejoués après chacune).

**Convention utilisée dans tout le document** : chaque affirmation sur l'existant cite le fichier
concerné. Tout ce qui n'est pas vérifiable dans le code est explicitement marqué **[RECOMMANDÉ]**
et n'est jamais présenté comme déjà en place.

**Périmètre fonctionnel** : le sujet impose deux modules obligatoires — comptes utilisateurs et
informations (ressources) — plus un module au choix, ici les exercices de respiration
(cohérence cardiaque). Le code reflète exactement ce périmètre : trois entités
(`backend/src/Entity/User.php`, `backend/src/Entity/Resource.php`,
`backend/src/Entity/BreathingExercice.php`). Il n'y a pas de module de diagnostic de stress
(échelle Holmes et Rahe) ni de tracker d'émotions dans le code actuel — c'est conforme au
périmètre retenu, pas une lacune. La section 4 traite ces modules futurs comme une anticipation
documentée, pas comme un état existant.

---

## 1. Identification des vulnérabilités et des risques

Analyse organisée selon l'OWASP Top 10 (2021), rapportée concrètement au code de CesiZen.

### A01 — Contrôle d'accès défaillant

**Couvert** :
- `backend/config/packages/security.yaml` : `access_control` se termine par un verrou générique
  `{ path: ^/api, roles: IS_AUTHENTICATED_FULLY }` — toute route `/api` non explicitement listée
  comme publique est protégée par défaut. Bonne pratique : en cas d'oubli d'une nouvelle route,
  elle est fermée par défaut plutôt qu'ouverte.
- Contrôle d'accès **au niveau objet**, pas seulement au niveau route :
  `backend/src/Controller/Api/ApiResourceController.php` (`update`, `delete`) vérifie
  `$isAdmin || $isAuthor` avant toute modification d'une ressource — empêche un utilisateur de
  modifier la ressource d'un autre auteur (IDOR).
  `backend/src/Controller/Api/ApiUserController.php` (`toggleActive`, `delete`) empêche
  explicitement un administrateur de se désactiver/supprimer lui-même.
- Hiérarchie de rôles (`ROLE_ADMIN > ROLE_REDACTOR > ROLE_USER`) appliquée de façon cohérente :
  `#[IsGranted('ROLE_ADMIN')]` sur `ApiUserController` et `ApiAdminController`,
  `#[IsGranted('ROLE_REDACTOR')]` sur la création de ressource.

**Reste exposé** :
- `User::$isVerified` (`backend/src/Entity/User.php:45`) n'est vérifié nulle part — ni dans
  `access_control`, ni dans un contrôleur. Un compte créé avec un email qu'on ne possède pas
  reste pleinement fonctionnel. **[RECOMMANDÉ]** bloquer les actions sensibles tant que
  `isVerified` est faux, ou assumer et documenter ce choix comme volontaire.

### A02 — Défaillances cryptographiques

**Couvert** :
- Hachage des mots de passe : `security.yaml` déclare l'algorithme `'auto'`. L'extension
  `sodium` est présente dans l'image PHP (vérifié via `php -m` dans le conteneur backend),
  donc l'algorithme réellement utilisé est **Argon2id** — résistant au calcul massivement
  parallèle (GPU/ASIC), contrairement à bcrypt seul.
- Mot de passe jamais renvoyé par l'API : vérifié dans toutes les méthodes de sérialisation
  manuelle (`AuthController::serializeUser`, `ApiUserController::serialize`) — le champ
  `password` n'y figure jamais.

**Reste exposé** :
- Aucune terminaison TLS configurée : `backend/apache-vhost.conf` et `frontend/nginx.conf`
  n'écoutent que sur le port 80, `docker-compose.yml` ne mappe aucun port 443. Les identifiants
  et le JWT circulent en clair sur le réseau dans la configuration actuelle. **[RECOMMANDÉ]**
- Aucun chiffrement au repos des données en base MySQL. **[RECOMMANDÉ]**, voir section 3.
- Secret JWT committé dans l'historique git — traité en détail en section 5 (corrigé pendant
  cet audit, avec la limite de la correction expliquée).

### A03 — Injection

**Couvert** : tous les accès en base passent par Doctrine ORM (`EntityManagerInterface`,
repositories générés) — aucune requête SQL brute concaténée trouvée dans
`backend/src/Controller/`. Les identifiants de route (`{id}`) sont typés via l'injection
d'entité Symfony (`BreathingExercice $exercice`, `Resource $resource` en paramètre de méthode),
ce qui exclut l'injection SQL classique sur ce vecteur.

### A04 — Conception non sécurisée

**Reste exposé** :
- Pas de mécanisme de révocation de JWT ni de refresh token (pas de
  `gesdinet/jwt-refresh-token-bundle` dans `backend/composer.json`). Point assumé, détaillé en Q3
  (« Questions probables du jury »).
- Consentement RGPD recueilli côté interface (`frontend/src/pages/Register.jsx:107-118`) mais
  jamais transmis à l'API ni stocké : `form` posté vers `/api/register` (ligne 33) ne contient
  pas le champ `rgpdConsent`, et `User.php` n'a aucun champ de consentement. La case bloque la
  soumission mais ne laisse aucune preuve exploitable en cas de contrôle. **[RECOMMANDÉ]**

### A05 — Mauvaise configuration de sécurité

**Couvert (corrigé pendant cet audit)** :
- En-têtes de sécurité HTTP absents avant correction ; ajoutés dans
  `backend/apache-vhost.conf` et `frontend/nginx.conf` (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`,
  `Content-Security-Policy`). Vérifiés par `curl -I` sur les deux services après reconstruction
  des images.
- `Content-Security-Policy` scindée en deux politiques dans `backend/apache-vhost.conf` :
  `default-src 'none'` sur l'ensemble de l'API (elle ne sert que du JSON), et une exception ciblée
  sur `/api/docs` (`default-src 'self'; style-src 'self'; script-src 'self' 'unsafe-inline'`) car
  cette route sert l'UI Swagger d'API Platform — CSS/JS depuis `/assets` en même origine plus un
  bloc `<script>` inline de bootstrap. Une première version avec `'none'` partout cassait cette
  UI (constaté par inspection du HTML servi, `<script id="swagger-data" type="application/json">`
  inline) ; corrigée avant validation finale. Distinction faite via `SetEnvIf Request_URI` +
  `Header ... env=` (un essai avec `<If>`/`<LocationMatch>` n'a pas produit l'ordre de priorité
  attendu sur cette version d'Apache — abandonné au profit du mécanisme `SetEnvIf`, plus ancien
  mais fiable pour ce cas).
- CORS restreint à une origine unique, désormais pilotée par la variable d'environnement
  `CORS_ALLOW_ORIGIN` (`backend/config/packages/nelmio_cors.yaml`) au lieu d'une valeur figée
  dans le code — permet de configurer une vraie origine de production sans modification de code.
- Interfaces de debug (`web_profiler`, `_wdt`, MakerBundle) déclarées uniquement pour `dev` dans
  `backend/config/bundles.php` — absentes de l'image construite en environnement `prod`.
- `.dockerignore` backend (`backend/.dockerignore`) exclut `.git`, `.env`/`.env.*.local`,
  `vendor`, `var`, `config/jwt` et `tests` du contexte de build. Un fichier `backend/dockerignore`
  existait déjà mais sans le point initial, donc invisible pour Docker (`COPY . .` dans
  `backend/Dockerfile` continuait à copier le `vendor/` du poste de développement — dépendances
  `dev` comprises, dont PHPUnit — par-dessus l'installation `--no-dev` faite à l'étape précédente,
  annulant son effet) : renommé en `.dockerignore` pour être effectivement pris en compte.

**Reste exposé** : néant identifié sur ce point après correction.

### A06 — Composants vulnérables ou obsolètes

**Couvert** : `.github/dependabot.yml` surveille quatre écosystèmes (composer backend, npm
frontend, images Docker backend/frontend, GitHub Actions) avec des fréquences hebdomadaires à
mensuelles.

**Couvert (corrigé pendant cet audit)** : `composer audit` a initialement remonté **40 avis de
sécurité sur 15 paquets** (dont 1 critique — `twig/twig` — et 10 élevés, notamment sur
`symfony/security-http`, `symfony/mime`, `symfony/http-kernel`). Les correctifs étaient déjà
couverts par les bornes de version existantes dans `composer.json` (`8.0.*`, `^2.12|^3.0`,
`^4.29`) : `composer update` ciblé sur les paquets concernés a suffi, sans élargir aucune
contrainte majeure. Vérifié par `composer audit` (0 avis restant, y compris en conteneur avec
`--no-dev`), 54 tests PHPUnit rejoués, puis reconstruction de l'image Docker `backend` et nouvel
appel `composer audit` à l'intérieur du conteneur pour confirmer que l'image publiée est saine.

**Couvert (corrigé pendant cet audit)** : `composer audit --no-dev` ajouté en étape bloquante du
job `tests-backend` de `.github/workflows/ci.yml` — toute PR introduisant une dépendance
vulnérable côté backend fait désormais échouer la CI, plus seulement le rythme hebdomadaire de
Dependabot.

**Reste exposé** : équivalent `npm audit` toujours absent côté frontend. **[RECOMMANDÉ]**

### A07 — Identification et authentification défaillantes

**Couvert** :
- JWT stateless (`security.yaml`, firewalls `login` et `api`), durée de vie 3600 s
  (`backend/config/packages/lexik_jwt_authentication.yaml`).
- `backend/src/Security/UserChecker.php` bloque l'authentification d'un compte désactivé
  (`isActive`) au niveau `checkPreAuth`.
- Limitation de débit sur `/api/login` et `/api/register` (corrigée pendant cet audit, voir
  section 5).
- Contraintes de robustesse sur le mot de passe et le format d'email à l'inscription (corrigées
  pendant cet audit, voir section 5).

**Reste exposé** : stockage du JWT en `localStorage` côté React ; absence de refresh token —
ces deux points sont assumés et expliqués en Q2/Q3 (« Questions probables du jury »).

### A08 — Failles d'intégrité des données et du logiciel

Pas de vecteur identifié spécifique au code applicatif au-delà de ce qui est déjà couvert par
Dependabot (A06). `composer.lock` et `package-lock.json` figent les versions installées.

### A09 — Carences de journalisation et de surveillance

Voir section 6 — journalisation techniquement en place (`backend/config/packages/monolog.yaml`)
mais sans supervision active documentée.

### A10 — Falsification de requête côté serveur (SSRF)

Aucun endpoint du code ne fait de requête HTTP sortante pilotée par une entrée utilisateur
(`Resource::$image` est une chaîne stockée telle quelle, jamais résolue côté serveur). Risque non
applicable en l'état.

### Risques d'infrastructure et de disponibilité

- Absence de terminaison TLS documentée (voir A02).
- Aucune stratégie de sauvegarde de la base MySQL trouvée dans le dépôt (pas de script, pas de
  tâche planifiée, pas de politique de rétention). **[RECOMMANDÉ]**
- Un seul conteneur MySQL sans réplication ni failover : une panne du conteneur `db`
  (`docker-compose.yml`) interrompt le service entièrement. Proportionné au dimensionnement
  actuel (démonstrateur), mais à anticiper avant une mise en production réelle.
- CI (`.github/workflows/ci.yml`, confirmé sur `origin/main`) : trois jobs déclenchés sur push et
  PR vers `main`/`develop`. `tests-backend` (54 tests PHPUnit, avec un service MySQL 8.0 dédié) et
  `build-frontend` (`npm run build`, Vite) n'ont pas de dépendance entre eux et s'exécutent en
  parallèle. `build-images` déclare `needs: [tests-backend, build-frontend]` et ne démarre donc
  que si les deux premiers réussissent ; il construit les deux images Docker (backend, frontend)
  sans les publier vers un registre. La CI valide et construit, mais ne déploie pas.
  **[RECOMMANDÉ]** publication vers un registre + déploiement automatisé si une mise en production
  continue est visée.

---

## 2. Matrice de risques

Colonnes : probabilité et impact cotés Faible/Moyenne(Moyen)/Forte, criticité déduite du
croisement des deux, état constaté dans le dépôt à la date de rédaction.

| # | Risque | Probabilité | Impact | Criticité | État | Mesure préventive | Mesure corrective |
|---|---|---|---|---|---|---|---|
| 1 | Absence de TLS (identifiants/JWT en clair sur le réseau) | Forte | Fort | **Élevée** | À FAIRE | Terminer TLS en amont (reverse proxy/LB), forcer redirection HTTP→HTTPS | Certificats (Let's Encrypt ou équivalent), renouvellement automatisé |
| 2 | Vol de JWT par XSS (`localStorage`, `AuthContext.jsx`) | Moyenne | Fort | **Élevée** | Assumé (voir Q2) | CSP stricte (posée §1/A05), échappement systématique (React le fait par défaut) | Révocation de session non disponible aujourd'hui — réduire le TTL, envisager migration cookie `HttpOnly` |
| 3 | Absence de sauvegarde de la base de données | Moyenne | Fort | **Élevée** | À FAIRE | Sauvegardes automatisées chiffrées, testées régulièrement | Procédure de restauration documentée et testée |
| 4 | Secret JWT (passphrase) exposé dans l'historique Git | Forte (avéré) | Moyen | Moyenne | **Corrigé** | Ne jamais versionner de secret ; `.gitignore` dès l'initialisation du projet | Rotation effectuée : nouvelle passphrase, paire de clés régénérée, tokens antérieurs invalidés. Résiduel : l'ancienne valeur subsiste dans l'historique, sans impact puisqu'elle n'est plus en usage. Nettoyage d'historique jugé non nécessaire (dépôt privé). |
| 5 | Consentement RGPD non tracé côté serveur | Forte (avéré) | Moyen | Moyenne | À FAIRE | Champ de consentement horodaté sur `User` | Migration + persistance du consentement à l'inscription |
| 6 | Compte non vérifié pleinement fonctionnel (`isVerified` non appliqué) | Forte (avéré) | Faible | Moyenne | À FAIRE | Vérifier l'email avant d'autoriser les actions sensibles | Ajout d'un contrôle d'accès conditionné à `isVerified` |
| 7 | Nouvelles vulnérabilités dépendances non détectées entre deux cycles Dependabot (pas de `composer audit`/`npm audit` en CI) | Moyenne | Moyen | Moyenne | Stock initial corrigé (0 avis), CI à faire | `composer audit` / `npm audit` en CI, bloquant sur criticité haute | 40 avis initiaux (1 critique, 10 élevés) résolus par mise à jour ciblée des paquets concernés — reste à automatiser le contrôle en continu |
| 8 | Image Docker backend embarque des dépendances de dev (`.dockerignore` mal nommé, sans effet) | Moyenne | Moyen | Moyenne | **Corrigé** | `.dockerignore` excluant `vendor/`, `.env`/`.env.*.local`, `var/`, `config/jwt`, `tests` | Fichier renommé `dockerignore` → `.dockerignore` ; image reconstruite pour vérification |
| 9 | Pas de révocation/refresh JWT : token volé reste valide jusqu'à 1h | Moyenne | Moyen | Moyenne | Assumé (voir Q3) | TTL court (déjà 3600 s) | Bundle de refresh token + liste de révocation si le risque devient inacceptable |
| 10 | Validation de mot de passe absente sur `updateMe`/création admin (hors `/api/register`) | Moyenne | Moyen | Moyenne | À FAIRE | Étendre la contrainte de robustesse à ces deux routes | Réutiliser la même validation que `register` |
| 11 | CSP absente (XSS facilité si une faille d'injection HTML apparaît) | Faible | Moyen | Faible/Moyenne | **Corrigé** | CSP posée et testée contre `/api/docs` et le frontend React (§1/A05) | — |
| 12 | Absence de chiffrement au repos (base MySQL) | Faible | Fort | Moyenne | À FAIRE | Chiffrement disque au niveau infrastructure (LUKS, chiffrement natif du fournisseur cloud) | Migration vers un hébergement avec chiffrement natif |
| 13 | Panne du conteneur MySQL unique (pas de réplication) | Faible | Fort | Moyenne | Proportionné à l'échelle actuelle | Surveillance de disponibilité | Réplication/managed database avant montée en charge |

**Justification des cotations les plus élevées** :
- **#1 (TLS absent)** coté Fort/Fort : l'application traite des identifiants de connexion et un
  token d'authentification à chaque requête. Sans TLS, toute personne en position d'intercepter
  le trafic (réseau Wi-Fi partagé, proxy intermédiaire) peut capturer un mot de passe en clair
  lors de la connexion ou rejouer un JWT intercepté pendant toute sa durée de vie. C'est la
  vulnérabilité la plus immédiatement exploitable de la liste et elle rend partiellement inutiles
  plusieurs autres protections (Argon2id, throttling) si le trafic est observable en clair en
  amont.
- **#2 (JWT en localStorage)** coté Moyen/Fort : la probabilité dépend de l'existence d'une faille
  XSS ailleurs dans l'application (React échappe par défaut, donc la probabilité brute est
  contenue), mais l'impact est fort car aucune révocation n'existe — un token exfiltré reste
  exploitable jusqu'à expiration (1h) sans aucun moyen de l'invalider a posteriori.
- **#3 (sauvegardes absentes)** coté Moyen/Fort : la probabilité d'un incident (erreur humaine,
  panne disque, incident lors d'une migration) sur la durée de vie d'un projet est réaliste, et
  l'impact d'une perte de données sans sauvegarde est total et irréversible pour les comptes et
  contenus concernés.

---

## 3. Chiffrement et cryptage

**HTTPS/TLS** : absent de la configuration actuelle (`backend/apache-vhost.conf`,
`frontend/nginx.conf`, `docker-compose.yml` — port 80 uniquement). **[RECOMMANDÉ]** terminaison
TLS en amont des conteneurs (reverse proxy dédié ou service managé selon l'hébergement retenu),
avec redirection systématique HTTP→HTTPS. Les en-têtes `Strict-Transport-Security` posés pendant
cet audit sont déjà en place et prendront effet automatiquement dès que le TLS sera actif — aucun
retour en arrière nécessaire sur ce point le jour où le TLS est ajouté.

**Hachage des mots de passe** : `Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface: 'auto'`
dans `backend/config/packages/security.yaml`. Avec l'extension `sodium` présente dans l'image PHP
(confirmé), Symfony sélectionne **Argon2id** — l'algorithme recommandé actuellement par l'OWASP et
la CNIL pour le stockage de mots de passe, car il est à la fois résistant au calcul GPU (coût
mémoire élevé) et protège contre les attaques par canal auxiliaire (variante « id » combinant les
propriétés d'Argon2i et Argon2d). Coût réduit uniquement en environnement `test`
(`when@test` dans le même fichier, `cost: 4`) pour accélérer l'exécution des 54 tests — sans
impact en production.

**Chiffrement au repos** : aucun mécanisme trouvé dans le dépôt (pas de configuration Doctrine
de chiffrement de colonnes, pas de mention de chiffrement disque). **[RECOMMANDÉ]** :
- à court terme, chiffrement au niveau infrastructure (volume Docker chiffré, ou chiffrement
  natif si hébergement cloud managé) ;
- avant l'ajout des modules diagnostic/tracker d'émotions (données de santé, article 9), un
  chiffrement au niveau colonne pour les champs concernés est à prévoir en plus du chiffrement
  disque (défense en profondeur), voir section 4.

**Gestion et rotation des clés JWT** : paire de clés RSA générée par
`php bin/console lexik:jwt:generate-keypair` (utilisée telle quelle dans
`.github/workflows/ci.yml`, étape « Génération des clés JWT »), stockée dans
`backend/config/jwt/{private,public}.pem`, correctement exclue du suivi git
(`backend/.gitignore:23`, vérifié : ces fichiers ne sont ni dans l'index ni dans l'historique).
La clé privée est protégée par une passphrase — dont l'exposition passée est traitée en section 5.
**[RECOMMANDÉ]** : aucune politique de rotation périodique de cette paire de clés n'est définie ;
à documenter (ex. rotation annuelle ou sur incident), avec la procédure de bascule associée
(chevauchement ancienne/nouvelle clé le temps que les tokens en circulation expirent).

**Chiffrement des sauvegardes** : sans objet à ce stade puisqu'aucune sauvegarde n'est mise en
place (voir section 1, risque infrastructure). **[RECOMMANDÉ]** dès la mise en place de
sauvegardes : chiffrement au repos des fichiers de sauvegarde et gestion de la clé associée
séparément du système sauvegardé.

---

## 4. Gestion des données personnelles et conformité RGPD

### Nature des données réellement traitées aujourd'hui

**Point de méthode assumé** : les données traitées par l'application dans son périmètre actuel
sont des données personnelles ordinaires. Aucune donnée de santé au sens de l'article 9 du RGPD
n'est stockée dans les entités actuelles (`backend/src/Entity/`). Cette section documente donc
l'existant sous ce régime de droit commun, puis traite l'article 9 séparément comme anticipation
pour les modules futurs.

| Donnée | Entité / champ | Finalité | Base légale | Durée de conservation **proposée (à valider)** |
|---|---|---|---|---|
| Email | `User::$email` | Identification, connexion, communication liée au compte | Exécution du contrat (fourniture du service) | Durée de vie du compte + suppression sous 30 jours après demande de suppression, sauf obligation légale de conservation |
| Nom, prénom | `User::$lastname`, `$firstname` | Identification, personnalisation, attribution des ressources créées | Exécution du contrat | Idem email |
| Mot de passe (haché) | `User::$password` | Authentification | Exécution du contrat | Idem email (le hash n'a aucune valeur hors du compte associé) |
| Rôle | `User::$role` | Autorisation, contrôle d'accès | Exécution du contrat | Idem email |
| Statut de vérification / activation | `User::$isVerified`, `$isActive` | Sécurité du compte | Intérêt légitime (lutte contre les comptes frauduleux) | Idem email |
| Historique d'usage (exercices complétés, ressources lues/favorites) | tables de jointure `user_breathing_exercice`, `user_resource_read`, `user_resource_favorite` | Personnalisation du service, suivi de progression affiché à l'utilisateur | Exécution du contrat | Idem email — purge à la suppression du compte |
| Adresse IP (journaux d'accès) | `access.log` Apache/Nginx (configuration par défaut, non applicative) | Sécurité, diagnostic | Intérêt légitime | **[À VALIDER]** proposition : 6 à 12 mois, conforme aux recommandations usuelles de la CNIL pour des logs de sécurité |

**Note d'analyse** : l'historique d'usage (quel exercice de respiration a été fait, quelle
ressource sur la gestion du stress a été lue ou mise en favori) n'est pas une donnée de santé au
sens strict de l'article 9, mais elle peut permettre d'inférer un état ou une problématique de
santé mentale par recoupement. Elle appelle donc une vigilance renforcée (minimisation, pas de
partage à des tiers) sans pour autant relever du régime article 9 tant qu'aucun diagnostic n'est
posé par l'application.

**Durées de conservation à valider explicitement** : celles indiquées ci-dessus sont des
propositions de travail fondées sur les pratiques usuelles (durée du compte + délai de
suppression court), pas des durées déjà actées. Aucun mécanisme de purge automatique n'existe
dans le code — la suppression n'est déclenchée que par une action explicite de l'utilisateur
(`DELETE /api/me`, `AuthController::deleteMe`) ou d'un administrateur
(`ApiUserController::delete`).

### Anticipation article 9 — modules diagnostic de stress et tracker d'émotions

Ces modules ne sont pas implémentés (voir la note de périmètre en tête de document). S'ils sont
ajoutés, les résultats de diagnostic (score Holmes et Rahe) et les entrées de suivi émotionnel
constitueront des données de santé au sens de l'article 9 du RGPD, ce qui change les exigences
applicables :

- **Base légale renforcée** : le consentement explicite de la personne concernée
  (art. 9.2.a) devient nécessaire — la base « exécution du contrat » utilisée pour les données
  actuelles ne suffit pas pour des données de santé.
- **Hébergement HDS** : hébergement certifié Hébergeur de Données de Santé requis dès lors que
  des données de santé identifiantes sont stockées pour le compte d'un tiers (ici, le Ministère
  de la Santé en tant que commanditaire) — à vérifier précisément selon le statut retenu au
  moment de l'ajout du module (traitant/responsable de traitement).
- **AIPD (analyse d'impact relative à la protection des données)** obligatoire avant mise en
  production, conformément à l'article 35 du RGPD, dès lors qu'un traitement à grande échelle de
  données de santé est envisagé — c'est un prérequis, pas une option.
- **Chiffrement au repos renforcé** (voir section 3) : chiffrement au niveau colonne pour les
  champs de diagnostic/émotion en plus du chiffrement disque général.
- **Consentement traçable** : contrairement à la case actuelle non persistée (voir plus bas), le
  consentement pour ces données devra être horodaté, versionné (quelle politique de
  confidentialité était affichée au moment du consentement) et retirable à tout moment sans
  affecter l'usage des modules non sensibles.

### Droits des personnes — modalités concrètes actuelles

| Droit | Modalité actuelle | Constat |
|---|---|---|
| Accès | `GET /api/me` (`AuthController::me`), `GET /api/me/activity` | Couvert pour les données de profil et d'usage |
| Rectification | `PUT /api/me` (`AuthController::updateMe`) | Couvert |
| Effacement | `DELETE /api/me` (`AuthController::deleteMe`) | Couvert pour une suppression déclenchée par l'utilisateur lui-même |
| Portabilité | Aucune route d'export structuré trouvée | **[RECOMMANDÉ]** endpoint d'export JSON des données personnelles |
| Opposition / limitation | Aucun mécanisme dédié | **[RECOMMANDÉ]** à formaliser, même a minima (contact DPO/support) |

### Consentement — écart constaté

La case à cocher RGPD (`frontend/src/pages/Register.jsx:107-118`) est obligatoire pour activer le
bouton de soumission (`disabled={loading || !rgpdConsent}`, ligne 119), mais sa valeur n'est
**jamais envoyée à l'API** : l'objet `form` posté vers `/api/register` (ligne 33) ne contient que
`firstname`, `lastname`, `email`, `password`. Aucun champ de consentement n'existe dans
`User.php`. Conséquence : il n'existe aujourd'hui aucune preuve exploitable qu'un utilisateur
donné a consenti, seulement une contrainte d'interface qui l'a empêché de s'inscrire sans cocher
la case. **[RECOMMANDÉ]** ajouter un champ `consentGivenAt` (horodatage) sur `User`, transmis et
persisté à l'inscription.

### Minimisation et privacy by design

Points positifs constatés : le modèle de données actuel est minimal (pas de champ superflu type
téléphone, adresse, date de naissance sur `User`), cohérent avec le principe de minimisation.
La sérialisation manuelle de chaque contrôleur exclut systématiquement le mot de passe des
réponses (vérifié section 1/A02).

Point d'attention : l'absence de groupes de sérialisation systématiques (API Platform présent
dans le socle mais non utilisé de façon déclarative, voir constat de l'étape d'analyse) fait
reposer la protection contre la sur-exposition de champs sur la discipline de chaque contrôleur
plutôt que sur un mécanisme structurel. **[RECOMMANDÉ]** à surveiller particulièrement lors de
l'ajout de nouveaux champs sensibles (diagnostic, émotions).

### Hébergement UE, registre des traitements, AIPD

- **Hébergement UE** : non déterminé par le code (dépend de l'infrastructure de déploiement
  choisie, non présente dans ce dépôt). **[RECOMMANDÉ]** à formaliser dans le choix
  d'hébergeur, avec clause contractuelle explicite de localisation des données en UE.
- **Registre des traitements** : aucun document de ce type dans le dépôt. **[RECOMMANDÉ]**,
  document externe au code, à tenir à jour à mesure que les finalités évoluent (notamment à
  l'ajout des modules article 9).
- **AIPD** : non nécessaire dans le périmètre actuel (données ordinaires, pas de profilage à
  grande échelle constaté). Devient obligatoire avant l'ajout des modules diagnostic/émotions
  (voir plus haut).

---

## 5. Bonnes pratiques de développement

### Déjà en place, avec preuves

| Pratique | Preuve |
|---|---|
| Protection de branche avec checks CI obligatoires | Configuration GitHub (hors dépôt de code, confirmée par le contexte projet) |
| CI bloquante à 3 jobs | `.github/workflows/ci.yml` (confirmé fusionné sur `origin/main`) : `tests-backend` (54 tests PHPUnit), `build-frontend` (`npm run build`), `build-images` (`needs: [tests-backend, build-frontend]`, build des deux images Docker) |
| 54 tests automatisés | Rejoués après chaque modification pendant cet audit, `OK (54 tests, 72 assertions)` systématiquement |
| Dependabot (alerts, security, version updates) | `.github/dependabot.yml` — composer, npm, docker (x2), github-actions |
| Clés JWT hors dépôt, générées à l'exécution | `backend/.gitignore:23` (`/config/jwt/*.pem`), génération via `lexik:jwt:generate-keypair` (`.github/workflows/ci.yml`) |
| Mots de passe hachés Argon2id | Section 3 |

### Vulnérabilité identifiée et corrigée pendant cet audit — secrets committés

**Constat initial** : `backend/.env` était suivi par git sur l'ensemble des branches du dépôt
(`main`, `develop`, `feature-*`) et contenait `JWT_PASSPHRASE` en clair.
`docker-compose.yml` (également suivi) contenait par ailleurs `APP_SECRET: "a_changer_avant_la_prod"`
et des identifiants MySQL en clair.

**Correction** : `backend/.env` a été retiré du suivi git sur la branche de travail
`feature-veille` (vérifié : absent de `git ls-files`, présent uniquement via
`backend/.env.example`, nouvellement créé avec des valeurs neutres pour permettre à un autre
poste de démarrer le projet sans jamais manipuler de secret réel). Ces commits ayant été poussés
sur `feature-veille` **après** la fusion de cette branche dans `main` (PR déjà mergée au moment
où les corrections ont été committées), ils n'ont jamais atteint `main`/`develop` malgré le push
— un cherry-pick a donc été nécessaire sur une nouvelle branche, `feature-security`, pour les
rapatrier en vue d'une PR vers `main` (voir correction n°5 ci-dessous pour l'incident rencontré
pendant cette opération). Au moment de la rédaction, le correctif est vérifié sur
`feature-veille` et `feature-security`, mais `main` et `develop` ne l'ont pas encore reçu —
traité comme action restante (§8), pas comme un problème résiduel sur les branches auditées.

La rotation a été effectuée et vérifiée : nouveaux `JWT_PASSPHRASE` et `APP_SECRET` générés
(`openssl rand -hex 32`), nouvelle paire de clés régénérée avec
`lexik:jwt:generate-keypair --overwrite`, image backend reconstruite, puis authentification
rejouée avec succès (`POST /api/login` renvoie un token signé avec la nouvelle clé). L'ancienne
passphrase reste lisible dans l'historique git tant qu'aucun nettoyage n'est fait (voir plus bas),
mais elle est désormais sans valeur : la clé privée qu'elle protégeait a été régénérée, donc
connaître l'ancienne passphrase ne permet plus de déchiffrer la clé actuellement utilisée.

**Leçon retenue, à assumer à l'oral** : le retrait d'un fichier du suivi git ne l'efface pas de
l'historique. Tant qu'aucun nettoyage d'historique (`git filter-repo` ou équivalent, suivi d'un
push forcé et de la purge du cache GitHub) n'est effectué, quiconque dispose d'un accès au dépôt
peut retrouver l'ancienne valeur via `git log`/`git show` sur les commits antérieurs — exactement
la méthode utilisée pour établir ce constat pendant l'audit. Le retrait seul est une mesure
d'hygiène nécessaire mais non suffisante ; **c'est la rotation qui neutralise réellement
l'exposition**, pas le retrait du fichier. **[RECOMMANDÉ]** nettoyage d'historique si la
sensibilité résiduelle le justifie — impact déjà limité puisque la clé privée protégée par
l'ancienne passphrase n'est elle-même plus utilisée.

### Corrections appliquées et vérifiées pendant cet audit

Cinq corrections. Les points 2 à 4 étaient déjà en place au moment de cette relecture (issues
d'une itération précédente) ; ils ont été revérifiés ici par lecture de code, exécution complète
des 54 tests PHPUnit, puis appels API manuels en direct sur le conteneur reconstruit (requêtes
`OPTIONS` avec origine autorisée/refusée, inscriptions avec email invalide et mots de passe
faibles, 6 inscriptions consécutives pour déclencher le seuil de 5/minute, 6 connexions avec mot
de passe erroné pour observer le message de throttling). Le point 1 (CSP) a été complété et affiné
pendant cette session : diff montré avant chaque application, 54 tests rejoués après chaque
changement, puis vérification manuelle par reconstruction des images, `curl -I` et inspection du
HTML de `/api/docs`.

1. **En-têtes de sécurité HTTP** — `backend/apache-vhost.conf`, `frontend/nginx.conf` :
   `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
   `Strict-Transport-Security` déjà en place ; `Content-Security-Policy` ajoutée pendant cette
   session, avec une exception ciblée pour `/api/docs` (voir §1/A05 pour le détail technique).
   Vérifié par `curl -I` sur les deux services après reconstruction des images, et par inspection
   du HTML servi par `/api/docs` pour confirmer que l'UI Swagger reste fonctionnelle sous la
   policy assouplie.
2. **CORS piloté par variable d'environnement** — `backend/config/packages/nelmio_cors.yaml`
   utilise désormais `%env(CORS_ALLOW_ORIGIN)%` au lieu d'une origine figée dans le code.
   Vérifié par requêtes `OPTIONS` avec origine autorisée et non autorisée.
3. **Contraintes de validation** — `backend/src/Entity/User.php` (`#[Assert\NotBlank]`,
   `#[Assert\Email]` sur `email`, bénéficie à toutes les routes qui appellent
   `$validator->validate($user)`) ; `backend/src/Controller/Api/AuthController.php::register`
   (longueur minimale 8 caractères, présence d'au moins une lettre et un chiffre, validées sur
   le mot de passe en clair avant hachage). Vérifié par appels API directs (mot de passe court
   rejeté, sans chiffre rejeté, email invalide rejeté, cas valide accepté).
   **Limite assumée** : cette validation ne couvre que `/api/register`. `AuthController::updateMe`
   et `ApiUserController::create` (création par un administrateur) permettent toujours de
   définir un mot de passe faible. **[RECOMMANDÉ]**
4. **Limitation de débit** — ajout de `symfony/rate-limiter` ; `login_throttling` natif sur le
   firewall `login` (`backend/config/packages/security.yaml`, 5 tentatives/minute par IP+email) ;
   limiteur dédié `register_ip` (`backend/config/packages/rate_limiter.yaml`,
   `AuthController::register`, 5/minute par IP). Vérifié par appels répétés : `/api/register`
   renvoie `429` à la 6ᵉ tentative ; `/api/login` bloque bien la 6ᵉ tentative (le mot de passe
   n'est plus vérifié au-delà) mais renvoie `401` au lieu de `429`, car le
   `failure_handler` de LexikJWTAuthenticationBundle normalise toutes les exceptions
   d'authentification en 401 sans distinguer l'exception de throttling. Protection
   fonctionnellement effective ; imprécision de code HTTP assumée et documentée plutôt que
   corrigée dans le cadre de cet audit.
5. **Mise à jour des dépendances vulnérables (`composer audit`)** — 40 avis initiaux (1 critique,
   10 élevés), tous résolus par `composer update` ciblé sur les paquets concernés
   (`twig/twig` → 3.28, plusieurs paquets `symfony/*` → dernier patch `8.0.x`,
   `easycorp/easyadmin-bundle` → 4.29.16), sans élargir aucune contrainte majeure de
   `composer.json`. Vérifié par `composer audit` (0 avis, y compris en conteneur `--no-dev`), 54
   tests PHPUnit rejoués, puis reconstruction et revérification de l'image Docker `backend`.
   **Incident rencontré et corrigé pendant cette même session** : en récupérant par cherry-pick,
   sur une nouvelle branche (`feature-security`), des commits de sécurité restés uniquement sur
   `feature-veille` après la fusion de cette dernière (voir remarque plus bas sur ce
   désynchronisation), la résolution manuelle d'un conflit avait supprimé par erreur la ligne
   `symfony/rate-limiter` de `backend/composer.json` — perdant silencieusement la dépendance
   explicite posée par la correction n°4 ci-dessus. Repéré en comparant le commit cherry-pické à
   son commit source (`git diff --cached <commit-source>`), corrigé en restaurant la ligne et en
   régénérant le hash de `composer.lock` (`composer update --lock`, sans changement de version),
   puis revérifié par `composer audit` et les 54 tests. **Leçon retenue** : une résolution de
   conflit "tous les conflits sont résolus" par Git ne garantit pas l'absence d'erreur humaine —
   seule la comparaison explicite avec le commit source et le rejeu des tests l'ont détectée.

### Compléments recommandés

- `PHPStan` : absent (`phpstan/phpdoc-parser` présent dans `composer.json` n'est qu'une
  dépendance indirecte d'un autre paquet, pas l'outil d'analyse statique lui-même).
  **[RECOMMANDÉ]** ajout en CI, niveau progressif.
- `composer audit --no-dev` : ajouté en étape bloquante de `.github/workflows/ci.yml`
  (job `tests-backend`) — toute PR introduisant une dépendance vulnérable fait désormais échouer
  la CI, plus seulement le rythme hebdomadaire de Dependabot. Il reste à ajouter l'équivalent
  `npm audit` côté frontend. **[RECOMMANDÉ]**
- `.dockerignore` côté backend : corrigé, voir section 1/A05.
- Étendre la validation de mot de passe à `updateMe` et à la création par un administrateur
  (point 3 ci-dessus).

---

## 6. Détection et supervision

**Journalisation existante** : `backend/config/packages/monolog.yaml` — en production
(`when@prod`), les erreurs (niveau `error` et au-delà) sont journalisées vers `php://stderr` au
format JSON (`fingers_crossed` avec `nested` en JSON), ce qui les rend directement exploitables
par un collecteur de logs de conteneurs (Docker/Kubernetes) sans configuration supplémentaire. Le
canal `deprecation` est journalisé séparément. Les codes HTTP 404/405 sont explicitement exclus du
déclenchement (`excluded_http_codes: [404, 405]`), ce qui évite de noyer les vraies anomalies sous
du bruit de scan/erreurs de saisie utilisateur.

**Journalisation sans donnée personnelle** : point de vigilance à formaliser. Le format actuel ne
journalise que les messages d'erreur et leur contexte technique (pas de journalisation applicative
explicite du contenu des requêtes constatée dans les contrôleurs) — c'est un bon point de départ,
mais aucune règle explicite n'interdit qu'une future exception embarque involontairement un email
ou un mot de passe dans son message (par exemple une erreur de validation Doctrine citant la
valeur en cause). **[RECOMMANDÉ]** revue régulière des messages d'exception métier pour s'assurer
qu'aucune donnée personnelle n'y transite, et exclusion explicite du canal `security` des logs
d'erreur si un jour il venait à journaliser des tentatives de connexion avec l'email en clair.

**Indicateurs à surveiller [RECOMMANDÉ]**, proportionnés au dimensionnement du projet :
- Taux de réponses `401`/`403`/`429` sur `/api/login` et `/api/register` (pic = tentative de
  bruteforce ou de credential stuffing, à corréler avec le throttling mis en place section 5).
- Taux d'erreurs `5xx` sur l'ensemble de l'API (symptôme de panne applicative ou de base).
- Volume de créations de compte par IP/fenêtre de temps (abus d'inscription au-delà de ce que le
  throttling actuel couvre déjà).
- Échecs de connexion à la base de données (signal de panne du conteneur `db`).

**Outils réalistes pour ce dimensionnement [RECOMMANDÉ]** : à l'échelle d'un démonstrateur/MVP,
inutile de déployer une stack ELK complète. Des options proportionnées : agrégation des logs JSON
déjà produits via un service managé simple (ex. offre de logging du fournisseur cloud retenu),
alerting basique sur seuils (taux d'erreur, disponibilité) via un outil de monitoring léger. À
dimensionner à la hausse si le volume d'utilisateurs réels le justifie.

---

## 7. Gestion de crise et escalade

[section rédigée séparément]

---

## 8. Actions correctives prioritaires

Liste ordonnée par priorité décroissante, avec effort estimé (échelle qualitative : XS < 1h,
S ≈ demi-journée, M ≈ 1-2 jours, L ≈ plusieurs jours).

| Priorité | Action | Effort | Réf. |
|---|---|---|---|
| 1 | Mettre en place la terminaison TLS (reverse proxy ou service managé) | M | §1/§3 |
| 2 | Mettre en place des sauvegardes chiffrées de la base MySQL, avec test de restauration | M | §1/§3 |
| 3 | ~~Ajouter `composer audit` en CI, bloquant~~ **Fait** — reste `npm audit` côté frontend | XS | §5 |
| 4 | Persister le consentement RGPD (champ horodaté sur `User`, transmis depuis le frontend) | S | §4 |
| 5 | Étendre la validation de mot de passe à `updateMe` et à la création admin | XS | §5 |
| 6 | ~~Ajouter un `.dockerignore` backend~~ **Fait** | — | §1 |
| 7 | Merger `feature-security` vers `main`/`develop` (cherry-pick déjà effectué et revérifié : en-têtes/CSP/CORS/rate-limiting/validation/dépendances, retrait de `backend/.env` du suivi git) | S | §1/§5 |
| 8 | Décider et documenter le traitement de `isVerified` (blocage effectif ou choix assumé) | S | §1 |
| 9 | Ajouter PHPStan en CI (niveau progressif) | M | §5 |
| 10 | Rédiger le registre des traitements (document externe au code) | S | §4 |
| 11 | Nettoyer l'historique git de l'ancienne valeur de `JWT_PASSPHRASE` si la sensibilité résiduelle le justifie | S | §5 |
| 12 | Poser les prérequis (HDS, AIPD, consentement explicite, chiffrement colonne) avant tout développement des modules diagnostic/tracker d'émotions | L | §4 |

---

## Questions probables du jury

**Q1. Pourquoi Argon2id plutôt que bcrypt, et comment savez-vous que c'est bien cet algorithme
qui est utilisé ?**
Symfony est configuré avec l'algorithme `'auto'` (`security.yaml`), qui sélectionne le meilleur
algorithme disponible selon les extensions PHP installées. J'ai vérifié directement dans le
conteneur (`php -m`) que l'extension `sodium` est présente, ce qui fait qu'Argon2id est
effectivement sélectionné plutôt que bcrypt. Argon2id est recommandé par l'OWASP et la CNIL car
il est coûteux en mémoire (résistant au cassage par GPU/FPGA) et combine les protections
d'Argon2i (canal auxiliaire) et Argon2d (attaque par table).

**Q2. Le JWT est stocké en `localStorage` côté React — n'est-ce pas une faute de sécurité
basique ?**
C'est un arbitrage assumé, pas un oubli. `localStorage` expose le token à un XSS si une faille
d'injection apparaît côté frontend (React échappe par défaut, ce qui limite la probabilité sans
l'annuler). En contrepartie, comme le token n'est jamais envoyé automatiquement par le navigateur
(contrairement à un cookie), le risque CSRF sur les routes `/api` est structurellement éliminé
sans code supplémentaire — cohérent avec le choix de firewalls `stateless: true` sur `/api`. La
vraie limite de ce choix est ailleurs : sans refresh token ni révocation, un token exfiltré reste
exploitable jusqu'à 1h. Une migration vers un cookie `HttpOnly` + `SameSite` réduirait le risque
XSS mais réintroduirait une surface CSRF à gérer, et n'a pas été retenue dans le temps imparti.

**Q3. Que se passe-t-il si un JWT est volé ?**
Il reste valide jusqu'à expiration, soit une heure maximum (`token_ttl: 3600` dans
`lexik_jwt_authentication.yaml`), sans aucun moyen de le révoquer avant terme — aucun bundle de
refresh token ou de liste de révocation n'est installé. C'est une limite assumée compte tenu du
périmètre du projet ; une évolution possible serait `gesdinet/jwt-refresh-token-bundle` avec une
liste noire de tokens révoqués côté serveur si le niveau de risque l'exigeait.

**Q4. Le sujet demande de traiter les données de santé au sens de l'article 9 — pourquoi votre
document dit qu'il n'y en a pas ?**
Le code actuel implémente les deux modules obligatoires (comptes, informations) plus un module au
choix (exercices de respiration) — aucune entité de diagnostic de stress ni de tracker d'émotions
n'existe dans `backend/src/Entity/`. Les données réellement traitées aujourd'hui (email, nom,
prénom, historique d'usage des exercices) relèvent du régime RGPD de droit commun. Le document
traite l'article 9 comme une anticipation documentée : si les modules diagnostic/tracker sont
ajoutés, ils basculeront le traitement sous ce régime renforcé (consentement explicite,
hébergement HDS, AIPD obligatoire), et j'ai détaillé précisément ce que cela impliquerait pour ne
pas être pris au dépourvu si la question m'est posée à l'oral sur ce point précis du sujet.

**Q5. Vous avez trouvé un secret committé dans le dépôt — comment avez-vous vérifié que le
problème est réglé ?**
`backend/.env` est retiré du suivi git sur `feature-veille` (vérifié : absent de `git ls-files`),
et j'ai effectué la rotation elle-même plutôt que de me contenter du retrait : nouvelle
passphrase et nouvel `APP_SECRET` générés (`openssl rand -hex 32`), nouvelle paire de clés RSA
régénérée (`lexik:jwt:generate-keypair --overwrite`), image backend reconstruite, puis
authentification rejouée avec succès pour confirmer que le nouveau couple clé/passphrase
fonctionne de bout en bout. Ce que je ne présente pas comme réglé : le fichier reste suivi sur
`main` et `develop` (action restante, §8), et l'ancienne valeur reste lisible dans l'historique
git tant qu'aucun nettoyage n'est fait — mais elle a perdu toute valeur puisque la clé privée
qu'elle protégeait n'est plus celle utilisée en production.

**Q6. Comment avez-vous géré la Content-Security-Policy sachant que `/api/docs` sert une page
HTML (Swagger) alors que le reste de l'API ne renvoie que du JSON ?**
Une première version avec `default-src 'none'` partout cassait effectivement l'UI Swagger — je
l'ai constaté en inspectant le HTML servi par `/api/docs` (feuilles de style externes sous
`/assets`, bloc `<script>` inline pour le bootstrap). Plutôt que d'assouplir la policy pour
toute l'API, j'ai isolé une exception à cette seule route : `default-src 'self'` avec
`'unsafe-inline'` sur `script-src` uniquement là, et `'none'` partout ailleurs. Techniquement, un
premier essai avec `<LocationMatch>`/`<If>` n'a pas produit la priorité attendue sur cette version
d'Apache (la directive la plus large l'emportait sur la plus spécifique, contre-intuitivement) ;
j'ai basculé sur `SetEnvIf Request_URI` combiné à `Header ... env=`, un mécanisme plus ancien mais
dont le comportement est déterministe, et vérifié par `curl -I` sur les deux routes après
reconstruction de l'image.

**Q7. La limitation de débit sur `/api/login` renvoie 401 au lieu de 429 — n'est-ce pas un bug
que vous auriez dû corriger ?**
Le mécanisme de protection est fonctionnellement actif : au-delà de 5 tentatives par minute, le
mot de passe n'est même plus vérifié et le message devient explicitement
« Too many failed login attempts ». Seul le code HTTP renvoyé est imprécis, parce que le
gestionnaire d'échec de LexikJWTAuthenticationBundle normalise toutes les exceptions
d'authentification en 401. J'ai proposé de le corriger avec un gestionnaire d'échec personnalisé,
mais il a été décidé de documenter ce point comme limite connue plutôt que d'élargir le périmètre
des corrections validées pour cet audit — un arbitrage de gestion de projet, pas un oubli
technique.

**Q8. Comment avez-vous vérifié que vos cinq corrections n'ont rien cassé ?**
Pour la CSP (seule correction réellement appliquée pendant cette relecture), diff montré avant
application, image reconstruite, 54 tests PHPUnit rejoués (`OK (54 tests, 72 assertions)`), puis
vérification manuelle ciblée : en-têtes présents via `curl -I` sur les deux services, et HTML de
`/api/docs` inspecté pour confirmer que la policy assouplie ne casse pas l'UI Swagger. Pour les
trois autres correctifs déjà en place avant cette session : mêmes 54 tests rejoués sans
régression, puis vérification manuelle en direct sur le conteneur reconstruit — origine CORS
acceptée/refusée selon l'origine testée, validation acceptant/rejetant les cas limites de mot de
passe et d'email, et dépassement de seuil déclenchant bien un blocage sur `/api/login` (401 avec
message de throttling) et `/api/register` (429 à la 6ᵉ tentative cumulée). Pour la mise à jour des
dépendances (`composer audit`) : `composer audit` revérifié à 0 avis avant et après reconstruction
de l'image Docker en conditions `--no-dev`, 54 tests rejoués, et l'incident de cherry-pick
(ligne `symfony/rate-limiter` perdue puis restaurée) détecté par comparaison explicite avec le
commit source plutôt que par simple confiance dans la résolution automatique de Git.