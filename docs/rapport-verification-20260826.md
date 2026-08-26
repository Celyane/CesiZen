# Rapport de vérification — parcours complet CesiZen (26 août 2026)

Demande initiale : « à l'inscription j'ai une 500 — vérifie que tout fonctionne (login,
register, panel admin avec gestion user et ressources) ». Ce document couvre les bugs
trouvés, leur cause exacte, le correctif appliqué, et le résultat des tests effectués en
conditions réelles (navigateur, conteneurs reconstruits à froid).

**Convention** : chaque affirmation renvoie au commit qui contient le correctif.

---

## 1. Résumé

Trois bugs indépendants, empilés, rendaient l'authentification et toute la partie protégée
de l'application (panel admin compris) inutilisables sur un environnement fraîchement
démarré (`docker compose up -d --build`). Les trois sont corrigés et vérifiés :

| # | Symptôme observé | Cause réelle | Commit |
|---|---|---|---|
| 1 | Page blanche après build, `/api/*` renvoie du HTML avec un statut 200 | `.env` absent du conteneur — Symfony plante au boot sur chaque requête | `4d9e738` |
| 2 | 500 sur `/api/login` juste après un register réussi | `config/jwt/` vide — aucune paire de clés générée dans le conteneur | `bd45e55` |
| 3 | `/api/me` (et toute route protégée par JWT) renvoie 401 même avec un token valide | Apache/mod_php ne transmet pas l'en-tête `Authorization` à PHP par défaut | `bd45e55` |

Le rapport `partie4.md` et `docs/securisation.md` documentent la sécurisation générale ;
celui-ci documente spécifiquement ce qui a été **testé en conditions réelles** et ce qui a
été **cassé puis réparé** dans cette session.

---

## 2. Bug n°1 — page blanche, API en HTML (déjà corrigé avant cette session)

Repris ici pour mémoire car directement lié à la chaîne de pannes qui suit.

**Constat** : `curl http://localhost:8080/api/resources` renvoyait une page d'erreur PHP
fatale (`Unable to read the ".env" environment file`) avec un statut HTTP 200. Le frontend
tentait `.map()` sur cette chaîne HTML au lieu d'un tableau JSON → page blanche, exception
`TypeError: n.map is not a function` en console.

**Cause** : `Symfony\Component\Dotenv\Dotenv::bootEnv()` exige que le fichier `.env` existe
physiquement, même quand toute la config réelle vient de variables d'environnement injectées
par `docker-compose.yml`. `.env` est exclu de l'image (`.dockerignore`, il ne contient que des
secrets locaux), donc le fichier n'existait tout simplement pas dans le conteneur.

**Correctif** (`backend/Dockerfile`) : `.env.example` (committé, valeurs factices) est copié
en tant que `.env` au moment du build, ce qui donne à Symfony une valeur pour chaque
`%env(...)%` référencé — `docker-compose.yml` continue de surcharger `APP_ENV`,
`APP_SECRET`, `DATABASE_URL` avec les vraies valeurs par-dessus.

**Vérifié** : `/api/resources` renvoie `200 application/json`.

---

## 3. Bug n°2 — 500 sur register→login : clés JWT jamais générées

**Constat exact reproduit en logs backend** :

```
Uncaught PHP Exception Lexik\Bundle\JWTAuthenticationBundle\Exception\JWTEncodeFailureException:
"An error occurred while trying to encode the JWT token. Please verify your configuration
(private key/passphrase)"
  → Lcobucci\JWT\Signer\InvalidKeyProvided: "It was not possible to parse your key"
POST /api/login → 500
```

