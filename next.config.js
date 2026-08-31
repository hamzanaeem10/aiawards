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
};
module.exports = nextConfig;
