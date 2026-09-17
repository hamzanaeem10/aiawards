# Email draft — SSL certificate request

**To:** the PKI / certificate team (whoever issues Jazz certificates — often the
same security or infrastructure group that manages `Jazz Issuer CA-1`)
**Cc:** network team handling the load-balancer publication
**Subject:** SSL certificate request — aiawards.jazz.com.pk (publicly trusted)

---

Hi,

We are publishing an internal application, the **JazzWorld AI Impact Awards
Portal**, on `aiawards.jazz.com.pk`. It will be reachable by partner companies
from their registered public IPs, so we need an SSL certificate for that
hostname.

**Please issue from a publicly trusted CA, not Jazz Issuer CA-1.** External
partners' browsers do not trust our internal CA and would see a certificate
error on every visit.

### Certificate details

| Field | Value |
|---|---|
| Common Name (CN) | `aiawards.jazz.com.pk` |
| Subject Alternative Name | `DNS: aiawards.jazz.com.pk` |
| Subject | C=PK, ST=Federal, L=Islamabad, O=JAZZ, OU=Technology |
| Key type | RSA 2048 |
| Signature algorithm | SHA-256 |
| Extended Key Usage | TLS Web Server Authentication |
| CSR SHA-256 | `1ebdca2eb29068d784faacd6f0fbe54532eb04b13cf967d0c9f4159800cf258d` |

### CSR

```
-----BEGIN CERTIFICATE REQUEST-----
MIIDHDCCAgQCAQAwdjELMAkGA1UEBhMCUEsxEDAOBgNVBAgMB0ZlZGVyYWwxEjAQ
BgNVBAcMCUlzbGFtYWJhZDENMAsGA1UECgwESkFaWjETMBEGA1UECwwKVGVjaG5v
bG9neTEdMBsGA1UEAwwUYWlhd2FyZHMuamF6ei5jb20ucGswggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQCcAO2f0wK8bfkietrz3p4uIRxAyVlA7yYzAMUW
bCWzASKX8OLsnysLCMn/xQen1Lu5CgPy80f+jjnR2f/sMfu0onOGVaxJ0siOzaP/
+HmMujuVRLvcNYCaPMdHQoS8g2qI2SDw+3l89qyZmqg/8E0r1j3bS6QIFOw7HenN
TO9fbdrXIF8XA83he05pfN1GJJKcptQYBOnNjAMVEE/XuH+XGXvXj6gOzZPRKGR6
li4pfoJMvZKpygPEuAqJ9Fh4BEYQ666ALQP0EIiTXp9RoRrz0QhtFHnm+TLxB9ga
e8O7dj3CrSHWyuzVo6MbUjFNEoSwm7QyirdI9LtfGKJUZmgHAgMBAAGgYTBfBgkq
hkiG9w0BCQ4xUjBQMB8GA1UdEQQYMBaCFGFpYXdhcmRzLmphenouY29tLnBrMA4G
A1UdDwEB/wQEAwIFoDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDQYJ
KoZIhvcNAQELBQADggEBAIdRYixA9z/kRozKZ/l+2a4A4ok1IHSE/WiVhn9W+OdZ
n6/7U1RL6RP0KG9LJB6GbYibgMjg6FBAcouKZVrGzYLUbBpmeMkmD+dOZpze+sGc
Lbpl6IYA3yN5Z1BuruP45ANaLSHxnPHuFAo553gNCIjIsO4sWH1N0Uge7XvYrrAn
5J2znyIYFdPq1DziI+romORhNmB8PXPXF7/EsM1R4YTQa9UOgLxBO3VBRGY45Nxj
FVMYfcmPSisnXFczPCcsAaab888jjA8OR2fajE8LHSILxGQ6tu0h51k+rbkWGmPQ
tkhAWUh1oHit8M2le0xLto7ujfiBaBS0kEmAI2HfkI4=
-----END CERTIFICATE REQUEST-----
```

### What we need back

1. The signed certificate in PEM format.
2. The **full intermediate chain** (root and intermediates) — without it,
   some browsers and most API clients will fail validation.
3. Confirmation of the issuing CA and the expiry date.

The private key was generated on our side and stays with us; it will be handed
to the network team for installation on the load balancer through a secure
channel, not by email.

### Where it will be installed

On the external load balancer terminating client TLS for
`aiawards.jazz.com.pk` (SSL-Bridging; the internal hop to the OpenShift router
at 10.205.186.52:443 keeps the existing cluster certificate).

If your team would rather generate the key and CSR directly on the load
balancer, that is fine — please use the same CN and SAN above and let us know,
and we will discard ours.

### Timing

This is on the critical path for go-live. The application already sends
`Strict-Transport-Security` with a one-year max-age, which means once a browser
has visited the hostname it will refuse to let users click through a
certificate warning. We therefore cannot publish the URL until the certificate
is installed.

Please let us know the expected issuance time.

Thanks,
Abduhu Khan
