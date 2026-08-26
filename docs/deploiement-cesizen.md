# Plan de déploiement de CesiZen

Rapport détaillé de l'état de la chaîne CI/CD et du plan de déploiement, rédigé le 2026-08-26
après retrait de la conteneurisation Docker du dépôt (fichiers `Dockerfile` et
`docker-compose.yml` supprimés — décision assumée, voir §5). Ce document reflète le fonctionnement
réel du dépôt `Celyane/CesiZen` (GitHub, visibilité **publique**), pas une intention.

---

## 1. Vue d'ensemble de la chaîne

```
   Poste développeur
         |
   git push (branche feature/*)
         |
   Pull Request vers main
         |
         v
   +-------------------------------------------+
   |   GitHub Actions — .github/workflows/ci.yml |
   |                                             |
   |  [Tests backend]  [Qualité de code]  [Build |
   |   PHPUnit + audit    PHPStan/CS-Fixer/       frontend]
   |   composer            PHPMD/PHPCPD (phpqa)   npm build
   |     |                    |                    |
   |     +---------- tous indépendants ------------+
   +-------------------------------------------+
         |
   3 checks obligatoires (ruleset GitHub "main")
         |
   merge autorisé uniquement si les 3 sont verts
         |
         v
   main = code validé, prêt à déployer manuellement
```

Ce que fait la chaîne aujourd'hui : **intégration continue** (test + qualité + build), pas de
déploiement continu. Aucune étape ne pousse d'artefact vers un serveur ou un registre.

---

## 2. Détail des jobs CI (`.github/workflows/ci.yml`)

Déclenchement : push sur `main`/`develop`, Pull Request vers ces branches, et
`workflow_dispatch` (relance manuelle).

### `tests-backend` — Tests backend (PHPUnit)

