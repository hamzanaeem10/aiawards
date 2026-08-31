# JazzWorld AI Impact Awards — Portal

Nomination submission + evaluation committee portal. Next.js (App Router) · Postgres ·
MinIO/S3 for attachments · pg-boss for background jobs · Claude for **advisory-only**
assistance. Self-hosted (Docker).

## UI

Premium design system in `app/globals.css` (Fraunces display + Inter, brand
maroon/aubergine, soft elevation). Shared chrome in `app/components/SiteHeader.tsx`
with the JazzWorld lockup (`app/components/Logo.tsx` — placeholder mark, swap in the
official SVG when available).

## Assessment framework

The criteria, weights and tier thresholds are the single source of truth in
`lib/rubric.ts` — the scorecard, the AI assessment prompt, the CSV export and the
lifecycle mapping all read from it. Current model: Impact (incl. financial) 45 ·
Evidence 20 · AI Innovation 15 · Scalability and Applicability 10 · Responsible AI
10. Tier bands are still provisional and every total is shown as "indicative".
Change the model by editing that one file.

## Scoring policy (important)

**The score of record, the tier, and every lifecycle outcome are written only by a
human** — a reviewer's or the panel chair's `recordAssessment` action
(`app/committee/evaluate/[id]/actions.ts`) is the single writer of the
`evaluations` table and the only thing that advances a submission.

AI is used at three points, all **labelled in the UI, none of which write to
`evaluations` or the lifecycle**:

| Where | What | Never |
|---|---|---|
| Submission intake — Claude (`lib/ai/intake.ts`) | Orientation summary, clarifying questions, completeness flags | score / rank / recommend |
| **Evaluate screen, on demand — Groq (`lib/ai/assessment.ts`)** | A **supplementary** 1–5 score per criterion + a weighted total, shown as a second opinion next to the evaluator's own scoring | pre-fill the evaluator's inputs / change the outcome / touch the lifecycle |

The Groq assessment stores an `ai_insights` row (`type: "ai_assessment"`), never
an `evaluations` row. The weighted total is recomputed by the app on the human
formula (`weightedTotal`) from the model's per-criterion scores — the model's own
arithmetic is discarded. The evaluate screen labels it *"supplementary, not the
panel's decision"*. Leave `GROQ_API_KEY` blank and the button disappears;
`AI_DISABLED=1` still turns off the Claude features independently.

## Supporting evidence

The submit form (`app/submit/Evidence.tsx`) collects a **demo-video link**
(preferred, not required), an optional **live link** and **code repository**
URL, and up to 5 optional **supporting files** (≤ 10 MB each; limits in
`lib/uploads.ts`, re-checked server-side).

The demo video is a **shared link, not an upload** — nominees put it on
**OneDrive** with "anyone with the link can view". `lib/videoEmbed.ts` turns a
OneDrive link into an inline `<video>` on the evaluate screen (via the consumer
`shares` content API); if it can't play, `DemoPlayer` shows a clean
**"Watch the demo ↗"** panel. (SharePoint / Stream / Loom / YouTube / direct
file URLs are also handled best-effort, but OneDrive is what the form asks for.)
Supporting files are stored in object storage and served with 5-minute signed URLs.

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
npm run worker &              # background job: the Claude intake summary
npm run dev                   # http://localhost:3000
```

Seeded logins: `admin@ / chair@ / reviewer1@ / reviewer2@ / nominee@jazzworld.test`.

> Don't run `npm run build` while `npm run dev` is running — they share `.next` and
> it corrupts. Stop dev, `rm -rf .next`, then build.

## Flow

1. `/submit` — nominee fills the form, adds a demo-video link + optional live
   link / repo / files → stored in Postgres (+ object storage for files), status
   `SUBMITTED`, advisory Claude intake job enqueued.
2. Worker calls Claude → `ai_insights` row (`intake_summary`), advisory only.
3. `/committee/queue` — every submission, paginated. Any signed-in evaluator
   (`reviewer` / `chair`) opens one — no cap on how many review a submission.
4. `/committee/evaluate/[id]` — one screen: full submission + demo + attachments,
   an optional on-demand **Groq AI assessment** (supplementary), then the
   evaluator scores the criteria (live weighted total). **Record assessment**
   auto-advances the submission to the tier of the **running panel average**
   across all recorded assessments.
5. `/admin` — per submission: the cumulative panel score, the per-evaluator ×
   per-criterion matrix with a panel-average row, and each evaluator's notes.
   CSV export of submissions (with panel averages) and of evaluations.
6. `/status/[id]` — nominee tracks the lifecycle status.

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

## Test deploy: Vercel + Neon

Backend is on **Neon** (`neon.ts` is the source of truth):

- **Lakebase Postgres** → `DATABASE_URL` / `DATABASE_URL_UNPOOLED`
- **Object Storage** → the `attachments` bucket; `AWS_*` env vars

Wiring is done by the Neon CLI, not by hand:

```bash
neon link --org-id <org> --project-id <project>   # writes .neon, pulls DATABASE_URL*
neon deploy                                        # provisions the bucket, pulls AWS_*
DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:migrate   # direct conn for DDL
DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:seed
```

Then on **Vercel** (import `hamzanaeem10/aiawards`), with two constraints:

1. **No worker on serverless.** Keep `AI_DISABLED=1` — `enqueue()` is a no-op and
   the portal is fully functional without AI. (To enable AI later, run
   `npm run worker` on any always-on box with the same `DATABASE_URL`.)
2. **4.5 MB request-body cap.** The demo video is a link, so only supporting
   files matter — set `NEXT_PUBLIC_MAX_FILE_MB=3`, `NEXT_PUBLIC_MAX_FILES=3`,
   `SERVER_ACTION_BODY_LIMIT=4mb`.

Vercel env vars: `AUTH_SECRET`, `DATABASE_URL` (Neon pooled), `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `S3_BUCKET=attachments`,
`AI_DISABLED=1`, `GROQ_API_KEY` + `GROQ_MODEL` (for the supplementary AI
assessment — omit to hide it), and the three upload overrides. Then sign in at
`/login` (`admin@jazzworld.test` / `password123`).

For production scale, use the Docker stack above — it's what the app is built for.

## Not built yet (next)

Email notifications · SSO · award-cycle/month management · CSV export · per-IP
rate limiting on `/submit` · direct-to-storage (presigned) uploads if the video
cap ever needs to grow past ~50 MB.
