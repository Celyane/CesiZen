# Plan de déploiement de CesiZen

Rapport détaillé de l'état de la chaîne CI/CD et du plan de déploiement, mis à jour le 2026-08-26.
Le déploiement repose sur une conteneurisation Docker (frontend Nginx, backend Apache, base
MySQL) — voir `docs/docker-cesizen.md` pour le détail de cette architecture. Ce document reflète
le fonctionnement réel du dépôt `Celyane/CesiZen` (GitHub, visibilité **publique**), pas une
intention.

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
   +----------------------------------------------------------------+
   |   GitHub Actions — .github/workflows/ci.yml                     |
   |                                                                  |
   |  [Tests backend]  [Qualité de code]  [Build      |
   |   PHPUnit + audit    PHPStan/CS-Fixer/       frontend]           |
   |   composer            PHPMD/PHPCPD (phpqa)   npm build           |
   |     |                    |                    |                 |
   |     +---------- tous indépendants -------------+                |
   |                          |                                      |
   |                          v                                      |
   |              [ Build des images Docker ]                        |
   |               backend + frontend (needs: les 3 précédents)      |
   +----------------------------------------------------------------+
         |
   4 checks obligatoires (ruleset GitHub "main")
         |
   merge autorisé uniquement si les 4 sont verts
         |
         v
   main = code validé, images Docker construites, prêt à déployer manuellement
```

Ce que fait la chaîne aujourd'hui : **intégration continue** (test + qualité + build applicatif +
build des images Docker), pas de déploiement continu. Aucune étape ne pousse d'image vers un
registre ni ne déploie sur un serveur.

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

### `build-images` — Build des images Docker

`needs: [tests-backend, code-quality, build-frontend]` — ne démarre que si les trois jobs
précédents ont réussi. Construit `backend/Dockerfile` et `frontend/Dockerfile` (`docker build`,
sans les publier vers un registre) : valide que les deux images sont reproductibles à partir d'un
checkout propre, indépendamment des tests applicatifs (une dépendance système retirée, par
exemple, casse ce job sans faire bouger un seul test PHPUnit).

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
| Checks obligatoires avant merge | `Tests backend (PHPUnit)`, `Build frontend (React/Vite)`, `Qualité de code backend (phpqa)`, `Build des images Docker` |
| Branche à jour exigée avant merge | Oui (`strict_required_status_checks_policy`) — évite qu'une PR validée contre un `main` obsolète casse la branche une fois fusionnée |

**Historique de ce ruleset (2026-08-26)** : `Qualité de code backend (phpqa)` a été ajouté comme
check obligatoire — il existait dans la CI depuis un moment mais n'était pas exigé au merge, donc
une PR pouvait être fusionnée avec des échecs PHPStan/CS-Fixer/PHPMD/PHPCPD non résolus. Le check
`Build des images Docker` a brièvement été retiré puis réintégré le même jour, le temps de
reconstruire proprement le dispositif de conteneurisation (voir `docs/docker-cesizen.md`).

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
| **HTTPS** | Oui — certificat local de confiance du serveur Symfony CLI (`symfony server:ca:install`) hors Docker, ou certificat auto-signé du conteneur `frontend` si la stack Docker est utilisée en local | Certificat auto-signé du conteneur `frontend` (acceptable en recette) | Obligatoire — certificat de confiance (Let's Encrypt ou équivalent) via un reverse proxy en amont des conteneurs |
| **Accès** | Développeur seul | Équipe / relecteurs | Public |

---

## 5. Déploiement applicatif — conteneurisé (Docker)

Le déploiement repose sur les trois conteneurs décrits en détail dans `docs/docker-cesizen.md` :
`frontend` (Nginx, HTTPS), `backend` (Apache + PHP 8.4), `db` (MySQL 8.0). Résumé opérationnel ici
; le détail de l'architecture, des choix techniques et des problèmes déjà résolus est dans ce
second document pour ne pas le dupliquer.

```bash
git pull origin main
# .env à la racine (non versionné) : APP_SECRET, DB_PASSWORD, DB_ROOT_PASSWORD
docker compose build
docker compose up -d
docker compose exec -u www-data backend php bin/console doctrine:migrations:migrate --no-interaction
docker compose ps
```

Points clés à retenir pour le déploiement (détaillés dans `docs/docker-cesizen.md`) :
- Seuls deux ports sont publiés, et uniquement sur `127.0.0.1` : `3443` (frontend HTTPS) et `8080`
  (backend, debug direct). **La base de données ne publie aucun port** — non joignable depuis
  l'hôte ni depuis l'extérieur, uniquement par le backend sur le réseau interne `back`.
- Les clés JWT et le certificat TLS ne sont jamais dans l'image ni dans Git.
- `VITE_API_URL` est injectée **au moment du build** de l'image frontend — changer sa valeur
  impose de reconstruire l'image (`docker compose build frontend`), pas seulement de la relancer.

### Ce qui reste à faire pour aller jusqu'à un vrai déploiement en production

1. **Certificat TLS de confiance** : remplacer l'auto-signé par un certificat réel (Let's Encrypt
   ou équivalent), typiquement via un reverse proxy en amont des conteneurs plutôt que dans
   l'image `frontend` elle-même.
2. **Sauvegardes automatisées** du volume `db_data` (voir `docs/securite-cesizen.md`).
3. **Publier les images vers un registre** (GitHub Container Registry, Docker Hub, ou registre
   privé) puis déclencher, sur un tag de version `vX.Y.Z`, un déploiement automatisé sur le
   serveur cible (`docker compose pull && docker compose up -d`) — non implémenté à ce stade.

Ce découpage est un choix assumé : la mise en production reste une décision humaine déclenchée
après recette, pas un merge automatique. La chaîne CI actuelle relève de l'**intégration
continue** (elle teste, valide la qualité et construit les images) ; les trois points ci-dessus
sont ce qui manque pour du **déploiement continu**.

---

## 6. Ce qui est déjà en place et fonctionne correctement (à conserver)

- CI à quatre jobs (tests, qualité de code, build frontend, build des images Docker), tous requis
  au merge — vérifiée par un build et un démarrage réel de la stack complète (HTTPS, proxy `/api`,
  isolation réseau de la base testés manuellement le 2026-08-26).
- `composer audit --no-dev` bloquant : aucune dépendance backend vulnérable connue ne peut être
  mergée silencieusement.
- Dependabot actif sur cinq écosystèmes (composer, npm, Docker backend/frontend, GitHub Actions).
- Génération des clés JWT à l'exécution (CI et conteneur backend), jamais versionnées.
- Ruleset GitHub actif et réellement opposable (dépôt public) : PR obligatoire, 4 checks
  bloquants, branche à jour exigée.
- Cache Composer/npm en CI (clé basée sur les fichiers de lock) — accélère les exécutions
  successives sans risque de dérive de version.
- Réseau Docker segmenté (`front`/`back`), base de données sans port publié, utilisateurs non-root
  des deux côtés — voir `docs/docker-cesizen.md` §3 pour le détail.

## 7. Actions restantes

1. Remplacer le certificat auto-signé par un certificat de confiance avant tout déploiement public
   réel (voir §5).
2. Mettre en place des sauvegardes automatisées du volume `db_data`.
3. Publier les images vers un registre et automatiser le déploiement sur tag de version, si un
   déploiement continu est visé.