1. Service MySQL 8.0 éphémère avec healthcheck.
2. PHP 8.4 + extensions `pdo_mysql`, `intl`, `zip`.
3. Cache Composer (clé = hash de `composer.lock`).
4. `cp .env.example .env` (nécessaire : `composer install` boot le noyau Symfony via
   `@auto-scripts`, qui exige que `.env` existe physiquement, même avant l'injection des vraies
   variables d'environnement par les étapes suivantes).
5. `composer install`.
6. Génération de la paire de clés JWT (`lexik:jwt:generate-keypair`) — jetable, propre à
   l'exécution, car `config/jwt/*.pem` n'est jamais versionné.
7. Création de la base de test + migrations.
8. Exécution de la suite PHPUnit.
9. `composer audit --no-dev` — bloquant : toute dépendance backend vulnérable fait échouer la CI.

### `code-quality` — Qualité de code backend (phpqa)

Utilise l'image `jakzal/phpqa:php8.4` (outils PHP QA packagés), exécutée en conteneur Docker
**par le runner GitHub Actions lui-même** — ceci est indépendant de la conteneurisation applicative
qui vient d'être retirée du projet ; GitHub Actions fournit Docker nativement sur `ubuntu-latest`.

1. Installation PHP 8.4 + dépendances (mêmes étapes que `tests-backend`, nécessaire pour que
   PHPStan résolve les classes via l'autoloader Composer).
2. **PHPStan** (analyse statique, niveau 3) — `phpstan.neon`.
3. **PHP-CS-Fixer** (style PSR-12, mode `--dry-run --diff`, ne modifie rien) — `.php-cs-fixer.php`.
4. **PHPMD** (complexité cyclomatique, code mort) — `phpmd.xml`.
5. **PHPCPD** (détection de code dupliqué).

Chaque outil est une étape séparée : un échec sur l'un n'empêche pas les autres de s'exécuter et
de remonter leurs propres résultats dans les logs d'Actions.

### `build-frontend` — Build frontend (React/Vite)

Node 22, `npm ci` (installation stricte depuis `package-lock.json`), puis `npm run build`. Valide
que le frontend compile — une erreur de build React/TypeScript/Vite non détectée en local est
bloquée ici avant merge.

### Job supprimé : `build-images`

Le job qui construisait les images Docker backend/frontend a été retiré le 2026-08-26, en même
temps que la suppression de `docker-compose.yml`, `backend/Dockerfile`, `backend/compose.yaml` et
`frontend/Dockerfile` : il n'y a plus rien à construire. Les fichiers de configuration serveur
(`backend/apache-vhost.conf`, `frontend/nginx.conf`, `.dockerignore` des deux côtés) sont encore
présents dans le dépôt mais **ne sont plus utilisés par aucune étape** — voir §5 pour leur devenir.

---

## 3. Protection de la branche `main`

Vérifié directement via l'API GitHub (`gh api repos/Celyane/CesiZen/rulesets`), pas supposé.

**Ruleset actif `main`** (`enforcement: active`) :

| Règle | Valeur |
|---|---|
| Suppression de la branche | Interdite |
| Push non fast-forward (force-push) | Interdit |
| Pull Request obligatoire avant merge | Oui |
| Approbations requises | 0 — assumé : projet mené en solo, GitHub interdisant l'auto-approbation, exiger une revue rendrait tout merge impossible. La valeur ajoutée retenue est le passage obligatoire par PR (historique lisible, point d'ancrage pour la CI) |
| Méthodes de merge autorisées | merge, squash, rebase |
| Checks obligatoires avant merge | `Tests backend (PHPUnit)`, `Build frontend (React/Vite)`, `Qualité de code backend (phpqa)` |
| Branche à jour exigée avant merge | Oui (`strict_required_status_checks_policy`) — évite qu'une PR validée contre un `main` obsolète casse la branche une fois fusionnée |

**Correctifs appliqués aujourd'hui (2026-08-26) sur ce ruleset**, en écho au retrait de Docker :

- Retrait de `Build des images Docker` des checks obligatoires (le job n'existe plus).
- Ajout de `Qualité de code backend (phpqa)` comme check obligatoire — il existait dans la CI
  depuis un moment mais n'était pas exigé au merge, donc une PR pouvait être fusionnée avec des
  échecs PHPStan/CS-Fixer/PHPMD/PHPCPD non résolus.

**Point d'attention historique, maintenant caduc** : le dépôt était auparavant privé, et GitHub
n'applique pas les rulesets sur un dépôt privé en compte gratuit. Le dépôt est **désormais public**
(`gh repo view` confirme `visibility: PUBLIC`) : le ruleset est donc pleinement actif et opposable,
ce n'est plus une configuration seulement déclarative.

**Conséquence du passage en public à surveiller** : un dépôt public est scanné en continu par des
robots à la recherche de secrets. Le dépôt contient dans son historique un ancien
`JWT_PASSPHRASE` committé puis retiré (voir `docs/securite-cesizen.md` §1) — la clé qu'il protégeait
a été régénérée, donc sans valeur d'exploitation, mais c'est un rappel que **tout secret committé à
partir de maintenant est immédiatement exposé publiquement**, sans délai de découverte.

---

## 4. Les trois environnements

| | Développement | Test / Recette | Production |
|---|---|---|---|
| **Emplacement** | Poste du développeur | Serveur de test / environnement d'intégration | Hébergeur choisi (UE recommandé pour la conformité RGPD) |
| **`APP_ENV`** | `dev` | `test` | `prod` |
| **Secrets** | `backend/.env.local` (non versionné) | Variables d'environnement CI (jetables, sans lien avec les environnements réels) | Variables d'environnement serveur ou gestionnaire de secrets, jamais dans un fichier versionné |
| **Base de données** | MySQL local, jeu de données factices | MySQL dédié, réinitialisé à chaque campagne | MySQL managé, sauvegardé (à mettre en place, voir `docs/securite-cesizen.md` §5) |
| **Déploiement du code** | Serveur de dev local (`symfony serve` / PHP intégré, `npm run dev`) | Code de la branche `develop`, validé par la CI | Code de `main`, validé par PR + CI + tag de version |
| **HTTPS** | Oui — certificat local de confiance du serveur Symfony CLI (`symfony server:ca:install`, corrigé le 2026-08-26 : le guide désactivait le TLS par erreur alors que `vite.config.js` proxifie déjà vers `https://127.0.0.1:8000`) | Recommandé (certificat auto-signé acceptable) | Obligatoire — certificat valide (Let's Encrypt ou équivalent) |
| **Accès** | Développeur seul | Équipe / relecteurs | Public |

---

## 5. Déploiement applicatif — état actuel et plan basique (sans conteneurisation)

La conteneurisation Docker a été retirée du dépôt (décision du 2026-08-26). Le plan ci-dessous
décrit un déploiement classique, directement transposable au jour où une conteneurisation serait
réintroduite (les fichiers `apache-vhost.conf` et `nginx.conf` encore présents dans le dépôt
documentent déjà la configuration serveur attendue et peuvent servir de base).

### Backend (Symfony)

```bash
git pull origin main
composer install --no-dev --optimize-autoloader
php bin/console lexik:jwt:generate-keypair --skip-if-exists   # première installation uniquement
php bin/console doctrine:migrations:migrate --no-interaction
php bin/console cache:clear --env=prod
```

Variables d'environnement à fournir sur le serveur (jamais dans un fichier versionné) :
`APP_ENV=prod`, `APP_SECRET`, `DATABASE_URL`, `JWT_PASSPHRASE`, `CORS_ALLOW_ORIGIN` (origine réelle
du frontend en production).

### Frontend (React/Vite)

```bash
npm ci
npm run build     # génère frontend/dist — fichiers statiques à servir
```

`VITE_API_URL` est injectée **au moment du build** (pas à l'exécution) — toute modification de
cette variable impose une reconstruction (`npm run build`) et un redéploiement des fichiers
statiques.

### En-têtes de sécurité HTTP — à rétablir avant mise en production

Régression identifiée dans `docs/securite-cesizen.md` §2 : les en-têtes CSP/HSTS/`X-Frame-Options`
etc. étaient posés dans `backend/apache-vhost.conf` et `frontend/nginx.conf`, copiés dans les
images Docker désormais supprimées. Deux options pour la remise en production, à trancher selon
l'hébergement retenu :

1. **Si le serveur cible est Apache/Nginx classique** : réutiliser tel quel le contenu de
   `apache-vhost.conf` / `nginx.conf` dans la configuration du vhost réel.
2. **Si l'hébergement n'est pas encore fixé (PaaS, etc.)** : poser les en-têtes au niveau
   applicatif via un `EventListener` Symfony sur `kernel.response` — indépendant du serveur web
   sous-jacent, donc portable quel que soit l'hébergeur choisi par la suite.

### Ce qui reste à faire pour un déploiement continu (au-delà de l'existant)

La chaîne actuelle s'arrête à la validation (CI). Pour aller jusqu'au déploiement automatisé, deux
étapes manquent, volontairement non implémentées à ce stade :

1. Publier un artefact versionné (archive du build, ou image de conteneur si la conteneurisation
   est réintroduite) vers un registre/espace de stockage.
2. Déclencher, sur un tag de version `vX.Y.Z` poussé sur `main`, un déploiement automatisé sur le
   serveur cible (SSH + script de déploiement, ou service de déploiement managé selon
   l'hébergeur).

Ce découpage est un choix assumé : la mise en production reste une décision humaine déclenchée
après recette, pas un merge automatique.

---

## 6. Ce qui est déjà en place et fonctionne correctement (à conserver)

- CI à trois jobs indépendants (tests, qualité de code, build frontend), tous requis au merge.
- `composer audit --no-dev` bloquant : aucune dépendance backend vulnérable connue ne peut être
  mergée silencieusement.
- Dependabot actif sur quatre écosystèmes (composer, npm, GitHub Actions, et anciennement Docker
  — cet écosystème peut être retiré de `.github/dependabot.yml` puisqu'il n'y a plus de
  `Dockerfile` à surveiller).
- Génération des clés JWT à l'exécution en CI, jamais versionnées.
- Ruleset GitHub actif et désormais réellement opposable (dépôt public) : PR obligatoire, 3 checks
  bloquants, branche à jour exigée.
- Cache Composer/npm en CI (clé basée sur les fichiers de lock) — accélère les exécutions
  successives sans risque de dérive de version.

## 7. Actions restantes

1. Retirer l'écosystème `docker` de `.github/dependabot.yml` (Dockerfile supprimés).
2. Rétablir les en-têtes de sécurité HTTP (§5) avant toute mise en production réelle.
3. Décider et documenter l'hébergement cible (VM classique, PaaS, ou retour à une conteneurisation
   plus tard) — ce choix conditionne la méthode exacte de déploiement du §5.
4. Mettre en place des sauvegardes automatisées de la base de données en production.
5. Si une conteneurisation est réintroduite plus tard : les fichiers `apache-vhost.conf` et
   `nginx.conf` déjà présents dans le dépôt peuvent servir de base directe.
