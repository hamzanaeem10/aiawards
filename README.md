# JazzWorld AI Impact Awards — Portal

Nomination submission + evaluation committee portal. Next.js (App Router) · Postgres ·
MinIO/S3 for attachments · pg-boss for background jobs · Claude for **advisory-only**
assistance. Self-hosted (Docker).

## UI

Premium design system in `app/globals.css` (Fraunces display + Inter, brand
maroon/aubergine, soft elevation). Shared chrome in `app/components/SiteHeader.tsx`
with the JazzWorld lockup (`app/components/Logo.tsx` — placeholder mark, swap in the
official SVG when available).

## Assessment framework — provisional

The criteria / weights / thresholds live in `lib/rubric.ts` and are **not finalised**.
Every total is shown as "indicative"; a draft-framework banner appears on the evaluate
screen. Finalise by editing that one file.

## Scoring policy (important)

**All scoring and outcomes are done by humans.** The six weighted criteria
(Impact 30 / Evidence 20 / AI Innovation 15 / Scalability 15 / Responsible AI 10 /
Adoption 10), the tier, and the final recommendation are written only by a reviewer's
or the panel chair's action (`app/committee/.../actions.ts`, `app/admin/assign/actions.ts`).

Claude is used at exactly two advisory points, both **labelled in the UI and fully
editable**:

| Where | What | Never |
|---|---|---|
| On submission intake (`lib/ai/intake.ts`) | Orientation summary, clarifying questions, completeness flags, similarity note | score / rank / recommend |
| After reviewers score (`lib/ai/synthesis.ts`) | Draft consensus note + draft feedback letter for the chair to edit | change a score / decide the outcome |

The system prompt in `lib/ai/client.ts` (`ADVISORY_SYSTEM`) hard-codes this boundary.
Set `AI_DISABLED=1` and the portal works fully with no AI.

## Supporting evidence

The submit form (`app/submit/Evidence.tsx`) collects a **required demo video**
(mp4/mov/webm, ≤ 250 MB — inline preview before submit), an optional **live link**
and **code repository** URL, and up to 6 optional **supporting files** (≤ 25 MB
each). Limits live in `lib/uploads.ts` and are re-checked in the submit server
action. Videos post through the server action, so `next.config.js` sets
`serverActions.bodySizeLimit` to `300mb`. The evaluate screen plays the demo
inline and lists every link/file with 5-minute signed URLs.

## Roles

`nominee` · `reviewer` · `chair` · `admin`. Nominees can also submit with no account.

## Local dev

```bash
cp .env.example .env          # fill ANTHROPIC_API_KEY (or set AI_DISABLED=1)
docker compose up -d db minio minio-init
npm install
npm run db:generate           # generate SQL migration from lib/db/schema.ts
npm run db:migrate
npm run db:seed               # test users, password: password123
npm run worker &              # background jobs (intake + synthesis)
npm run dev                   # http://localhost:3000
```

Seeded logins: `admin@ / chair@ / reviewer1@ / reviewer2@ / nominee@jazzworld.test`.

> Don't run `npm run build` while `npm run dev` is running — they share `.next` and
> it corrupts. Stop dev, `rm -rf .next`, then build.

## Flow

1. `/submit` — nominee fills the form, adds the demo video + links + files →
   stored in Postgres + MinIO, status `SUBMITTED`, advisory intake job enqueued.
2. Worker calls Claude → `ai_insights` row (`intake_summary`), advisory only.
3. `/committee/queue` — every submission, paginated. Any signed-in evaluator
   (`reviewer` / `chair`) opens one.
4. `/committee/evaluate/[id]` — one self-contained screen: full submission +
   demo + attachments, the 6-criterion score with a live weighted total and
   recommended next step, the governance checklist, and the recommendation.
   **Record assessment** auto-advances the submission to the suggested lifecycle
   step (Award/Finalist are gated on the governance checks).
5. `/admin` — read-only overview of every submission and its recorded assessment;
   compose and release the feedback letter to the nominee (optional AI draft).
6. `/status/[id]` — nominee tracks status and reads released feedback.

## Scale & resilience (sized for ~3000 submissions / cycle)

- **Uploads** are deliberately small (`lib/uploads.ts`: 50 MB video, 5 × 10 MB
  files) and post through the server action; `next.config.js` caps the body at
  110 MB. Worst-case in-flight memory per upload ≈ 100 MB.
