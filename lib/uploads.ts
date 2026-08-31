// Shared upload limits for supporting files. Kept small: files post through the
// Next server action and are buffered in memory. Override with NEXT_PUBLIC_MAX_FILE_MB
// / NEXT_PUBLIC_MAX_FILES on constrained hosts (Vercel caps the body at 4.5 MB).
// The demo video is a link now (see lib/videoEmbed.ts), not an upload.

const mb = (v: string | undefined, fallback: number) =>
  (Number(v) || fallback) * 1024 * 1024;

export const MAX_FILE_BYTES = mb(process.env.NEXT_PUBLIC_MAX_FILE_MB, 10);
export const MAX_FILES = Number(process.env.NEXT_PUBLIC_MAX_FILES) || 5;

export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}
