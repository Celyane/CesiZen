#!/bin/sh
# config/jwt/ est volontairement absent de l'image (secret, exclu via
# .dockerignore) : sans cette étape, chaque conteneur démarre avec un
# dossier vide et toute authentification échoue avec
# JWTEncodeFailureException ("impossible de parser la clé").
set -e

if [ ! -f config/jwt/private.pem ] || [ ! -f config/jwt/public.pem ]; then
    echo "==> Génération des clés JWT (absentes de ce conteneur)"
    # Le conteneur tourne déjà en www-data (non-root) : config/jwt lui
    # appartient depuis le build, pas de chown à faire ici — il échouerait
    # de toute façon (Operation not permitted) sans droits root.
    php bin/console lexik:jwt:generate-keypair --skip-if-exists
fi

exec "$@"
