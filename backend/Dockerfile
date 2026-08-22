FROM php:8.5-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
git unzip libicu-dev libzip-dev \
&& docker-php-ext-install pdo_mysql intl zip opcache \
&& a2enmod rewrite \
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
RUN composer dump-autoload --optimize \
    && mkdir -p var config/jwt \
    && APP_ENV=prod APP_SECRET=build php bin/console cache:warmup --no-interaction || true \
    && chown -R www-data:www-data var config/jwt

EXPOSE 80
