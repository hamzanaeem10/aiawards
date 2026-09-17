/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // self-hosted: produces a minimal server bundle for Docker
  // Submit posts only the supporting files (the demo video is a link now).
  // Default worst case ≈ 5 × 10 MB; override on a constrained host with
  // SERVER_ACTION_BODY_LIMIT (Vercel caps a serverless request body at 4.5 MB).
  experimental: {
    serverActions: { bodySizeLimit: process.env.SERVER_ACTION_BODY_LIMIT || "60mb" },
  },
  eslint: { ignoreDuringBuilds: true }, // lint in CI separately; don't block the image build
  // nodemailer resolves its transports with dynamic requires, so Next's
  // dependency tracing leaves it out of `output: "standalone"` and the mailer
  // throws MODULE_NOT_FOUND at runtime. Mark it external and trace it in
  // explicitly so it lands in .next/standalone/node_modules.
  serverExternalPackages: ["nodemailer"],
  outputFileTracingIncludes: {
    "/login": ["./node_modules/nodemailer/**/*"],
    "/login/verify": ["./node_modules/nodemailer/**/*"],
  },

  // Security response headers, applied to every route.
  //
  // Addresses VAPT findings IDX-003 (Strict-Transport-Security absent, so an
  // initial HTTP request could be stripped to plaintext) and VULN-002 (the app
  // could be framed by a third-party page, enabling clickjacking).
  //
  // Set here rather than on the OpenShift Route so the policy travels with the
  // application to any host, and lives in version control next to the code.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // One year, and browsers remember it for subdomains too. Only
          // honoured over a valid TLS connection, so it cannot lock anyone out
          // of a host whose certificate is not yet trusted.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Anti-framing. frame-ancestors is the modern control; X-Frame-Options
          // is kept for older browsers that ignore CSP.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
          { key: "X-Frame-Options", value: "DENY" },
          // Stop MIME sniffing turning an upload into executable content.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Do not leak submission URLs (which carry submission ids) off-site.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