- **Lists are paginated** — `/committee/queue` (40/page) and `/admin` (25/page);
  the admin aggregates are scoped to the visible page, not the whole table.
- **Indexes** on `submissions(status, created_at, submitter)`, and on the
  `submission_id` / `reviewer` foreign keys of every child table (migration
  `0002`).
- **Background jobs** (`pg-boss`): retry ×4 with backoff, de-duplicated per
  submission, `batchSize: 2` so a submission spike can't stampede the Anthropic
  API, auto-archived after 12 h / deleted after 7 days. A failed enqueue never
  blocks a submission or an assessment.
- **`/api/health`** returns 200 only when the DB is reachable — point the VM /
  load-balancer check at it.
- The worker handles `SIGTERM`/`SIGINT` and drains in-flight jobs before exiting.

## Deploy on your infra (single VM, all self-hosted)

`docker compose up -d --build` brings up `db`, `minio`, `minio-init`, `app`,
`worker`. Run `npm run db:migrate` once against the target database.

**VM sizing** (Ubuntu 22.04, Docker):

| Resource | Recommended | Why |
|---|---|---|
| vCPU | **4** | app + worker + Postgres + MinIO, plus `docker build` headroom |
| RAM | **8 GB** | app ~1.5 GB, worker ~0.5 GB, Postgres ~2 GB, MinIO ~0.5 GB, OS + burst |
| System disk | **40 GB** | OS, Docker images, Postgres data (< 2 GB for 3000 submissions) |
| Data volume | **500 GB** SSD, mounted at MinIO's `/data` | 3000 demo videos + files ≈ 120–200 GB; leaves room for multiple cycles |
| Network | 1 Gbps, public egress | evaluators stream demo videos via 5-min signed URLs |

No load balancer or autoscaling needed — 3000 submissions land over weeks and the
committee is a handful of users; the only real peak is submission-deadline day.

**Tuning on the VM:**
- Postgres: `shared_buffers=1GB`, `work_mem=32MB`, `max_connections=100`
  (app pool `max:10` + worker + pg-boss ≈ 30 in use).
- App container: `NODE_OPTIONS=--max-old-space-size=1024`, memory limit 2 GB.
- MinIO: put it on the dedicated data volume; enable versioning if you want
  soft-delete protection.
- Back up nightly: `pg_dump` of the DB + `mc mirror` of the bucket to off-box
  storage. Test a restore.
- Front with nginx/Caddy for TLS; set `client_max_body_size 120m` to match the
  upload cap.

## Quick test deploy on Vercel

Works for a demo, with three caveats baked in:

1. **No worker on Vercel.** Set `AI_DISABLED=1` — `enqueue()` becomes a no-op, the
   pg-boss schema is never created, and the portal is fully functional without AI.
   (To keep AI, run `npm run worker` on any small always-on box pointed at the
   same `DATABASE_URL`.)
2. **4.5 MB request-body cap.** Shrink the upload limits:
   `NEXT_PUBLIC_MAX_VIDEO_MB=4`, `NEXT_PUBLIC_MAX_FILE_MB=3`,
   `NEXT_PUBLIC_MAX_FILES=3`, `SERVER_ACTION_BODY_LIMIT=4mb`.
3. **Serverless DB connections.** Use a pooled `DATABASE_URL` (Neon's `-pooler`
   host) or set `DB_POOL_MAX=1`.

Steps:

```
1. Postgres        → Neon / Vercel Postgres / Supabase. Copy the pooled URL.
2. Object storage  → an S3 bucket or Cloudflare R2. Set S3_* and add CORS
                     (allow GET + PUT from your Vercel domain).
3. Import the repo in Vercel. Add all env vars from .env.example
                     (real AUTH_SECRET, DATABASE_URL, S3_*, AI_DISABLED=1,
                      the four upload overrides).
4. Deploy. Then run migrations + seed against the hosted DB from your machine:
     DATABASE_URL="<hosted>" npm run db:migrate
     DATABASE_URL="<hosted>" npm run db:seed
5. Sign in at /login  (admin@jazzworld.test / password123).
```

For anything beyond a demo, deploy the Docker stack below — it's what the app is
built for.

## Not built yet (next)

Email notifications · SSO · award-cycle/month management · CSV export · per-IP
rate limiting on `/submit` · direct-to-storage (presigned) uploads if the video
cap ever needs to grow past ~50 MB.
