#!/usr/bin/env bash
# init-letsencrypt.sh
# Bootstrap Let's Encrypt certificates with Nginx in Docker Compose
# Solves the chicken-and-egg problem where Nginx fails to start without certificates.

set -e

if [ -f .env ]; then
  # Load DOMAIN and EMAIL from .env if present
  export $(grep -E '^(DOMAIN|CERTBOT_EMAIL)=' .env | xargs)
fi

DOMAIN="${DOMAIN:-localhost}"
EMAIL="${CERTBOT_EMAIL:-admin@example.com}"
STAGING=0 # Set to 1 if testing to avoid Let's Encrypt rate limits
RSA_KEY_SIZE=4096
DATA_PATH="./certbot"

echo "=== Initializing SSL for domain: $DOMAIN (Email: $EMAIL) ==="

if [ -d "$DATA_PATH/conf/live/$DOMAIN" ] && [ -f "$DATA_PATH/conf/live/$DOMAIN/fullchain.pem" ]; then
  read -p "Existing certificate found for $DOMAIN. Replace? (y/N) " decision
  if [ "$decision" != "y" ] && [ "$decision" != "Y" ]; then
    echo "Skipping SSL initialization."
    exit 0
  fi
fi

mkdir -p "$DATA_PATH/conf/live/$DOMAIN"
mkdir -p "$DATA_PATH/www"

echo "### Creating dummy certificate for $DOMAIN so Nginx can boot..."
openssl req -x509 -nodes -newkey rsa:$RSA_KEY_SIZE -days 1 \
  -keyout "$DATA_PATH/conf/live/$DOMAIN/privkey.pem" \
  -out "$DATA_PATH/conf/live/$DOMAIN/fullchain.pem" \
  -subj "/CN=localhost"

echo "### Starting Nginx..."
docker compose up --force-recreate -d nginx

echo "### Deleting dummy certificate..."
rm -rf "$DATA_PATH/conf/live/$DOMAIN"

echo "### Requesting real Let's Encrypt certificate for $DOMAIN..."
# Staging flag if enabled
staging_arg=""
if [ $STAGING -ne 0 ]; then staging_arg="--staging"; fi

# Email flag
email_arg="--email $EMAIL"
if [ -z "$EMAIL" ]; then email_arg="--register-unsafely-without-email"; fi

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    -d $DOMAIN \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --force-renewal" certbot

echo "### Reloading Nginx with new certificate..."
docker compose exec nginx nginx -s reload

echo "=== SSL setup completed successfully! ==="
