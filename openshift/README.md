# Deploying to OpenShift (`people-org` on `ocpv2.jazz.com.pk`)

Everything is built **inside the cluster** from your local working tree, so you
do not need Docker or Podman on your Mac — only the `oc` CLI.

```
10-imagestreams.yaml   the two image streams
11-buildconfigs.yaml   in-cluster builds: app runtime + migrator
20-app.yaml            Deployment + Service + Route + PodDisruptionBudget
21-migrate-job.yaml    one-shot: drizzle migrations + bootstrap admin
30-postgres.yaml       OPTIONAL — in-cluster Postgres (only if Neon is blocked)
31-minio.yaml          OPTIONAL — in-cluster S3   (only if Neon is blocked)
preflight.sh           decides which of those two you need
```

## The one decision

Your `.env` points at **Neon** (`...aws.neon.tech`, us-east-2) and **Groq** —
both public internet. `ocpv2.jazz.com.pk` is on-prem, so egress may be blocked.

* **Neon reachable** → deploy the app alone. Steps 1–7.
* **Neon blocked** → also deploy Postgres and MinIO in-cluster. Steps 1–7 plus 3b.

`./openshift/preflight.sh` answers this from inside a pod. Run it at step 3.

---

## 1. Install the `oc` CLI

Nothing is installed on this Mac yet. Download the client that matches the
cluster (the console has it under **?** → *Command line tools*), or:

```bash
curl -L -o /tmp/oc.tar.gz \
  https://mirror.openshift.com/pub/openshift-v4/clients/ocp/stable/openshift-client-mac-arm64.tar.gz
tar -xzf /tmp/oc.tar.gz -C /tmp oc
sudo mv /tmp/oc /usr/local/bin/oc && oc version --client
```

(Use `openshift-client-mac.tar.gz` instead of `-arm64` on an Intel Mac.)

## 2. Log in and select the project

In the console: your name (top right) → **Copy login command** → paste it. It
looks like:

```bash
oc login --token=sha256~xxxxxxxx --server=https://api.ocpv2.jazz.com.pk:6443
oc project people-org
```

Confirm you can actually create things here:

```bash
oc auth can-i create buildconfigs
oc auth can-i create deployments
oc auth can-i create routes
oc get storageclass          # needed only for the in-cluster Postgres/MinIO path
```

## 3. Preflight — can the cluster reach Neon?

```bash
./openshift/preflight.sh
```

Act on its output. If Postgres is **REACHABLE**, skip 3b.

### 3b. Only if Neon is blocked — in-cluster data services

```bash
# pick real values; these two secrets are read by the manifests
oc create secret generic aiawards-db \
  --from-literal=user=awards \
  --from-literal=password="$(openssl rand -hex 16)" \
  --from-literal=database=awards

oc apply -f openshift/30-postgres.yaml
oc rollout status deploy/aiawards-db

# MinIO: the presigned URL goes to the browser, so it needs its own Route.
# Create the Route first to learn the host, then feed it back as publicUrl.
oc create secret generic aiawards-minio \
  --from-literal=accessKey=aiawards \
  --from-literal=secretKey="$(openssl rand -hex 20)" \
  --from-literal=publicUrl=https://placeholder
oc apply -f openshift/31-minio.yaml
MINIO_HOST=$(oc get route aiawards-minio -o jsonpath='{.spec.host}')
oc patch secret aiawards-minio --type=merge \
  -p "{\"stringData\":{\"publicUrl\":\"https://$MINIO_HOST\"}}"
oc rollout restart deploy/aiawards-minio
```

Then edit `.env` before step 4 so it points in-cluster instead of at Neon:

```
DATABASE_URL=postgres://awards:<the password>@aiawards-db:5432/awards
DATABASE_URL_UNPOOLED=postgres://awards:<the password>@aiawards-db:5432/awards
S3_ENDPOINT=https://<MINIO_HOST>
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=aiawards
S3_SECRET_ACCESS_KEY=<the secretKey>
S3_BUCKET=attachments
```
…and blank out `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
so `lib/storage.ts` falls through to the `S3_*` vars.

## 4. Create the app secret from your `.env`

`.env` is gitignored and never enters the image (`.dockerignore` excludes it) —
the pods read it from this secret.

First set a real admin password and a strong `AUTH_SECRET` in `.env`:

```bash
# AUTH_SECRET signs the session JWT — a weak one is a full auth bypass
grep -q '^AUTH_SECRET=.\{40,\}' .env || echo "AUTH_SECRET is short — regenerate: openssl rand -hex 32"
grep '^BOOTSTRAP_ADMIN_EMAIL=\|^BOOTSTRAP_ADMIN_PASSWORD=' .env
```

Then:

```bash
oc create secret generic aiawards-env --from-env-file=.env \
  --dry-run=client -o yaml | oc apply -f -
