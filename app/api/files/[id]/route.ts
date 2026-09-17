import { eq } from "drizzle-orm";
import { db, attachments } from "@/lib/db";
import { canEvaluate, getSession } from "@/lib/auth";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stream one supporting file back to an evaluator.
 *
 * The evaluate screen links here rather than to a presigned object-store URL,
 * so the download stays on the app's origin and authorisation is re-checked on
 * every request. `?dl=1` forces a download; without it the file is served
 * inline, which is what lets a video play in place.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const s = await getSession();
  if (!s || !canEvaluate(s.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { id } = await params;
  // A malformed id would otherwise reach the database and throw a 500.
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const [file] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id));
  if (!file) return new Response("Not found", { status: 404 });

  let obj;
  try {
    obj = await getObject(file.storageKey);
  } catch {
    // Object store unreachable or the key is gone — say so plainly rather than
    // serving a broken download.
    return new Response("File is currently unavailable", { status: 502 });
  }
  if (!obj.Body) return new Response("Not found", { status: 404 });

  const disposition = new URL(req.url).searchParams.get("dl") === "1"
    ? "attachment"
    : "inline";
  // Quote-strip the filename so it cannot break out of the header.
  const safe = file.filename.replace(/["\\\r\n]/g, "_");

  return new Response(obj.Body as unknown as ReadableStream, {
    headers: {
      "content-type": file.contentType || "application/octet-stream",
      "content-length": String(file.size),
      "content-disposition": `${disposition}; filename="${safe}"`,
      // Attachments are private to the panel; never let a proxy keep a copy.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
