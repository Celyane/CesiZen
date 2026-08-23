# Sécurisation de CesiZen

Document produit dans le cadre du bloc 3 « Déployer et sécuriser les applications informatiques »
(titre Concepteur Développeur d'Applications). Il s'appuie sur une analyse du code du dépôt à la
date de rédaction, complétée par un audit ciblé ayant donné lieu à quatre corrections appliquées
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
- `User::$isVerified` (`backend/src/Entity/User.php:42`) n'est vérifié nulle part — ni dans
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
  `gesdinet/jwt-refresh-token-bundle` dans `backend/composer.json`). Point assumé, détaillé en
  section 7 du présent document (limites).
- Consentement RGPD recueilli côté interface (`frontend/src/pages/Register.jsx:107-118`) mais
  jamais transmis à l'API ni stocké : `form` posté vers `/api/register` (ligne 33) ne contient
  pas le champ `rgpdConsent`, et `User.php` n'a aucun champ de consentement. La case bloque la
  soumission mais ne laisse aucune preuve exploitable en cas de contrôle. **[RECOMMANDÉ]**

### A05 — Mauvaise configuration de sécurité

**Couvert (corrigé pendant cet audit)** :
- En-têtes de sécurité HTTP absents avant correction ; ajoutés dans
  `backend/apache-vhost.conf` et `frontend/nginx.conf` (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`).
  Vérifiés par `curl -I` sur les deux services après reconstruction des images.
- CORS restreint à une origine unique, désormais pilotée par la variable d'environnement
  `CORS_ALLOW_ORIGIN` (`backend/config/packages/nelmio_cors.yaml`) au lieu d'une valeur figée
  dans le code — permet de configurer une vraie origine de production sans modification de code.
- Interfaces de debug (`web_profiler`, `_wdt`, MakerBundle) déclarées uniquement pour `dev` dans
  `backend/config/bundles.php` — absentes de l'image construite en environnement `prod`.

**Reste exposé** :
- Pas de `Content-Security-Policy`. Non ajoutée volontairement pendant cet audit : `/api/docs`
  sert une documentation API Platform qui peut être rendue en HTML par le navigateur, et une CSP
  mal calibrée risquait de la casser sans test préalable. **[RECOMMANDÉ]**, à définir et tester
  spécifiquement.
- L'image Docker backend ne dispose d'aucun `.dockerignore` : `COPY . .` dans
  `backend/Dockerfile` copie le `vendor/` du poste de développement (avec dépendances `dev`,
  dont PHPUnit) par-dessus l'installation `--no-dev` faite à l'étape précédente, ce qui annule
  l'effet de `--no-dev` et alourdit l'image de production avec des outils qui n'ont rien à y
  faire. **[RECOMMANDÉ]**

### A06 — Composants vulnérables ou obsolètes

**Couvert** : `.github/dependabot.yml` surveille quatre écosystèmes (composer backend, npm
frontend, images Docker backend/frontend, GitHub Actions) avec des fréquences hebdomadaires à
mensuelles.

**Reste exposé** : `composer audit` (exécuté pendant cet audit, lors de l'ajout de
`symfony/rate-limiter`) a remonté **40 avis de sécurité sur 15 paquets**. Cette commande n'est
pas exécutée en CI (`.github/workflows/ci.yml` ne contient aucune étape d'audit), donc rien ne
bloque une PR qui introduirait ou laisserait passer une dépendance vulnérable en dehors du
rythme hebdomadaire de Dependabot. **[RECOMMANDÉ]**

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
ces deux points sont assumés et expliqués en section 7.

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
- CI (`.github/workflows/ci.yml`, confirmé sur `origin/main` après fusion) : trois jobs —
  `tests-backend` (54 tests PHPUnit, `needs` implicite car premier job), `build-frontend`
  (compilation Vite), `build-images` (`needs: [tests-backend, build-frontend]`, build Docker
  backend et frontend). Aucune publication d'image vers un registre ni déploiement automatisé —
  la CI valide mais ne livre pas. **[RECOMMANDÉ]** si une mise en production continue est visée.

---

## 2. Matrice de risques

Colonnes : probabilité et impact cotés Faible/Moyenne(Moyen)/Forte, criticité déduite du
croisement des deux, état constaté dans le dépôt à la date de rédaction.

| # | Risque | Probabilité | Impact | Criticité | État | Mesure préventive | Mesure corrective |
|---|---|---|---|---|---|---|---|
| 1 | Absence de TLS (identifiants/JWT en clair sur le réseau) | Forte | Fort | **Élevée** | À FAIRE | Terminer TLS en amont (reverse proxy/LB), forcer redirection HTTP→HTTPS | Certificats (Let's Encrypt ou équivalent), renouvellement automatisé |
| 2 | Vol de JWT par XSS (`localStorage`, `AuthContext.jsx`) | Moyenne | Fort | **Élevée** | Assumé (voir §7) | CSP stricte, échappement systématique (React le fait par défaut) | Révocation de session non disponible aujourd'hui — réduire le TTL, envisager migration cookie `HttpOnly` |
| 3 | Absence de sauvegarde de la base de données | Moyenne | Fort | **Élevée** | À FAIRE | Sauvegardes automatisées chiffrées, testées régulièrement | Procédure de restauration documentée et testée |
| 4 | Secret JWT (passphrase) exposé dans l'historique git | Forte (avéré) | Moyen | Moyenne | Partiellement corrigé | Ne jamais committer de secret, `.gitignore` dès l'initialisation | Rotation de la passphrase + nettoyage d'historique (voir §5) |
| 5 | Consentement RGPD non tracé côté serveur | Forte (avéré) | Moyen | Moyenne | À FAIRE | Champ de consentement horodaté sur `User` | Migration + persistance du consentement à l'inscription |
| 6 | Compte non vérifié pleinement fonctionnel (`isVerified` non appliqué) | Forte (avéré) | Faible | Moyenne | À FAIRE | Vérifier l'email avant d'autoriser les actions sensibles | Ajout d'un contrôle d'accès conditionné à `isVerified` |
| 7 | 40 avis de sécurité sur dépendances (`composer audit`) non contrôlés en CI | Forte (avéré) | Moyen | Moyenne | À FAIRE | `composer audit` / `npm audit` en CI, bloquant sur criticité haute | Mise à jour des paquets concernés |
| 8 | Image Docker backend embarque des dépendances de dev (absence de `.dockerignore`) | Moyenne | Moyen | Moyenne | À FAIRE | `.dockerignore` excluant `vendor/`, `.env.local`, `var/` | Reconstruction de l'image après correction |
| 9 | Pas de révocation/refresh JWT : token volé reste valide jusqu'à 1h | Moyenne | Moyen | Moyenne | Assumé (voir §7) | TTL court (déjà 3600 s) | Bundle de refresh token + liste de révocation si le risque devient inacceptable |
| 10 | Validation de mot de passe absente sur `updateMe`/création admin (hors `/api/register`) | Moyenne | Moyen | Moyenne | À FAIRE | Étendre la contrainte de robustesse à ces deux routes | Réutiliser la même validation que `register` |
| 11 | CSP absente (XSS facilité si une faille d'injection HTML apparaît) | Faible | Moyen | Faible/Moyenne | À FAIRE | Définir une CSP testée contre `/api/docs` et le frontend React | Déploiement progressif (`Content-Security-Policy-Report-Only` d'abord) |
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
| 54 tests automatisés | Rejoués à 4 reprises pendant cet audit, `OK (54 tests, 72 assertions)` à chaque fois après correction |
| Dependabot (alerts, security, version updates) | `.github/dependabot.yml` — composer, npm, docker (x2), github-actions |
| Clés JWT hors dépôt, générées à l'exécution | `backend/.gitignore:23` (`/config/jwt/*.pem`), génération via `lexik:jwt:generate-keypair` (`.github/workflows/ci.yml`) |
| Mots de passe hachés Argon2id | Section 3 |

### Vulnérabilité identifiée et corrigée pendant cet audit — secrets committés

**Constat initial** : `backend/.env` était suivi par git sur l'ensemble des branches du dépôt
(`main`, `develop`, `feature-*`) et contenait `JWT_PASSPHRASE` en clair.
`docker-compose.yml` (également suivi) contenait par ailleurs `APP_SECRET: "a_changer_avant_la_prod"`
et des identifiants MySQL en clair.

**Correction** : `backend/.env` a été retiré du suivi git sur la branche de travail (vérifié :
absent de `origin/Projets:backend/.env`, alors qu'il reste présent sur `origin/main`, qui
n'a pas encore reçu ce correctif — point à traiter séparément). La rotation effective de la
passphrase n'est pas confirmée à la date de rédaction.

**Leçon retenue, à assumer à l'oral** : le retrait d'un fichier du suivi git ne l'efface pas de
l'historique. Tant qu'aucun nettoyage d'historique (`git filter-repo` ou équivalent, suivi d'un
push forcé et de la purge du cache GitHub) n'est effectué, quiconque dispose d'un accès au dépôt
peut retrouver l'ancienne valeur via `git log`/`git show` sur les commits antérieurs — exactement
la méthode utilisée pour établir ce constat pendant l'audit. Le retrait est une mesure
d'hygiène nécessaire mais non suffisante ; **seule la rotation du secret neutralise réellement
l'exposition**. **[RECOMMANDÉ]** confirmer la rotation de la passphrase et évaluer si un
nettoyage d'historique est justifié compte tenu de la sensibilité réelle (une passphrase seule,
sans la clé privée associée — qui elle n'a jamais été committée — ne permet pas à elle seule de
forger un JWT valide, ce qui limite l'impact réel malgré la mauvaise pratique).

### Corrections appliquées et vérifiées pendant cet audit

Quatre corrections, chacune validée par relecture de diff avant application puis par une
exécution complète des 54 tests PHPUnit après application :

1. **En-têtes de sécurité HTTP** — `backend/Dockerfile` (activation `mod_headers`),
   `backend/apache-vhost.conf`, `frontend/nginx.conf`. Vérifié par `curl -I` sur les deux
   services.
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

### Compléments recommandés

- `PHPStan` : absent (`phpstan/phpdoc-parser` présent dans `composer.json` n'est qu'une
  dépendance indirecte d'un autre paquet, pas l'outil d'analyse statique lui-même).
  **[RECOMMANDÉ]** ajout en CI, niveau progressif.
- `composer audit` / `npm audit` : absents de `.github/workflows/ci.yml`. **[RECOMMANDÉ]**
  étape dédiée, au minimum non bloquante dans un premier temps compte tenu des 40 avis déjà
  identifiés, puis bloquante une fois le stock traité.
- `.dockerignore` côté backend : absent, voir section 1/A05.
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
| 1 | Confirmer/effectuer la rotation de la passphrase JWT | XS | §5 |
| 2 | Mettre en place la terminaison TLS (reverse proxy ou service managé) | M | §1/§3 |
| 3 | Mettre en place des sauvegardes chiffrées de la base MySQL, avec test de restauration | M | §1/§3 |
| 4 | Ajouter `composer audit` / `npm audit` en CI et traiter les 40 avis déjà identifiés | M | §5 |
| 5 | Persister le consentement RGPD (champ horodaté sur `User`, transmis depuis le frontend) | S | §4 |
| 6 | Étendre la validation de mot de passe à `updateMe` et à la création admin | XS | §5 |
| 7 | Ajouter un `.dockerignore` backend et vérifier que l'image de prod ne contient plus les dépendances `dev` | XS | §1 |
| 8 | Appliquer le correctif d'en-têtes/CORS/rate-limiting/validation sur `origin/main` (actuellement seulement sur la branche de travail) | S | §1/§5 |
| 9 | Définir et tester une Content-Security-Policy pour le backend (`/api/docs`) et le frontend | M | §1 |
| 10 | Décider et documenter le traitement de `isVerified` (blocage effectif ou choix assumé) | S | §1 |
| 11 | Ajouter PHPStan en CI (niveau progressif) | M | §5 |
| 12 | Rédiger le registre des traitements (document externe au code) | S | §4 |
| 13 | Nettoyer l'historique git de l'ancienne valeur de `JWT_PASSPHRASE` si la sensibilité résiduelle le justifie | S | §5 |
| 14 | Poser les prérequis (HDS, AIPD, consentement explicite, chiffrement colonne) avant tout développement des modules diagnostic/tracker d'émotions | L | §4 |

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
J'ai vérifié directement sur le remote (`git cat-file -e origin/Projets:backend/.env`) que le
fichier est absent de la branche de travail actuelle, alors qu'il est toujours présent sur
`origin/main` qui n'a pas reçu ce correctif — je le signale comme action restante. Sur la
rotation de la passphrase elle-même, je n'ai pas pu confirmer qu'elle a été faite, donc je ne la
présente pas comme acquise dans le document. J'insiste sur le point que le retrait du fichier ne
suffit pas : la valeur reste consultable dans l'historique git tant qu'aucun nettoyage
d'historique n'est effectué, ce qui limite la portée réelle de la seule suppression.

**Q6. Pourquoi ne pas avoir mis en place de Content-Security-Policy alors que c'est une
recommandation OWASP standard ?**
Je l'ai volontairement exclue du lot de corrections appliquées pendant cet audit parce que
`/api/docs` sert une documentation API Platform potentiellement rendue en HTML par le navigateur,
et une CSP mal calibrée peut la casser silencieusement. Plutôt que de deviner une règle et
risquer une régression non détectée par les 54 tests PHPUnit (qui ne couvrent pas le rendu
navigateur), j'ai préféré la signaler comme action recommandée nécessitant un test navigateur
dédié plutôt que l'appliquer à l'aveugle.

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

**Q8. Comment avez-vous vérifié que vos quatre corrections n'ont rien cassé ?**
À chaque correction, j'ai montré le diff avant application, reconstruit les images Docker
concernées, puis rejoué l'intégralité des 54 tests PHPUnit (`OK (54 tests, 72 assertions)` à
chaque fois), et ajouté une vérification manuelle ciblée sur le comportement changé : en-têtes
présents via `curl -I`, origine CORS acceptée/refusée selon l'origine testée, validation
acceptant/rejetant les cas limites de mot de passe et d'email, et dépassement de seuil déclenchant
bien un blocage sur `/api/login` et `/api/register`.
