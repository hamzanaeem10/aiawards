#!/usr/bin/env bash
# Builds the `aiawards-env` secret from .env, correctly.
#
#   ./openshift/make-secret.sh
#
# Why not `oc create secret --from-env-file=.env` directly? Two reasons:
#  1. It does NOT strip surrounding quotes. Your DATABASE_URL is quoted, so the
#     pods would receive a connection string with literal " characters and pg
#     would fail to parse it.
#  2. It happily creates a secret with no BOOTSTRAP_ADMIN_* set, and db:seed
#     then falls back to admin@jazzworld.test / password123 — a default-
#     credential admin on a public portal.
set -euo pipefail

command -v oc >/dev/null || { echo "oc not found"; exit 2; }
oc project -q >/dev/null 2>&1 || { echo "not logged in — run 'oc login'"; exit 2; }
[ -f .env ] || { echo ".env not found — run from the repo root"; exit 2; }

TMP="$(mktemp -t aiawards-env)"
trap 'rm -f "$TMP"' EXIT

# Strip comments, blank lines, `export `, and surrounding single/double quotes.
sed -E \
  -e 's/^[[:space:]]*export[[:space:]]+//' \
  -e '/^[[:space:]]*#/d' \
  -e '/^[[:space:]]*$/d' \
  -e 's/^([A-Za-z_][A-Za-z0-9_]*)=[[:space:]]*"(.*)"[[:space:]]*$/\1=\2/' \
  -e "s/^([A-Za-z_][A-Za-z0-9_]*)=[[:space:]]*'(.*)'[[:space:]]*\$/\1=\2/" \
  .env > "$TMP"

# Keep only lines that are still a plain KEY=value (drops anything malformed).
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$TMP" > "$TMP.clean" && mv "$TMP.clean" "$TMP"

fail=0
need() {
  grep -qE "^$1=.+" "$TMP" || { echo "  MISSING  $1"; fail=1; }
}
echo "checking required keys:"
need DATABASE_URL
need AUTH_SECRET
need BOOTSTRAP_ADMIN_EMAIL
need BOOTSTRAP_ADMIN_PASSWORD

if [ "$fail" -ne 0 ]; then
  cat <<EOF

Add the missing keys to .env, then re-run. For the bootstrap admin, append:

  BOOTSTRAP_ADMIN_EMAIL=$(oc whoami 2>/dev/null | grep @ || echo 'you@jazz.com.pk')
  BOOTSTRAP_ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)
  BOOTSTRAP_ADMIN_NAME=Awards Admin

(That password is freshly generated — save it in your password manager. It is
the only account that exists until you add reviewers at /admin/users.)
EOF
  exit 1
fi

# AUTH_SECRET signs the session JWT; a short one is an auth-bypass risk.
LEN=$(awk -F= '/^AUTH_SECRET=/{print length(substr($0, index($0,"=")+1))}' "$TMP")
if [ "${LEN:-0}" -lt 32 ]; then
  echo "  WEAK     AUTH_SECRET is only ${LEN} chars — regenerate: openssl rand -hex 32"
  exit 1
fi
echo "  ok       all required keys present, AUTH_SECRET is ${LEN} chars"

echo
echo "keys going into secret/aiawards-env:"
cut -d= -f1 "$TMP" | sed 's/^/  /'

oc create secret generic aiawards-env --from-env-file="$TMP" \
  --dry-run=client -o yaml | oc apply -f -

echo
echo "done. if the app is already running: oc rollout restart deploy/aiawards"
