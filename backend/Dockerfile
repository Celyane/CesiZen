FROM php:8.4-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
git unzip libicu-dev libzip-dev \
&& docker-php-ext-install pdo_mysql intl zip opcache \
&& a2enmod rewrite headers \
&& rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
/etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf

COPY apache-vhost.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html

COPY composer.json composer.lock symfony.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist

COPY . .
# Symfony's Dotenv::bootEnv() requires the .env file to physically exist,
# and its values are resolved eagerly while compiling the prod container
# (DATABASE_URL, DEFAULT_URI, JWT_PASSPHRASE...) even for services never
# used at request time. .env itself holds real local secrets and is
# excluded via .dockerignore, so .env.example (committed, placeholder
# values only, same shape) is copied in its place. docker-compose still
# overrides APP_ENV/APP_SECRET/DATABASE_URL with the real runtime values —
# only the keys it doesn't override (DEFAULT_URI, JWT_PASSPHRASE, CORS...)
# keep these placeholders, harmless for the routes that don't need them.
RUN cp .env.example .env \
    && composer dump-autoload --optimize \
    && mkdir -p var config/jwt \
    && APP_ENV=prod php bin/console cache:warmup --no-interaction \
    && chown -R www-data:www-data var config/jwt

EXPOSE 80