Le register lui-même réussissait (`201 Created`) — le 500 signalé venait de l'étape suivante
du flux (login, déclenché juste après l'inscription côté frontend).

**Cause** : `docker compose exec backend ls -la config/jwt/` → dossier **vide**. `config/jwt`
est volontairement exclu de l'image (secret), mais rien ne générait la paire de clés au
démarrage du conteneur — c'était une étape manuelle documentée dans
`deploiement-cesizen.md` §5.3, dans une section de dépannage, absente du mémo de démarrage
rapide en tête de document. Facile à oublier, ce qui s'est produit ici.

**Correctif** : `backend/docker-entrypoint.sh`, nouveau point d'entrée du conteneur —
génère la paire de clés au démarrage si elle est absente, avant de lancer Apache :

```sh
if [ ! -f config/jwt/private.pem ] || [ ! -f config/jwt/public.pem ]; then
    php bin/console lexik:jwt:generate-keypair --skip-if-exists
    chown -R www-data:www-data config/jwt
fi
exec "$@"
```

**Vérifié** : `docker compose down && up -d --build` (reconstruction totale), les clés sont
générées automatiquement sans aucune commande manuelle ; register puis login renvoient
`201`/`200` avec un vrai token.

**Limite assumée** : `config/jwt` n'est pas un volume persistant — chaque suppression de
conteneur régénère une nouvelle paire de clés, ce qui invalide silencieusement les tokens
émis avant. Sans conséquence en local/démo (reconnexion suffit) ; à surveiller si une
persistance des sessions entre redéploiements devient nécessaire (monter `config/jwt` en
volume nommé).

---

## 4. Bug n°3 — 401 sur toute route protégée malgré un token valide

Après correction du bug n°2, `/api/login` renvoyait bien un token, mais l'appel suivant,
`/api/me`, échouait systématiquement :

```json
{"code":401,"message":"JWT Token not found"}
```

**Diagnostic** : reproduit en tapant directement sur le backend (`curl http://localhost:8080/api/me`,
en contournant Nginx) → même erreur. Ce n'était donc pas un problème de proxy/en-têtes côté
Nginx, mais côté Apache/PHP.

**Cause** : sur Apache 2.4.13+, **mod_php ne transmet pas l'en-tête `Authorization` à PHP par
défaut**, quel que soit le contenu envoyé par le client. C'est un point d'attention classique
des déploiements Symfony+JWT sous Apache, absent de la configuration existante
(`backend/apache-vhost.conf`).

**Correctif** : ajout de `CGIPassAuth On` dans le bloc `<Directory>` du vhost (la directive
n'est pas valide directement sous `<VirtualHost>`, une première tentative l'a confirmé —
Apache refuse de démarrer avec `AH00526: CGIPassAuth not allowed in <VirtualHost> context`).

**Vérifié** : `/api/me` renvoie `200` avec les données utilisateur, en direct sur le backend
et via Nginx/HTTPS.

**Portée du bug** : ce n'est pas limité à `/api/me`. Toute route derrière le firewall `api`
(profil, panel admin, favoris, marquer comme lu, etc.) dépend du même mécanisme et était donc
cassée de la même façon avant ce correctif.

---

## 5. Parcours vérifiés en navigateur (après les trois correctifs)

Tests effectués avec Chrome piloté (pas seulement `curl`), sur `https://localhost:3443`,
conteneurs reconstruits à froid juste avant. Console navigateur et onglet réseau vérifiés à
chaque étape.

| Parcours | Résultat | Détail |
|---|---|---|
| Inscription (nouveau compte) | ✅ | `POST /api/register` → 201, redirection vers `/login`, aucune erreur console |
| Connexion | ✅ | `POST /api/login` → 200, `GET /api/me` → 200, en-tête affiche le nom de l'utilisateur connecté |
| Déconnexion | ✅ | Redirection automatique vers `/login`, menu utilisateur retiré |
| RBAC visuel (utilisateur simple) | ✅ | Pas de lien « Admin » ni de bouton « Nouvelle ressource » pour un `ROLE_USER` |
| Connexion admin | ✅ | Lien « Admin » et actions de création visibles pour `ROLE_ADMIN` |
| Panel admin — tableau de bord | ✅ | Compteurs corrects (utilisateurs / ressources / exercices) |
| Panel admin — liste utilisateurs | ✅ | Table complète, 14 comptes affichés |
| Panel admin — changement de rôle | ✅ | `PUT /api/users/{id}/role` → 200, rôle mis à jour en direct dans le tableau |
| Panel admin — anti-auto-désactivation | ✅ | La ligne de l'admin connecté (« Vous ») a ses boutons Désactiver/Supprimer **désactivés** dans l'UI |
| Panel admin — désactiver un compte | ✅ | `PUT /api/users/{id}/toggle-active` → 200, statut passe à « Désactivé » |
| Compte désactivé → tentative de login | ✅ | `401`, message explicite « Votre compte a été désactivé. Contactez un administrateur. » (`UserChecker`) |
| Panel admin — réactiver un compte | ✅ | Statut repasse à « Actif » |
| Créer une ressource | ✅ | `POST /api/resources` → 201, redirection vers la page de détail |
| Détail ressource — actions auteur | ✅ | Boutons Modifier/Supprimer/Favori/Marquer comme lu présents |
| Panel admin — liste ressources | ✅ | Ressource créée visible avec vues/favoris à 0 |
| Panel admin — suspendre une ressource | ✅ | `PATCH /api/admin/resources/{id}/visibility` → 200, statut « Suspendue » |
| Panel admin — supprimer une ressource | ✅ | Confirmation « Ressource supprimée », liste repasse à 0 |
| Panel admin — onglet Exercices | ✅ | Page charge sans erreur (liste vide, aucun exercice créé dans ce test) |

**Non testé dans cette session** : création/modification d'un exercice de respiration côté
admin (l'onglet charge correctement mais aucune donnée n'a été créée pour vérifier le
CRUD complet) ; export de données personnelles ; suppression de compte par l'utilisateur
lui-même (`DELETE /api/me`).

---

## 6. Régression

54 tests PHPUnit rejoués après chacun des trois correctifs (build Docker + fichiers modifiés
sur l'hôte) : **`OK (54 tests, 72 assertions)`** à chaque fois, aucune régression.

---

## 7. Ce qui reste à surveiller

- **Rotation des clés JWT à chaque recréation de conteneur** (§3, limite assumée) — pas un
  bug pour l'usage actuel (démonstrateur), mais à documenter si des sessions doivent survivre
  à un redéploiement.
- **`deploiement-cesizen.md` §1 (démarrage rapide)** ne mentionne plus la génération de clés
  JWT comme étape manuelle puisqu'elle est désormais automatique (`docker-entrypoint.sh`) —
  cohérent, aucune action requise, mentionné ici pour traçabilité du changement de
  comportement.
- Les comptes de test créés pendant cette vérification (`marie.curie.browsertest@…`,
  `autofix.…@…`, promu `ROLE_ADMIN` manuellement en base pour les besoins du test) sont
  laissés dans la base locale — à supprimer via le panel admin si une base propre est
  nécessaire avant une démonstration.
