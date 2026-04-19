#!/usr/bin/env bash
set -euo pipefail

DOMAIN="okaytoday.health"
APP_PORT=3000
EMAIL="rmg9725@nyu.edu"

echo "==> Installing nginx + certbot"
sudo apt-get update -q
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Writing nginx config"
sudo tee /etc/nginx/sites-available/caretaker > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/caretaker /etc/nginx/sites-enabled/caretaker
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "==> Obtaining SSL certificate (Let's Encrypt)"
sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --domains "${DOMAIN},www.${DOMAIN}" \
  --redirect

sudo systemctl reload nginx

echo ""
echo "Done! Site is live at https://${DOMAIN}"
echo "Test: curl -sS https://${DOMAIN}/healthz"
