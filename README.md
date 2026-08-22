# CesiZen

Application web bien-être permettant de consulter des ressources et de réaliser des exercices de respiration guidés.

**Stack :** Symfony 8 (API REST + JWT) · React + Vite · MySQL

---

## Prérequis

- PHP >= 8.4, Composer, Symfony CLI
- MySQL >= 8.0
- Node.js >= 18, npm

---

## Installation

### Backend

```bash
cd backend
composer install
```

Copier `.env` en `.env.local` et renseigner la connexion MySQL :

```
DATABASE_URL="mysql://root:root@127.0.0.1:8889/cesizen?serverVersion=8.0.32&charset=utf8mb4"
```

Créer la base et migrer :

```bash
php bin/console doctrine:database:create
php bin/console doctrine:migrations:migrate --no-interaction
```

Démarrer le serveur :

```bash
symfony server:start --no-tls -d
# → http://127.0.0.1:8000
```

> Pour passer un compte en admin :
> ```sql
> UPDATE user SET role = '["ROLE_ADMIN"]' WHERE email = 'votre@email.com';
> ```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

> Le fichier `vite.config.js` proxifie `/api` vers `http://127.0.0.1:8000`. Ne pas appeler le backend directement depuis le navigateur.

---

## Tests

```bash
cd backend

# Créer la base de test
php bin/console doctrine:database:create --env=test
php bin/console doctrine:migrations:migrate --no-interaction --env=test

# Lancer les tests
php bin/phpunit
```

---

## Rôles

| Rôle | Permissions |
|---|---|
| `ROLE_USER` | Consulter les ressources, réaliser des exercices, gérer son profil |
| `ROLE_REDACTOR` | + Créer et modifier ses propres ressources |
| `ROLE_ADMIN` | + Gérer utilisateurs, toutes les ressources, exercices, accès `/admin` |

---

## Structure du projet

```
cesizen/
├── backend/    Symfony 8 — API REST, entités, migrations, tests PHPUnit
└── frontend/   React + Vite — interface utilisateur
```
![CI](https://github.com/Celyane/CesiZen/actions/workflows/ci.yml/badge.svg)
