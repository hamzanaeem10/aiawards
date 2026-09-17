import { headers } from "next/headers";

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function plausible(ip: string): boolean {
  if (!ip) return false;
  if (IPV4.test(ip)) return ip.split(".").every((o) => Number(o) <= 255);
  return ip.includes(":") && /^[0-9a-f:.%\[\]]+$/i.test(ip); // IPv6
}

/**
 * The client address, as seen by the OpenShift router.
 *
 * `X-Forwarded-For` is a CLIENT-SUPPLIED header that the router appends to, so
 * it arrives as "<anything the client sent>, <real peer>". The leftmost entry
 * is therefore attacker-controlled — reading it would let anyone forge a fresh
 * identity per request and walk straight through per-IP rate limits. The
 * RIGHTMOST entry is the one HAProxy appended and is the only trustworthy one.
 * Taking the last entry is also correct when the router is set to replace
 * rather than append, because then it is the only entry.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();

  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim().replace(/^\[|\]$/g, ""));
    for (let i = parts.length - 1; i >= 0; i--) {
      if (plausible(parts[i])) return parts[i];
    }
  }

  // Fallbacks for other proxy setups / local development.
  for (const name of ["x-real-ip", "cf-connecting-ip"]) {
    const v = h.get(name)?.trim();
    if (v && plausible(v)) return v;
  }
  return null;
}
