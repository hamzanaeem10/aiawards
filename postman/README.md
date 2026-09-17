# Postman collection — AI Awards Portal

Import `AI-Awards-Portal.postman_collection.json`.
**26 requests across 7 folders. Every route in the application is covered.**

## Read this before you start

This is a **server-rendered Next.js application, not a REST API**. Only three
conventional HTTP endpoints exist:

| Endpoint | Auth |
|---|---|
| `GET /api/health` | none |
| `GET /admin/export/submissions` | admin |
| `GET /admin/export/evaluations` | admin |

Everything else is a **page** (GET → HTML) or a **server action** (POST to a page
URL). Both are included. Five requests are marked *UI only* because they cannot
be driven from Postman — see below.

## Two things that catch people out

**1. Server-action ids change on every deploy.** They are build-scoped hashes in
a hidden `$ACTION_ID_<hash>` field. Hardcode one and you get
`404 Failed to find Server Action` after the next release. Every action request
here carries a pre-request script that fetches the page and reads the current id
into `{{actionId}}`.

**2. Action bodies must be `multipart/form-data`.** A urlencoded POST does not
invoke the action — it is served as an ordinary page request. This matters for
security testing: an unauthenticated urlencoded POST to `/submit` returns
`307 → /login` from the *page* guard without the action running at all, which
looks like a pass when nothing was tested.

## Signing in

No passwords, no API keys — email one-time code.

```
/  (public landing)  →  Submit an initiative
                     →  /login          request code
                     →  /login/verify   enter 6-digit code
                     →  /submit         nominee lands here
```

1. Set `{{loginEmail}}` to a mailbox you can read (`@jazz.com.pk` or `@jazz.com`)
2. Run **2. Auth → 1. Request sign-in code**
3. Read the 6-digit code from the mailbox, set `{{otpCode}}`
4. Run **2. Auth → 2. Verify code** — Postman stores `aia_session` and reuses it

Sessions last **8 hours** and are revoked server-side by **Sign out**.

## Rate limits will stop an automated run

3 codes per address / 15 min · 12 per IP / 15 min · **5 distinct addresses per
IP / hour**. This is deliberate — it closes a Critical finding (IDX-001).
Folder 7 exercises it on purpose and will send real email to throwaway
addresses, producing bounces.

## What is not callable from Postman

`recordAssessment`, `runAiAssessment`, `createReviewer`,
`resetReviewerPassword` and `setReviewerActive` are invoked from client
components with **bound arguments**, which Next encodes into the action
reference rather than sending as form fields. Reproducing that by hand is
impractical and brittle, so those appear as documented placeholders that load
the related page. Exercise them through the UI.

## Folder 7 — security regression

Runnable assertions for the ISG findings of 9-Sep-2026: IDX-001, IDX-003,
IDX-005, IDX-006, VULN-002, VULN-004. Clear cookies before running it, except
where a request says otherwise. Useful for re-testing after any deploy.

## Base URL

Defaults to `https://aiawards-people-org.apps.ocpv2.jazz.com.pk`, which has a
trusted certificate today. Switch `{{baseUrl}}` to `https://aiawards.jazz.com.pk`
once its public certificate is installed.
