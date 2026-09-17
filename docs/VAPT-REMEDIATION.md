# VAPT Remediation — AI Awards Portal

**Responds to:** `AI_Awards_Portal_9-Sep-2026` — Security Assessment Report, Jazz Application Security Team (ISG), v1.0
**Remediated:** 8-Sep-2026
**Verified against:** `https://aiawards-people-org.apps.ocpv2.jazz.com.pk` (live deployment, OpenShift `ocpv2`, namespace `people-org`)

All six findings are closed. Evidence below is taken from the deployed system,
not a development build.

---

## Summary

| ID | Risk | Finding | Status |
|---|---|---|---|
| IDX-001 | Critical | No rate limiting for OTP generation | **Closed** |
| IDX-005 | High | Session token remains valid after logout | **Closed** |
| IDX-003 | High | Strict Transport Security not enforced | **Closed** |
| IDX-006 | High | JWT token lifetime | **Closed** |
| VULN-002 | Medium | Application vulnerable to clickjacking | **Closed** |
| VULN-004 | Medium | Missing email validation on form submission | **Closed** |

### Note on scope

The report's scope section lists `https://api.ocpv2.jazz.com.pk:6443`, which is
the Kubernetes API server. All findings in the body were raised against the
application at `aiawards-people-org.apps.ocpv2.jazz.com.pk`. We have treated the
application as the tested scope.

---

## IDX-001 — No rate limiting for OTP generation (Critical)

**Reported:** varying the email address allowed unlimited OTP generation;
payload #6036 still succeeded.

**Cause:** throttling was keyed on the email address only. Changing one
character reset the budget, so a single client could request codes without
limit — and each request sent mail.

**Fix.** Throttling is now bound to the requester as well as the address:

| Control | Limit |
|---|---|
| Codes per email address | 3 per 15 minutes |
| Codes per source IP | 12 per 15 minutes |
| **Distinct email addresses per source IP** | **5 per 60 minutes** |

The third control is what defeats the reported attack: enumerating addresses
from one client is cut off at the sixth distinct address.

A second defect was found and fixed while implementing this. The client address
was being read from the **leftmost** `X-Forwarded-For` entry, which is
client-supplied and therefore forgeable — an attacker could have presented a new
source address on every request and bypassed any per-IP limit. The address is
now taken from the **rightmost** entry, appended by the OpenShift router and not
influenceable by the client, and is validated as a well-formed address.

Limits are configurable without a rebuild (`OTP_MAX_PER_EMAIL`,
`OTP_MAX_PER_IP`, `OTP_MAX_EMAILS_PER_IP`, `OTP_IP_EMAIL_WINDOW_MINUTES`).

**Verification** — 20 sequential requests, 20 distinct addresses, one source IP:

```
issued=5  blocked=15  reason=ip_rate_limited
```

**CAPTCHA** was listed in the report as recommended but not mandatory. It is not
implemented; the throttling above addresses the finding. It can be added if ISG
requires it.

**Related existing controls** (unchanged, for completeness): codes are 6 digits
from a CSPRNG, stored only as an HMAC-SHA256 keyed with a secret held outside
the database, single-use, expire in 10 minutes, compared in constant time, and
burned after 5 incorrect attempts.

---

## IDX-005 — Session token remains valid after logout (High)

**Reported:** a token captured before logout continued to authenticate requests
afterwards.

**Cause:** confirmed. The session is a stateless JWT and logout only deleted the
browser cookie. Nothing server-side recorded that the token was finished, so any
copy remained valid until expiry.

**Fix.** Server-side revocation:

1. Every session token now carries a unique `jti` claim.
2. Logout records that `jti` in a new `revoked_sessions` table **before**
   clearing the cookie.
3. Session validation refuses any token whose `jti` is listed. This check runs
   on the same database round trip as the existing account re-check, so there is
   no additional query per request.
4. Revocation rows are swept once the token would have expired anyway.

**Tokens issued before this change carry no `jti` and are now rejected
outright.** This retires every previously issued token in a single step,
including any captured during testing. All users must sign in again.

**Verification** on the live system, same token before and after revocation:

```
before revocation:  GET /admin            -> HTTP 200
after  revocation:  GET /admin            -> HTTP 307 -> /login
                    GET /submit           -> HTTP 307 -> /login
                    GET /committee/queue  -> HTTP 307 -> /login

legacy token, no jti (7-day, pre-fix):
                    GET /admin            -> HTTP 307 -> /login
```

### Follow-up: `POST /submit` still succeeded after logout

ISG re-tested and demonstrated a `POST /submit` completing after logout
(response: *"Received. It's in the queue for the awards panel to review."*).
This was a **second, distinct defect** that the revocation work above did not
address, and the report's title understates it.

**Cause.** The `/submit` server action performed no authorisation. It read the
session but treated it as optional (`session?.userId ?? null`), so it completed
with a revoked session, an expired session, or **no cookie at all**, recording
the submission with a null submitter. Token revocation was irrelevant to this
endpoint because the endpoint never required a token.

The underlying issue is a framework characteristic: in Next.js App Router a
page-level `redirect()` guard protects only the page *render*. Server actions
are separately addressable POST endpoints, exposed by action id — which is what
was replayed. `/submit` had a page guard and no action guard.

**Fix.**

