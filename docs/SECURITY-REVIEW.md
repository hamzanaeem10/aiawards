# Security Review — JazzWorld AI Impact Awards Portal

**Prepared for:** Information Security, Jazz
**Requested by:** abduhu.khan@jazz.com.pk
**Date:** 2026-09-07
**Status:** deployed to OpenShift, **pending security approval**; two egress rules requested

---

## 1. Application summary

Internal web portal for the JazzWorld AI Impact Awards. Employees ("nominees")
submit AI initiatives; an evaluation committee scores them; administrators see
aggregate results and export CSV. Next.js 15 / Node.js 22, PostgreSQL backend.

Expected volume: ~3,000 submissions per award cycle.

---

## 2. OpenShift platform details

| Item | Value |
|---|---|
| Cluster API | `https://api.ocpv2.jazz.com.pk:6443` → `10.205.186.51` |
| Console | `https://console-openshift-console.apps.ocpv2.jazz.com.pk` |
| Cluster name | `ocpv2` |
| **Namespace / project** | **`people-org`** |
| Deploying user | `ABDUHU KHAN` (abduhu.khan@jazz.com.pk) |
| Nodes running workload | `worker12.ocpv2.jazz.com.pk`, `worker18.ocpv2.jazz.com.pk` |
| Service CIDR | `172.30.0.0/16` |
| Pod subnets observed | `10.130.7.0/23`, `10.131.9.0/23` |
| Cluster DNS | `172.30.0.10` |
| Security Context Constraint | `restricted-v2` (default; no elevated privileges requested) |
| Container UID | arbitrary, `1001410000` range — **runs non-root** |

No cluster-admin rights were used or requested. No privileged containers, no
host networking, no host path mounts, no added Linux capabilities
(`capabilities: drop: ["ALL"]`, `allowPrivilegeEscalation: false`,
`runAsNonRoot: true`, `seccompProfile: RuntimeDefault`).

---

## 3. Inbound exposure

| Route (FQDN) | Resolves to | Port | TLS | Backend |
|---|---|---|---|---|
| `aiawards-people-org.apps.ocpv2.jazz.com.pk` | `10.205.186.52` (cluster ingress VIP) | 443 | **edge, HTTP→HTTPS redirect enforced** | `aiawards` svc :3000 |
| `aiawards-minio-people-org.apps.ocpv2.jazz.com.pk` | `10.205.186.52` | 443 | edge, redirect | `aiawards-minio` svc :9000 — **currently scaled to 0, not serving** |

Both are internal cluster ingress addresses (RFC1918). No public IP, no
internet-facing exposure. TLS terminates at the OpenShift router using the
cluster wildcard certificate issued by **Jazz Issuer CA-1 / Jazz Root CA**.

### Cluster-internal services (not externally reachable)

| Service | ClusterIP | Ports |
|---|---|---|
| `aiawards` | `172.30.61.216` | 3000/TCP |
| `aiawards-minio` | `172.30.221.207` | 9000, 9001/TCP |

---

## 4. Outbound (egress) — THIS IS THE APPROVAL REQUEST

The cluster performs SNI-based egress filtering. Current observed state:

| Destination (FQDN) | Port | Purpose | Status |
|---|---|---|---|
| `ep-lucky-smoke-ayph4o9n-pooler.c-5.us-east-2.aws.neon.tech` | 5432/TCP | PostgreSQL (primary datastore) | ✅ **already permitted** |
| `ep-lucky-smoke-ayph4o9n.c-5.us-east-2.aws.neon.tech` | 5432/TCP | PostgreSQL, direct (schema migrations) | ✅ already permitted |
| `fonts.googleapis.com` / `fonts.gstatic.com` | 443/TCP | Web fonts (browser-side) | ✅ already permitted |
| `registry.access.redhat.com` | 443/TCP | Red Hat UBI base images (build time only) | ✅ already permitted |
| **`br-hidden-water-aydmw5xh.storage.c-5.us-east-2.aws.neon.tech`** | **443/TCP** | **S3-compatible object storage for supporting-file attachments** | ❌ **BLOCKED — rule requested (1 of 2)** |
| **`api.openai.com`** | **443/TCP** | **Optional AI-assisted scoring aid** | ❌ **BLOCKED — rule requested (2 of 2)** |

Also observed blocked (not required, listed for completeness):
`registry-1.docker.io`, `registry.npmjs.org`, `api.groq.com`,
`api.anthropic.com`, `management.azure.com`, `login.microsoftonline.com`,
`console.neon.tech`.

**Correction (8-Sep-2026):** an earlier draft of this document stated that the
internal SMTP relay was unreachable from the cluster and requested a firewall
rule for it. That was wrong — the initial probe consumed the SMTP banner before
reading it. A pod in `people-org` has since delivered mail successfully
(`queued as 2363F3001560`). **No firewall rule is needed for email.**

> **Please allowlist by FQDN, not IP.** Both requested destinations are
> AWS/Cloudflare-fronted and their addresses rotate. IPs resolved at the time
> of writing, for reference only:
>
> - Neon object storage → `3.132.134.23`, `3.147.50.73`, `18.226.144.217`
> - Neon PostgreSQL → `18.226.144.228`, `16.58.187.204`, `3.23.109.155`
> - `api.openai.com` → `162.159.140.245`, `172.66.0.243`

