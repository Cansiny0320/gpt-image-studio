#!/bin/sh
# Install under /etc/letsencrypt/renewal-hooks/deploy/ with mode 755.
set -eu
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/gpt-image-relay ] || exit 0
nginx -t
systemctl reload nginx