1. The submit action now requires a session and redirects to `/login` otherwise.
2. **All eight server actions were audited.** The other seven already enforced
   authorisation (`requireRole("admin")` on account management, explicit role
   checks on evaluation and approval, and the sign-in/sign-out actions which are
   public by design). `/submit` was the only unguarded one.
3. A shared `requireSession()` helper was added, documenting the pitfall so
   future actions have an obvious guard to use.
4. Submissions are now attributed to the authenticated user rather than stored
   with a null submitter.

**Verification** — live system, confirmed at the database level. The
authenticated case creating a row is what proves the action was genuinely
invoked rather than merely intercepted by the page guard:

```
authenticated POST   -> 303 /status/63acd2c3-...   row created, attributed
no session           -> 303 /login                 NOTHING written
after logout         -> 303 /login                 NOTHING written
external email       -> 303 /submit?e=domain       NOTHING written
```

All test data was removed after verification.

---

## IDX-003 — Strict Transport Security not enforced (High)

**Fix.** `Strict-Transport-Security: max-age=31536000; includeSubDomains` is now
returned on every route. It is set in the application rather than on the
OpenShift Route, so the policy travels with the application to any host and is
held in version control alongside the code.

The following headers were added at the same time:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | `frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |

`Referrer-Policy` is included because submission URLs contain submission
identifiers, which should not leak to third-party sites.

**Verification** — live response on `/login`, and confirmed present on `/`,
`/submit`, `/admin` and `/login/verify`:

```
strict-transport-security: max-age=31536000; includeSubDomains
content-security-policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
x-permitted-cross-domain-policies: none
permissions-policy: camera=(), microphone=(), geolocation=(), payment=()
```

HTTP requests were already redirected to HTTPS at the router (edge termination
with `insecureEdgeTerminationPolicy: Redirect`); HSTS now instructs the browser
not to attempt HTTP in the first place.

---

## IDX-006 — JWT token lifetime (High)

**Reported:** tokens valid for approximately one week.

**Fix.** Session lifetime reduced from **7 days (168 hours) to 8 hours**, on both
the token's `exp` claim and the cookie's `Max-Age`. Configurable via
`SESSION_TTL_HOURS`.

Eight hours — one working day — was chosen rather than a few minutes because the
application has no refresh-token mechanism, so a shorter window would sign users
out mid-task. The exposure the report describes is addressed in combination with
IDX-005: a stolen token is now both short-lived and revocable on demand, whereas
previously it was neither.

**Verification:** newly issued tokens carry `exp` 8 hours after `iat`;
`SESSION_TTL_HOURS=8` confirmed in the running pods.

---

## VULN-002 — Clickjacking (Medium)

**Fix.** Both controls named in the report are now returned on every route:

- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Frame-Options: DENY`

Framing is denied outright; the application has no legitimate need to be
embedded, including by itself.

**Verification:** headers confirmed present on `/`, `/login`, `/login/verify`,
`/submit` and `/admin` (see IDX-003 above).

---

## VULN-004 — Missing email validation on form submission (Medium)

**Reported:** the submitter email field on `/submit` accepted arbitrary external
addresses, e.g. `jazztest@yopmail.com`.

**Fix.** The submitter address is normalised and validated **server-side**,
inside the submit action, before the record is written. Requests carrying a
non-permitted domain are rejected and the form reports the reason.

The check reuses the same `ALLOWED_EMAIL_DOMAINS` allowlist that gates sign-in
(`jazz.com.pk`, `jazz.com`), so there is a single definition rather than two
that can drift apart. The browser's `type="email"` attribute is retained for
usability only and is not relied upon — as the report correctly notes, an
attacker posts the endpoint directly.

**Verification:**

```
rejected: jazztest@yopmail.com
rejected: attacker@gmail.com
rejected: x@evil.co
rejected: notanemail
rejected: a@jazz.com.pk.evil.com     (domain-suffix confusion)
accepted: abduhu.khan@jazz.com.pk
accepted: ABDUHU.KHAN@Jazz.Com.PK    (case/whitespace normalised)
accepted: admin@jazz.com
```

---

## Separate issue found during remediation — not in the report

`smtp.jazz.com.pk` (10.50.81.143) accepts mail from internal hosts with **no
authentication and no STARTTLS**, and relays to **external** recipients — a
`RCPT TO` for `test@gmail.com` was accepted, as was a non-existent internal
mailbox. Any host on the internal network can therefore send mail as
`@jazz.com.pk` to any recipient.

This is outside the scope of this application but is a phishing and spoofing
exposure worth raising with the mail platform team independently.

---

## Outstanding items (not VAPT findings)

1. **Vanity hostname `aiawards.jazz.com.pk` has no matching certificate.** The
   Route exists and is admitted; the router presents its default
   `*.apps.ocpv2.jazz.com.pk` certificate, which does not match. A certificate
   with CN/SAN `aiawards.jazz.com.pk` from Jazz Issuer CA-1 is required.
2. **Supporting-file uploads are non-functional** — egress to the object-storage
   host is blocked from the cluster. One firewall rule is requested; see
   `docs/SECURITY-REVIEW.md`.
3. **Data residency** — the database and object storage are hosted in AWS
   `us-east-2` (USA). Awaiting a ruling from Information Security.
4. **Stale privileged accounts** from earlier development remain in the database
   (7 with reviewer access, 1 administrator carrying a default password). All are
   currently unusable because their domains cannot request a sign-in code, but
   they should be deactivated.
