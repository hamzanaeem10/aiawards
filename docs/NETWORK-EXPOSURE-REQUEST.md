# Network Exposure Request — AI Awards Portal

**Prepared by:** abduhu.khan@jazz.com.pk
**Date:** 11-Sep-2026
**Purpose:** publish the AI Awards Portal so partner companies can reach it from
their known public IPs.

---

## 1. The matrix

Rows marked **[NETWORK TEAM]** are values only your team can assign. Everything
else is taken from the running deployment.

### Production / Source Details

| Field | Value |
|---|---|
| **URL (FQDN)** | `aiawards.jazz.com.pk` |
| **Internal DNS Server** | Currently a CNAME to `aiawards-people-org.apps.ocpv2.jazz.com.pk` (→ `10.205.186.52`). **This must be repointed to the new internal LB VIP** once the VIP is assigned — see §3.1. |
| **Public IP** | **[NETWORK TEAM]** — `119.x.x.x` to be assigned |
| **Source VIP Internal LB** | **[NETWORK TEAM]** — `10.x.x.x` to be assigned |
| **Source Port (SSL)** | `443/TCP` |
| **Service** | HTTPS (web application) |
| **SSL Setting** | **SSL-Bridging** — see §2, this is not optional for this application |

### Destination IP's Details

| Field | Value |
|---|---|
| **SSL Setting on Internal LB** | **SSL-Bridging** (re-encrypt to backend) |
| **Type** | Active |
| **Destination IP** | `10.205.186.52` — OpenShift `ocpv2` ingress VIP |
| **Destination Name** | `aiawards-people-org.apps.ocpv2.jazz.com.pk` (OpenShift router, cluster `ocpv2`, namespace `people-org`) |
| **Destination Port** | `443/TCP` |
| **SNI** | **`aiawards.jazz.com.pk` — REQUIRED, must not be blank.** See §2.2. |

---

## 2. Two settings that will break the service if set wrong

### 2.1 SSL-Offload will cause a redirect loop — use SSL-Bridging

The OpenShift route redirects plain HTTP to HTTPS. Verified on the live system:

```
GET http://aiawards.jazz.com.pk/login   ->  302  https://aiawards.jazz.com.pk/login
GET https://aiawards.jazz.com.pk/login  ->  200
```

If the load balancer terminates TLS and forwards **HTTP to port 80**, the router
answers every request with a redirect to HTTPS, which returns to the load
balancer, which forwards HTTP again — an infinite loop. The site will appear
completely broken.

**Use SSL-Bridging**: terminate the client's TLS at the LB, then re-encrypt to
`10.205.186.52:443`.

If your standard is SSL-Offload and bridging cannot be accommodated, tell us —
we can change the route's `insecureEdgeTerminationPolicy` from `Redirect` to
`Allow` so the backend accepts HTTP on port 80. That is a change on our side and
must be coordinated, not assumed.

### 2.2 SNI must be set — the router dispatches on it

The OpenShift router decides which application receives a request by matching
the **TLS SNI / HTTP Host header** against its registered routes. It does not
route by destination IP — every application in the cluster shares
`10.205.186.52`.

If SNI is left blank, or set to anything other than a registered route
hostname, the router cannot match a route and returns **"Application is not
available"** — regardless of the destination IP being correct. We have already
seen this exact failure while setting up the vanity hostname.

**SNI = `aiawards.jazz.com.pk`.** The matching route is registered and admitted.

The LB must also **preserve the Host header** as `aiawards.jazz.com.pk`.

### 2.3 Backend certificate validation

On the internal hop the router currently presents the cluster's default
certificate (`CN=apps.ocpv2.jazz.com.pk`, SAN `*.apps.ocpv2.jazz.com.pk`), which
does **not** match `aiawards.jazz.com.pk`. Either:

- configure the LB **not to validate** the backend certificate (typical for
  SSL-Bridging on an internal hop), or
- tell us and we will install a matching certificate on the route.

---

## 3. Certificate

Two different certificates are involved. Please do not conflate them.

| Hop | Certificate | Who holds it |
|---|---|---|
| Client → public LB | **Publicly trusted** cert for `aiawards.jazz.com.pk` | External LB |
| LB → OpenShift router | Internal / cluster cert | Cluster (already present) |

