import { defineConfig } from "@neon/config/v1";

// Neon services this app uses:
//  • Lakebase Postgres  → DATABASE_URL (every project ships with it)
//  • Object Storage      → the "attachments" bucket below holds submission
//                          demo videos + supporting files (private; served to
//                          evaluators via short-lived presigned URLs)
// The app has its own JWT auth, so Neon Auth is intentionally off.
export default defineConfig({
  auth: false,
  preview: {
    buckets: {
      attachments: {
        access: "private",
      },
    },
  },
  branch: (branch) => {
    if (branch.isDefault) return {};
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