```

Re-run that exact command any time `.env` changes, followed by
`oc rollout restart deploy/aiawards`.

## 5. Build both images in-cluster

```bash
oc apply -f openshift/10-imagestreams.yaml
oc apply -f openshift/11-buildconfigs.yaml

# uploads the working tree (minus .dockerignore entries) and builds there
oc start-build aiawards          --from-dir=. --follow
oc start-build aiawards-migrator --from-dir=. --follow
```

Expect ~4–8 minutes each. The build pod needs `docker.io/node:22-alpine` and
`registry.npmjs.org`. If either is blocked, uncomment the proxy / npm-mirror
env block in `11-buildconfigs.yaml` and re-run.

`--from-dir` honours `.dockerignore`, so your local `node_modules` (436 MB) and
`.next` (164 MB) are **not** uploaded — the tar should be a few MB. If you see
`oc` uploading hundreds of megabytes, stop it and use a tracked-files-only
archive instead:

```bash
git add -A && git stash create >/dev/null   # or just commit first
git archive --format=tar -o /tmp/src.tar HEAD
oc start-build aiawards --from-archive=/tmp/src.tar --follow
```

## 6. Migrate and seed the database

```bash
oc delete job/aiawards-migrate --ignore-not-found
oc apply -f openshift/21-migrate-job.yaml
oc logs -f job/aiawards-migrate
```

Expect `migrations applied` then `bootstrap admin created: <your email>`.
Both steps are idempotent, so re-running after future deploys is safe.

## 7. Deploy the app and expose it

```bash
oc apply -f openshift/20-app.yaml
oc rollout status deploy/aiawards

APP_HOST=$(oc get route aiawards -o jsonpath='{.spec.host}')
echo "https://$APP_HOST"

# APP_URL should match the real host
oc patch secret aiawards-env --type=merge \
  -p "{\"stringData\":{\"APP_URL\":\"https://$APP_HOST\"}}"
oc rollout restart deploy/aiawards

curl -sS "https://$APP_HOST/api/health"        # -> {"ok":true}
```

Then open the URL, sign in as `BOOTSTRAP_ADMIN_EMAIL`, and add reviewers at
`/admin/users`.

---

## Redeploying after a code change

```bash
oc start-build aiawards --from-dir=. --follow
```

The ImageStream trigger on the Deployment rolls the new image out by itself
(`maxUnavailable: 0`, so no downtime). If the change includes a new migration,
also rebuild `aiawards-migrator` and re-run the Job from step 6.

## Two traps this config already handles

1. **`HOSTNAME`** — Kubernetes sets it to the pod name and Next's standalone
   server binds to `$HOSTNAME`. Left alone, the app never listens on `0.0.0.0`
   and every probe fails with no useful error. The Deployment pins it to
   `0.0.0.0`.
2. **Arbitrary UID** — OpenShift's `restricted-v2` SCC ignores `USER` and runs a
   random UID in group 0. The Dockerfile group-owns `/app` and `chmod -R g=u`,
   and `.next/cache` + `/tmp` are `emptyDir` mounts. This is also why
   `30-postgres.yaml` uses the sclorg image: `docker.io/postgres` crash-loops
   under this SCC because it tries to `chown` its data directory.

## Troubleshooting

```bash
oc get pods                              # what is actually running
oc logs deploy/aiawards --tail=100       # app logs
oc describe pod -l app=aiawards          # probe failures, image pull errors
oc logs -f bc/aiawards                   # last build's log
oc get events --sort-by=.lastTimestamp | tail -30
```

| Symptom | Cause |
|---|---|
| `/api/health` → 503, pod not ready | DB unreachable from the pod. Re-run `preflight.sh`. |
| Pod ready but Route 503s | `HOSTNAME` not `0.0.0.0` — check the Deployment env. |
| Build fails in `npm ci` | No npmjs egress. Set the npm mirror in `11-buildconfigs.yaml`. |
| `CreateContainerConfigError` | `aiawards-env` secret missing or renamed. |
| TLS error connecting to Neon | Corporate TLS interception. Add `PGSSL_NO_VERIFY=1` to the secret. |
| Uploads fail, downloads 403 | `S3_ENDPOINT` must be the browser-reachable host, not the Service name. |
