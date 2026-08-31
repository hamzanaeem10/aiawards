"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, decisions, submissions, auditLog } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { enqueue, QUEUES } from "@/lib/queue";

/** Compose / release the feedback letter shown to the nominee on their status page. */
export async function saveFeedback(formData: FormData) {
  const s = await requireRole("admin", "chair");
  const submissionId = String(formData.get("submissionId"));
  const feedbackLetter = String(formData.get("feedbackLetter") || "");
  const feedbackReleased = formData.get("feedbackReleased") === "on";

  const [sub] = await db
    .select({ status: submissions.status })
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  const [existing] = await db
    .select({ id: decisions.id })
    .from(decisions)
    .where(eq(decisions.submissionId, submissionId));

  if (existing) {
    await db
      .update(decisions)
      .set({ feedbackLetter, feedbackReleased, decidedByUserId: s.userId })
      .where(eq(decisions.id, existing.id));
  } else {
    await db.insert(decisions).values({
      submissionId,
      outcome: "feedback",
      newStatus: sub?.status ?? "IN_REVIEW",
      feedbackLetter,
      feedbackReleased,
      decidedByUserId: s.userId,
    });
  }
  await db.insert(auditLog).values({
    actorUserId: s.userId,
    action: "feedback.save",
    target: submissionId,
    meta: { feedbackReleased },
  });
  revalidatePath("/admin");
}

/** Advisory only — drafts a consensus note + feedback letter for a human to edit. */
export async function generateConsensus(formData: FormData) {
  await requireRole("admin", "chair");
  await enqueue(QUEUES.synthesis, {
    submissionId: String(formData.get("submissionId")),
  });
  revalidatePath("/admin");
}
