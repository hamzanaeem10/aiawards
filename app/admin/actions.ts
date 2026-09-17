"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, approvals, auditLog } from "@/lib/db";
import { canApprove, getSession } from "@/lib/auth";

/**
 * Record (or revise) one approver's sign-off on a submission.
 *
 * Deliberately does NOT touch `evaluations` or the submission's lifecycle
 * status — the panel's score of record stays the evaluators' to set. This is a
 * governance decision layered on top, which is why it lives in its own table.
 */
export async function recordApproval(formData: FormData) {
  const s = await getSession();
  if (!s || !canApprove(s.role)) throw new Error("UNAUTHORIZED");

  const submissionId = String(formData.get("submissionId") || "");
  const decision = String(formData.get("decision") || "");
  const notes = String(formData.get("notes") || "").trim().slice(0, 2000);

  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new Error("BAD_SUBMISSION");
  if (decision !== "approved" && decision !== "disapproved") {
    throw new Error("BAD_DECISION");
  }

  const [existing] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(
        eq(approvals.submissionId, submissionId),
        eq(approvals.approverUserId, s.userId),
      ),
    );

  if (existing) {
    // One decision per approver: revise in place rather than stacking rows.
    await db
      .update(approvals)
      .set({ decision, notes: notes || null, decidedAt: new Date() })
      .where(eq(approvals.id, existing.id));
  } else {
    await db.insert(approvals).values({
      submissionId,
      approverUserId: s.userId,
      decision,
      notes: notes || null,
    });
  }

  await db.insert(auditLog).values({
    actorUserId: s.userId,
    action: existing ? "approval_revised" : "approval_recorded",
    target: submissionId,
    meta: { decision, hasNotes: notes.length > 0 },
  });

  revalidatePath("/admin");
}
