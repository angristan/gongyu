# Gongyu Production Dockerfile
# Uses FrankenPHP for high-performance PHP serving

ARG PHP_VERSION=8.4
ARG FRANKENPHP_VERSION=1.11
ARG COMPOSER_VERSION=2.9
ARG NODE_VERSION=24

FROM composer:${COMPOSER_VERSION} AS composer

FROM dunglas/frankenphp:${FRANKENPHP_VERSION}-php${PHP_VERSION} AS base

ARG WWWUSER=1000
ARG WWWGROUP=1000
ARG TZ=UTC
ARG APP_DIR=/var/www/html

ENV DEBIAN_FRONTEND=noninteractive \
    TERM=xterm-color \
    APP_ENV=production \
    TZ=${TZ} \
    USER=gongyu \
    ROOT=${APP_DIR} \
    COMPOSER_FUND=0 \
    COMPOSER_MAX_PARALLEL_HTTP=24 \
    XDG_CONFIG_HOME=${APP_DIR}/.config \
    XDG_DATA_HOME=${APP_DIR}/.data

WORKDIR ${ROOT}

SHELL ["/bin/bash", "-eou", "pipefail", "-c"]

RUN ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo ${TZ} > /etc/timezone

RUN apt-get update; \
    apt-get upgrade -yqq; \
    apt-get install -yqq --no-install-recommends --show-progress \
    apt-utils \
    curl \
    git \
    ca-certificates \
    sqlite3 \
    && install-php-extensions \
    pgsql \
    pdo_pgsql \
    pdo_sqlite \
    opcache \
    pcntl \
    zip \
    intl \
    # Install Datadog PHP tracer with profiling
    && curl -LO https://github.com/DataDog/dd-trace-php/releases/latest/download/datadog-setup.php \
    && php datadog-setup.php --php-bin=all --enable-profiling \
    && rm datadog-setup.php \
    && apt-get -y autoremove \
    && apt-get clean \
    && docker-php-source delete \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && rm /var/log/lastlog

RUN userdel --remove --force www-data \
    && groupadd --force -g ${WWWGROUP} ${USER} \
    && useradd -ms /bin/bash --no-log-init --no-user-group -g ${WWWGROUP} -u ${WWWUSER} ${USER}

RUN chown -R ${USER}:${USER} ${ROOT} /var/{log,run} \
    && chmod -R a+rw ${ROOT} /var/{log,run}

RUN cp ${PHP_INI_DIR}/php.ini-production ${PHP_INI_DIR}/php.ini

USER ${USER}

COPY --link --chown=${WWWUSER}:${WWWUSER} --from=composer /usr/bin/composer /usr/bin/composer

COPY --link --chown=${WWWUSER}:${WWWUSER} deploy/php.ini ${PHP_INI_DIR}/conf.d/99-gongyu.ini
COPY --link --chown=${WWWUSER}:${WWWUSER} deploy/Caddyfile /etc/caddy/Caddyfile

COPY --link --chown=${WWWUSER}:${WWWUSER} composer.json composer.lock ./

RUN composer install \
    --no-dev \
    --no-interaction \
    --no-autoloader \
    --no-ansi \
    --no-scripts \
    --audit

# Build frontend assets
FROM node:${NODE_VERSION}-slim AS npm_build

ENV ROOT=/var/www/html

WORKDIR ${ROOT}

COPY --link package.json package-lock.json ./

RUN npm ci

COPY --link . .

RUN npm run build

# Final production image
FROM base AS app

USER ${USER}

COPY --link --chown=${WWWUSER}:${WWWUSER} . .
COPY --link --chown=${WWWUSER}:${WWWUSER} --from=npm_build ${ROOT}/public/build public/build
COPY --link --chown=${WWWUSER}:${WWWUSER} --from=npm_build ${ROOT}/bootstrap/ssr bootstrap/ssr

RUN mkdir -p \
    storage/framework/{sessions,views,cache,testing} \
    storage/logs \
    storage/app/thumbnails \
    bootstrap/cache \
    database \
    && chmod -R a+rw storage bootstrap/cache database

RUN composer install \
    --classmap-authoritative \
    --no-interaction \
    --no-ansi \
    --no-dev \
    && composer clear-cache

# Default to SQLite - mount a volume to /var/www/html/database for persistence
ENV DB_CONNECTION=sqlite \
    DB_DATABASE=/var/www/html/database/database.sqlite

EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/up || exit 1

# SSR server image (optional - for Inertia server-side rendering)
FROM node:${NODE_VERSION}-slim AS ssr

ARG APP_DIR=/var/www/html

ENV NODE_ENV=production

WORKDIR ${APP_DIR}

COPY --link --from=npm_build ${APP_DIR}/bootstrap/ssr bootstrap/ssr

EXPOSE 13714

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:13714/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" || exit 1

CMD ["node", "bootstrap/ssr/ssr.js"]
