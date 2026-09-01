# JazzWorld AI Impact Awards — Portal

Nomination submission + evaluation committee portal. Next.js (App Router) ·
Neon Lakebase Postgres · Neon Object Storage (or any S3) for attachments · an
optional **supplementary** Groq AI assessment on the evaluate screen. Deploys to
Vercel or self-hosts on Docker.

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
human** — a reviewer's (or the admin's) `recordAssessment` action
(`app/committee/evaluate/[id]/actions.ts`) is the single writer of the
`evaluations` table and the only thing that advances a submission.

AI is used at exactly one point — the **supplementary assessment** on the
evaluate screen (`lib/ai/assessment.ts`, Groq). An evaluator clicks "Run AI
assessment" and gets a second opinion: a 1–5 score per criterion, a weighted
total, strengths/risks, and a confidence level.

It **never** writes to `evaluations` or the lifecycle. It stores an `ai_insights`
row (`type: "ai_assessment"`), the weighted total is recomputed by the app on the
human formula (the model's arithmetic is discarded), and the screen labels it
*"supplementary, not the panel's decision"*. Leave `GROQ_API_KEY` blank and the
button disappears — the portal is fully functional without it.

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

## Roles & accounts

`nominee` · `reviewer` · `admin`. The admin manages everything and can also evaluate; reviewers only evaluate. Nominees submit with no account.

- **`db:seed`** creates one **bootstrap admin** from `BOOTSTRAP_ADMIN_EMAIL` /
  `BOOTSTRAP_ADMIN_PASSWORD` (falls back to `admin@jazzworld.test` / `password123`
  for local dev).
- Signed in as the admin, **`/admin/users`** creates **reviewer**
  accounts — it generates a strong password and shows it once for you to send
  the reviewer (Slack/WhatsApp/…). It can also reset a reviewer's password or
  deactivate them (their recorded scores are kept).
- More admins are provisioned by direct DB access — rare and
  deliberate.

## Local dev

```bash
cp .env.example .env          # DATABASE_URL, AUTH_SECRET, S3/AWS_*, GROQ_API_KEY (optional)
npm install
npm run db:migrate
npm run db:seed               # bootstrap admin
npm run dev                   # http://localhost:3000
```

For a self-hosted Postgres + MinIO instead of Neon: `docker compose up -d db minio minio-init`.

> Don't run `npm run build` while `npm run dev` is running — they share `.next` and
> it corrupts. Stop dev, `rm -rf .next`, then build.

## Flow

1. `/submit` — nominee fills the form, adds a demo-video link + optional live
   link / repo / files → stored in Postgres (+ object storage for files), status
   `SUBMITTED`.
2. `/committee/queue` — every submission, paginated. Any signed-in evaluator
   (`reviewer` or `admin`) opens one — no cap on how many review a submission.
3. `/committee/evaluate/[id]` — one screen: full submission + demo + attachments,
   an optional on-demand **Groq AI assessment** (supplementary), then the
   evaluator scores the criteria (live weighted total). **Record assessment**
   auto-advances the submission to the tier of the **running panel average**
   across all recorded assessments.
4. `/admin` — per submission: the cumulative panel score, the per-evaluator ×
   per-criterion matrix with a panel-average row, and each evaluator's notes.
   CSV export of submissions (with panel averages) and of evaluations.
5. `/status/[id]` — nominee tracks the lifecycle status.

## Scale & resilience (sized for ~3000 submissions / cycle)

- The demo video is a **link**, so nothing large flows through the server — only
  supporting files (`lib/uploads.ts`: 5 × 10 MB), buffered briefly in the submit
  action. `next.config.js` caps the request body accordingly.
- **Lists are paginated** — `/committee/queue` (40/page) and `/admin` (25/page);
  the admin aggregates are scoped to the visible page, not the whole table.
- **Indexes** on `submissions(status, created_at, submitter)` and on the
  `submission_id` / `reviewer` foreign keys of every child table.
- **`/api/health`** returns 200 only when the DB is reachable — point the
  host / load-balancer check at it.
- Malformed IDs on `/status` and `/committee/evaluate` return 404, not 500.
- No background worker or queue — every action is synchronous.

## Self-host on Docker (alternative to Vercel + Neon)

`docker compose up -d --build` brings up `db`, `minio`, `minio-init`, `app`.
Run `npm run db:migrate` once against the target database. A **2 vCPU / 4 GB** VM
is plenty for the app + Postgres + MinIO; put MinIO on a data volume sized for
your supporting files (submissions store demo-video *links*, not the videos).
Front with nginx/Caddy for TLS and back up `pg_dump` + the bucket nightly.

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

Then on **Vercel** (import `hamzanaeem10/aiawards`). One constraint: Vercel caps a
serverless request body at 4.5 MB. The demo video is a link, so only supporting
files matter — set `NEXT_PUBLIC_MAX_FILE_MB=3`, `NEXT_PUBLIC_MAX_FILES=3`,
`SERVER_ACTION_BODY_LIMIT=4mb`.

Vercel env vars: `AUTH_SECRET`, `DATABASE_URL` (Neon pooled), `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `S3_BUCKET=attachments`,
`BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD`, `GROQ_API_KEY` +
`GROQ_MODEL` (omit to hide the AI-assessment button), and the three upload
overrides. Deploy, run `db:migrate` + `db:seed` against the DB, then sign in as
the bootstrap admin and add reviewers at `/admin/users`.

## Not built yet (next)

Email notifications · SSO · reviewer self-serve password change · award-cycle /
month management · per-IP rate limiting on `/submit`.