**The client-facing certificate must be publicly trusted** (DigiCert, Sectigo,
or whichever public CA Jazz uses). Partner companies' browsers will **not** trust
`Jazz Issuer CA-1`, which is an internal CA. An internal certificate here will
produce a certificate error for every external user.

### 3.1 Order of operations — important

The application sends
`Strict-Transport-Security: max-age=31536000; includeSubDomains`.

Once a browser has seen that header over a valid connection, it will refuse
plain HTTP to this hostname **and will not allow the user to click through a
certificate warning**. Therefore:

1. Assign the public IP and internal VIP.
2. Install the **publicly trusted** certificate on the LB.
3. Repoint `aiawards.jazz.com.pk` in internal DNS to the LB VIP, and publish the
   public DNS record.
4. Only then announce the URL.

Going live with a mismatched certificate will hard-fail for any user who has
previously visited the site, with no way for them to bypass it.

---

## 4. Application impact of putting an LB in front — needs a decision

These are consequences for the application, not network configuration. They need
answering before go-live.

### 4.1 Client IP will be masked, which breaks brute-force protection

The portal rate-limits one-time-code requests **per source IP**. This control
was added to close a **Critical** finding (IDX-001) in the ISG penetration test
of 9-Sep-2026.

It derives the client address from the last `X-Forwarded-For` entry, which today
is appended by the OpenShift router and is the real client. **With another load
balancer in front, that entry becomes the LB's address and every external user
will appear as one client.** The rate limiter would then either throttle all
partner users collectively or be useless.

**Required from the network team:**
- Confirm the LB **appends** the client IP to `X-Forwarded-For` (does not replace
  or strip it), and
- Tell us **how many proxy hops** sit in front of the application.

We will then configure the application to read the correct entry. Without this,
a Critical VAPT finding effectively regresses.

### 4.2 Partner companies behind NAT will lock each other out

If a partner company's staff share one public IP (normal corporate NAT), the
current limit of **5 distinct email addresses per IP per hour** means the sixth
person to sign in that hour is blocked.

This limit was sized for internal users, where each device has its own address.
Tell us the expected number of concurrent external users per partner and we will
raise the limit accordingly, or key it differently for partner ranges.

### 4.3 Partner email domains must be allowlisted

Sign-in is restricted to `jazz.com.pk` and `jazz.com`. Users at partner
companies **cannot sign in at all** until their domains are added. Please supply
the list of partner email domains along with their public IPs.

Note also that one-time codes are delivered by the internal relay
`smtp.jazz.com.pk`; confirm it will deliver to external domains in production.

---

## 5. Current deployment reference

| Item | Value |
|---|---|
| Cluster | `ocpv2` — API `https://api.ocpv2.jazz.com.pk:6443` (`10.205.186.51`) |
| Namespace | `people-org` |
| Ingress VIP | `10.205.186.52` |
| Existing routes | `aiawards.jazz.com.pk`, `aiawards-people-org.apps.ocpv2.jazz.com.pk` — both edge TLS, HTTP→HTTPS redirect |
| Internal service | `aiawards` ClusterIP `172.30.61.216:3000` |
| Pods | 2 replicas, worker12 / worker18 |
| Health check | `GET /api/health` → `200 {"ok":true}` (returns 503 if the database is unreachable — suitable for LB monitoring) |

**Recommended LB health monitor:** `GET https://10.205.186.52/api/health` with
SNI and Host set to `aiawards.jazz.com.pk`, expecting HTTP 200. A plain TCP
check on 443 will report healthy even when the database is down.

---

## 6. Outbound dependency (unchanged by this request)

The application makes outbound connections to:

| Destination | Port | Purpose |
|---|---|---|
| `ep-lucky-smoke-ayph4o9n-pooler.c-5.us-east-2.aws.neon.tech` | 5432 | PostgreSQL (permitted today) |
| `smtp.jazz.com.pk` (10.50.81.143) | 25 | One-time-code email (permitted today) |
| `br-hidden-water-aydmw5xh.storage.c-5.us-east-2.aws.neon.tech` | 443 | Attachments — **currently blocked, rule still requested** |