**The portal functions without either rule.** Without the storage rule,
supporting-file attachments fail (demo videos are OneDrive *links*, so those
are unaffected). Without the OpenAI rule, the AI scoring aid is hidden and the
portal is fully usable — all scoring is done by humans regardless.

---

## 5. Data residency and third-party processors — REQUIRES REVIEW

This is the most material item for review.

| Processor | Location | Data sent | Status |
|---|---|---|---|
| **Neon** (PostgreSQL + object storage) | **AWS `us-east-2`, Ohio, USA** | All submission content, employee names/emails, evaluator scores and notes | **Live** |
| **OpenAI** | USA | Submission text (initiative description, impact claims, metrics) at an evaluator's explicit click | Blocked; requested |
| Google Fonts | Global CDN | Nothing — static font files fetched by the browser | Live |

**Employee-submitted business data and personal identifiers currently leave
Pakistan and reside in the United States.** This was inherited from the
existing project configuration, not chosen as part of this deployment. If
cross-border transfer is not acceptable, the datastore must move to an
in-country or in-cluster PostgreSQL instance before the cycle opens — please
advise.

Personal data held: full name, work email address, business function, team
member names, sponsor name and role. No CNIC, no payment data, no customer PII.

---

## 6. Secrets management

| Secret | Contents |
|---|---|
| `aiawards-env` | Database connection string, session signing key (`AUTH_SECRET`, 64 chars), object-storage credentials, admin bootstrap credentials, admin email allowlist |
| `aiawards-minio` | Object-storage access key / secret (unused while MinIO is scaled to 0) |

Stored as standard Kubernetes Secrets in `people-org`, mounted as environment
variables. Not committed to source control (`.env` is git-ignored, and excluded
from container images via `.dockerignore`).

**Note:** Kubernetes Secrets are base64-encoded, not encrypted at rest unless
etcd encryption is enabled cluster-wide. Please confirm whether `ocpv2` has
etcd encryption enabled.

---

## 7. Authentication and authorisation — KNOWN GAP, DISCLOSED

**Current state: authentication is email-only. No password is verified.**

Anyone who can reach the portal and enters `admin@jazz.com` obtains full
administrator access — all submissions, all evaluator scores, user management,
and CSV export of the entire cycle.

This was implemented deliberately at the project owner's request to ease setup
and demonstration. **It must not remain in place once real nominations are
accepted.** The password-based path (`bcrypt`, cost 10) remains in the codebase
and is a two-line change to restore; SSO/SAML integration is the recommended
target.

Roles: `nominee` (submit only) · `reviewer` (evaluate) · `admin` (full).
Sessions are `HS256` JWTs in an `httpOnly`, `secure`, `sameSite=lax` cookie,
7-day expiry, and **every request re-validates the account against the database**
so a deactivated user loses access immediately rather than at token expiry.

---

## 8. Storage

| PVC | Size | StorageClass | Status |
|---|---|---|---|
| `aiawards-miniodata` | 50 GiB | `huawei-csi` | Bound, **unused** |

Provisioned for an in-cluster object-storage alternative that could not start:
the `csi.huawei.com` driver does not apply `fsGroup`, so a non-root container
cannot write to the volume root. Can be released if the egress rule in §4 is
approved instead.

---

## 9. Container images and supply chain

Runtime image is built **inside the cluster** by OpenShift BuildConfig; no
externally-built application image is pulled.

| Layer | Source |
|---|---|
| Application runtime | `registry.access.redhat.com/ubi9/nodejs-22-minimal:1` |
| Build stage | `registry.access.redhat.com/ubi9/nodejs-22:1` |
| Application image | `image-registry.openshift-image-registry.svc:5000/people-org/aiawards` (internal registry only) |

Base images are Red Hat UBI, pulled from Red Hat's registry — no Docker Hub
dependency. npm dependencies are resolved outside the cluster (npmjs.org is
blocked) and baked into an internal `aiawards-deps` image; the dependency set
is pinned by `package-lock.json`.

`npm audit` reports 7 known advisories (5 moderate, 2 high) in the transitive
dependency tree. These are unremediated and should be reviewed.

---

## 9a. Penetration test — completed

Jazz Application Security Team (ISG) assessed the portal on 7–9 Sep 2026 and
raised six findings (1 critical, 3 high, 2 medium). **All six were remediated and
verified against the live deployment on 8-Sep-2026** — see
`docs/VAPT-REMEDIATION.md` for per-finding evidence.

Note that §7 below described the email-only, no-password sign-in that was in
place during setup. That has since been replaced by **email one-time-code
authentication**: 6-digit codes from a CSPRNG, stored only as a keyed HMAC,
single-use, 10-minute expiry, constant-time comparison, 5-attempt lockout, and
per-address plus per-source-IP throttling. Sessions are 8-hour JWTs with
server-side revocation on logout.

## 10. Summary of asks

1. **Allowlist `br-hidden-water-aydmw5xh.storage.c-5.us-east-2.aws.neon.tech:443`** — enables file attachments.
2. **Allowlist `api.openai.com:443`** — enables the optional AI scoring aid. Declining this is acceptable.
3. **Ruling on data residency (§5)** — employee data currently resides in the USA.
4. **Acknowledge the authentication gap (§7)** and confirm the required control before the cycle opens.
5. **Confirm etcd encryption status (§6)** on `ocpv2`.
