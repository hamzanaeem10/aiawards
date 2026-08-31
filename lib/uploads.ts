// Shared upload limits — used by the client dropzone and enforced again in the
// submit server action. Keep the two in sync.

// Kept deliberately small: uploads post through the Next server action and are
// buffered in memory, so a submission burst near the deadline must stay cheap.
// Worst-case body ≈ MAX_VIDEO_BYTES + MAX_FILES * MAX_FILE_BYTES (see next.config.js).
//
// Override for constrained hosts — Vercel caps a serverless request body at
// 4.5 MB, so set NEXT_PUBLIC_MAX_VIDEO_MB=4 and NEXT_PUBLIC_MAX_FILE_MB=3
// (NEXT_PUBLIC_ so the client dropzone and the server action agree).
const mb = (v: string | undefined, fallback: number) =>
  (Number(v) || fallback) * 1024 * 1024;

export const MAX_VIDEO_BYTES = mb(process.env.NEXT_PUBLIC_MAX_VIDEO_MB, 50);
export const MAX_FILE_BYTES = mb(process.env.NEXT_PUBLIC_MAX_FILE_MB, 10);
export const MAX_FILES = Number(process.env.NEXT_PUBLIC_MAX_FILES) || 5;

export const ACCEPTED_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];
export const ACCEPTED_VIDEO_EXT = [".mp4", ".mov", ".webm"];

export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}

export function isVideo(file: { type: string; name: string }): boolean {
  if (ACCEPTED_VIDEO.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_VIDEO_EXT.some((e) => lower.endsWith(e));
}
