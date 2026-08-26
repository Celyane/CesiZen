# ---- Étape 1 : dépendances Composer ----
# Isolée dans son propre stage : Composer lui-même (et le cache qu'il
# utilise) n'a aucune raison de se retrouver dans l'image d'exécution.
FROM composer:2 AS vendor
WORKDIR /build
COPY composer.json composer.lock symfony.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --ignore-platform-reqs

# ---- Étape 2 : image d'exécution ----
FROM php:8.4-apache

# Paquets système à jour avant d'installer quoi que ce soit d'autre :
# l'image de base peut retarder de plusieurs semaines sur les correctifs
# Debian, et un scan de vulnérabilités bloquant sur l'image publiée
# (CRITICAL/HIGH) suppose de partir d'une base déjà patchée.
RUN apt-get update && apt-get upgrade -y \
&& apt-get install -y --no-install-recommends \
git unzip libicu-dev libzip-dev \
&& docker-php-ext-install pdo_mysql intl zip opcache \
&& a2enmod rewrite headers \
&& rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
/etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf \
# Port non privilégié : nécessaire pour tourner en non-root plus bas.
&& sed -ri 's/^Listen 80$/Listen 8080/' /etc/apache2/ports.conf

COPY apache-vhost.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html

COPY --from=vendor /build/vendor ./vendor
# Symfony's Dotenv::bootEnv() requires the .env file to physically exist,
# and its values are resolved eagerly while compiling the prod container
# (DATABASE_URL, DEFAULT_URI, JWT_PASSPHRASE...) even for services never
# used at request time. .env itself holds real local secrets and is
# excluded via .dockerignore, so .env.example (committed, placeholder
# values only, same shape) is copied in its place. docker-compose still
# overrides APP_ENV/APP_SECRET/DATABASE_URL with the real runtime values —
# only the keys it doesn't override (DEFAULT_URI, JWT_PASSPHRASE, CORS...)
# keep these placeholders, harmless for the routes that don't need them.
COPY . .
RUN cp .env.example .env \
    && composer dump-autoload --optimize \
    && mkdir -p var config/jwt \
    && APP_ENV=prod php bin/console cache:warmup --no-interaction \
    && chmod +x docker-entrypoint.sh \
    # Utilisateur non-root : www-data existe déjà dans l'image de base
    # (c'est déjà lui qui exécute les workers Apache par défaut). On lui
    # donne la propriété de tout ce dont l'application a besoin d'écrire
    # ou de lire au runtime, y compris les logs et le PID Apache — sans
    # ça, un Apache non-root ne peut ni écrire ses logs ni démarrer.
    && mkdir -p /var/run/apache2 \
    && chown -R www-data:www-data var config/jwt /var/log/apache2 /var/run/apache2

USER www-data

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["apache2-foreground"]

EXPOSE 8080
