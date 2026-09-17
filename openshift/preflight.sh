#!/usr/bin/env bash
# Answers the one question that decides the whole deployment: can pods in this
# namespace reach Neon (and Groq) on the public internet?
#
#   ./openshift/preflight.sh
#
# Reads the hosts straight out of your .env, then opens a TCP connection to
# each from inside a throwaway pod.
set -uo pipefail

command -v oc >/dev/null || { echo "oc not found — install the OpenShift CLI first"; exit 2; }
NS="$(oc project -q 2>/dev/null)" || { echo "not logged in — run 'oc login' first"; exit 2; }
[ -f .env ] || { echo ".env not found — run this from the repo root"; exit 2; }

DB_HOST="$(grep -m1 '^DATABASE_URL=' .env | sed -E 's#.*@([^/?:]*).*#\1#')"
S3_HOST="$(grep -m1 '^AWS_ENDPOINT_URL_S3=' .env | cut -d= -f2- | sed -E 's#https?://##; s#/.*##')"

echo "namespace : $NS"
echo "probing   : $DB_HOST:5432 (postgres) | $S3_HOST:443 (storage) | api.groq.com:443 (ai)"
echo

# One TCP handshake per target, from a pod, using bash's /dev/tcp.
PROBE='for t in "$@"; do
  h=${t%:*}; p=${t##*:}
  if timeout 8 bash -c "exec 3<>/dev/tcp/$h/$p" 2>/dev/null; then
    echo "REACHABLE  $t"
  else
    echo "BLOCKED    $t"
  fi
done'

oc run "egress-probe-$$" \
  --image=registry.access.redhat.com/ubi9/ubi-minimal:latest \
  --restart=Never --rm --attach --quiet \
  --command -- bash -c "$PROBE" _ \
    "$DB_HOST:5432" "$S3_HOST:443" "api.groq.com:443"

cat <<'EOF'

Reading the result
------------------
postgres REACHABLE  -> Neon path. Deploy the app only (steps 1-7 in README.md).
postgres BLOCKED    -> in-cluster path. Also apply 30-postgres.yaml, and swap
                       DATABASE_URL to postgres://<user>:<pw>@aiawards-db:5432/awards
storage  BLOCKED    -> apply 31-minio.yaml and point S3_ENDPOINT at its Route.
groq     BLOCKED    -> leave GROQ_API_KEY empty; the "Run AI assessment" button
                       hides itself and the portal works without it.

If the probe pod itself never starts, the cluster cannot pull
registry.access.redhat.com either — that means image pulls need your internal
mirror, so tell me and we will adjust the BuildConfig base image.
EOF
