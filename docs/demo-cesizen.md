# Démo CesiZen — mémo du jour J

---

## 1. Avant de commencer

- Démarrer Docker Desktop (icône baleine verte, "Engine running") — à faire quelques minutes en
  avance, le premier démarrage à froid prend un peu de temps.
- Vérifier que le fichier `.env` existe bien à la racine du projet (`APP_SECRET`, `DB_PASSWORD`,
  `DB_ROOT_PASSWORD`) — non versionné, il doit déjà être sur le poste utilisé pour la démo.

---

## 2. Démarrer le conteneur

Depuis la racine du projet (`cesiZen/`) :

```bash
docker compose up -d
docker compose ps
```

Attendre que les trois services affichent `healthy` (quelques secondes à quelques dizaines de
secondes selon que les images sont déjà construites ou non).

Si les images n'ont jamais été construites sur ce poste, ou après une modification des
`Dockerfile` :

```bash
docker compose up -d --build
```

Si c'est un tout premier démarrage (base vide), appliquer les migrations :

```bash
docker compose exec -u www-data backend php bin/console doctrine:migrations:migrate --no-interaction
```

---

## 3. Accéder à l'application en HTTPS

Ouvrir **https://localhost:3443** dans le navigateur.

Le certificat est auto-signé (usage local) : le navigateur affiche un avertissement de sécurité la
première fois — cliquer sur *Avancé* puis *Continuer vers localhost*. C'est attendu, pas une
erreur de configuration (voir `docs/docker-cesizen.md` §3.4 pour l'explication).

Accès direct à l'API pour du test manuel (Swagger, `curl`), sans passer par le frontend :
`http://localhost:8080/api`

---

## 4. Après la démo

```bash
docker compose down
```

Les données de la base restent intactes (volume `db_data`) — `down` n'arrête que les conteneurs.

---

## 5. Modifier la couleur d'un bouton et vérifier que la CI/CD fonctionne

**Instructions pour toi — non exécutées.**

### Où changer la couleur

Le bouton principal (`.btn-primary`, utilisé partout dans l'appli) tire sa couleur d'une seule
variable CSS :

`frontend/src/index.css`, ligne 13 :
```css
--color-primary: #1BA11B;
```

Changer cette valeur suffit à faire changer tous les boutons primaires de l'application (un seul
endroit à modifier, effet visible immédiatement partout — pratique pour une démo).

### Étapes

```bash
# 1. Nouvelle branche dédiée
git checkout main
git pull origin main
git checkout -b demo/couleur-bouton

# 2. Modifier frontend/src/index.css ligne 13, par exemple :
#    --color-primary: #1B6FA1;

# 3. Commit et push
git add frontend/src/index.css
git commit -m "style: change primary button color"
git push -u origin demo/couleur-bouton

# 4. Ouvrir la Pull Request vers main
gh pr create --base main --head demo/couleur-bouton \
  --title "style: change primary button color" \
  --body "Démo : vérification que la CI/CD réagit à un changement trivial."
```

### Ce qu'il faut observer

Sur l'onglet **Pull Request** (ou **Actions**) de GitHub, les 4 checks obligatoires se déclenchent
automatiquement :

1. `Tests backend (PHPUnit)`
2. `Build frontend (React/Vite)`
3. `Qualité de code backend (phpqa)`
4. `Build des images Docker`

Ils passent tous au vert en 2-3 minutes. La PR ne peut pas être fusionnée tant qu'un seul est
rouge ou en attente (ruleset actif sur `main`) — bon point à montrer si la démo porte aussi sur la
CI/CD, pas seulement sur l'application.

### Fusionner et voir le changement dans le conteneur

```bash
gh pr merge --squash
git checkout main
git pull origin main
docker compose up -d --build frontend
```

Le rebuild de l'image `frontend` est nécessaire : le CSS est intégré au build React au moment de
`docker build`, pas rechargé à chaud dans un conteneur déjà démarré. Recharger
**https://localhost:3443** ensuite pour voir la nouvelle couleur.

---

## 6. Déclencher manuellement la CD (publication des images sur GHCR)

**Instructions pour toi — non exécutées.**

Rappel : `cd.yml` n'a **aucun déclencheur automatique** (voir `docs/deploiement-cesizen.md` §2
bis) — ni push, ni merge, ni tag ne le lance. C'est un geste manuel volontaire, à faire depuis
`main` une fois qu'on veut publier une nouvelle version des images. Deux façons équivalentes de le
déclencher pour la démo :

### Option A — depuis l'interface GitHub (le plus visuel pour une démo)

1. Aller sur l'onglet **Actions** du dépôt.
2. Dans la liste des workflows à gauche, cliquer sur **CD**.
3. Cliquer sur le bouton **Run workflow** (en haut à droite de la liste des runs).
4. Vérifier que la branche sélectionnée est **main**.
5. Champ `tag` optionnel : laisser vide pour ne publier que `latest` + le sha court, ou renseigner
   une version explicite, par ex. `v1.0.0`.
6. Cliquer sur le bouton vert **Run workflow**.

Le run apparaît en quelques secondes dans la liste, avec le job `push-images` (build + push
backend, puis build + push frontend).

### Option B — depuis le terminal (`gh` CLI)

```bash
# Sans tag de version (latest + sha court uniquement)
gh workflow run cd.yml --ref main

# Avec un tag de version explicite
gh workflow run cd.yml --ref main -f tag=v1.0.0

# Suivre l'exécution en direct
gh run watch $(gh run list --workflow=cd.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

### Ce qu'il faut observer

- Le run se termine au bout d'1-2 minutes (deux builds Docker + deux push).
- Sur **Packages** (page du dépôt ou `https://github.com/Celyane/CesiZen/packages`), les deux
  images apparaissent : `cesizen-backend` et `cesizen-frontend`, avec les tags publiés.
- **Premier run seulement** : les packages sont créés en visibilité **privée** par défaut, même
  sur un dépôt public. Aller dans **Package settings → Change visibility → Public** sur chacun des
  deux pour qu'un `docker pull` fonctionne sans authentification ensuite — bon point à mentionner
  si la démo porte sur la CD (piège classique de GHCR, pas un bug du workflow).
- Ce run **ne modifie rien sur le poste de démo** : il publie des images sur le registre, il ne
  redémarre aucun conteneur local. Le conteneur `frontend`/`backend` lancé en §2 continue de
  tourner sur les images construites localement, indépendamment de ce qui vient d'être publié sur
  GHCR — bon point à clarifier si la question revient ("ça a rien changé à l'écran" est le
  comportement attendu, pas un échec).
