/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // self-hosted: produces a minimal server bundle for Docker
  // Submit posts the demo video + supporting files through the server action.
  // Default worst case ≈ 50 MB video + 5 × 10 MB files; override on a constrained
  // host with SERVER_ACTION_BODY_LIMIT (e.g. "4mb" on Vercel).
  experimental: {
    serverActions: { bodySizeLimit: process.env.SERVER_ACTION_BODY_LIMIT || "110mb" },
  },
  eslint: { ignoreDuringBuilds: true }, // lint in CI separately; don't block the image build
};
module.exports = nextConfig;
