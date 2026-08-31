"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import {
  db, evaluations, submissions, statusHistory, auditLog, aiInsights,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  CRITERIA,
  weightedTotal,
  tierFor,
  nextStepText,
  OUTCOME_STATUS,
  type CriterionKey,
} from "@/lib/rubric";
import { generateAiAssessment } from "@/lib/ai/assessment";

/**
 * Supplementary AI assessment. Writes ONLY to ai_insights — it never touches the
 * evaluations table, the lifecycle, or a decision. The human panel's score
 * remains the score of record.
 */
export async function runAiAssessment(submissionId: string) {
  const s = await getSession();
  if (!s || (s.role !== "reviewer" && s.role !== "chair")) {
    throw new Error("UNAUTHORIZED");
  }
  const [sub] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!sub) throw new Error("NOT_FOUND");

  const { model, content } = await generateAiAssessment({
    initiativeName: sub.initiativeName,
    theme: sub.theme,
    functionArea: sub.functionArea,
    useCaseStage: sub.useCaseStage,
    data: sub.data as Record<string, unknown>,
  });

  await db.insert(aiInsights).values({
    submissionId,
    type: "ai_assessment",
    model,
    content: content as unknown as Record<string, unknown>,
    editedByUserId: s.userId,
  });
  await db.insert(auditLog).values({
    actorUserId: s.userId,
    action: "ai_assessment.run",
    target: submissionId,
    meta: { model, total: content.weightedTotal, tier: content.tierKey },
  });

  revalidatePath(`/committee/evaluate/${submissionId}`);
}

export async function recordAssessment(submissionId: string, formData: FormData) {
  const s = await getSession();
  if (!s || (s.role !== "reviewer" && s.role !== "chair")) throw new Error("UNAUTHORIZED");

  // --- scores: ONLY from this human evaluator's form input --------------
  const scores: Record<string, number> = {};
  for (const c of CRITERIA) {
    const v = Number(formData.get(`score_${c.key}`));
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      throw new Error(`Score for ${c.label} must be 1–5`);
    }
    scores[c.key] = v;
  }

  const total = weightedTotal(scores as Partial<Record<CriterionKey, number>>);
  const tier = tierFor(total);

  const rationale = String(formData.get("rationale") || "").trim();
  const additionalValidation = String(formData.get("additionalValidation") || "");
  const recommendation = String(formData.get("recommendation") || "auto");

  // --- upsert this evaluator's evaluation ------------------------------
  const row = {
    scores,
    weightedTotal: Math.round(total * 10),
    tier: tier.key,
    recommendation,
    rationale,
    additionalValidation,
  };
  const [existing] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(
      and(
        eq(evaluations.submissionId, submissionId),
        eq(evaluations.reviewerUserId, s.userId),
      ),
    );
  if (existing) {
    await db
      .update(evaluations)
      .set({ ...row, submittedAt: new Date() })
      .where(eq(evaluations.id, existing.id));
  } else {
    await db
      .insert(evaluations)
      .values({ submissionId, reviewerUserId: s.userId, ...row });
  }

  // --- auto-advance the lifecycle from the PANEL AVERAGE, not this one ----
  // Any number of reviewers may score; the status tracks the running mean.
  const all = await db
    .select({ weightedTotal: evaluations.weightedTotal })
    .from(evaluations)
    .where(eq(evaluations.submissionId, submissionId));
  const avg = all.reduce((a, e) => a + e.weightedTotal / 10, 0) / all.length;
  const avgTier = tierFor(avg);
  const newStatus = OUTCOME_STATUS[avgTier.key] ?? "IN_REVIEW";

  const [sub] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (sub && sub.status !== newStatus) {
    await db
      .update(submissions)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));
    await db.insert(statusHistory).values({
      submissionId,
      from: sub.status,
      to: newStatus,
      note: `Panel average ${avg.toFixed(1)}/100 across ${all.length} assessment${all.length === 1 ? "" : "s"} → ${avgTier.label}. ${nextStepText(avgTier.key)}`,
      byUserId: s.userId,
    });
  }

  await db.insert(auditLog).values({
    actorUserId: s.userId,
    action: "assessment.record",
    target: submissionId,
    meta: {
      total,
      tier: tier.key,
      panelAvg: Math.round(avg * 10) / 10,
      panelN: all.length,
      newStatus,
    },
  });

  redirect(`/committee/queue?recorded=${encodeURIComponent(sub?.initiativeName ?? "")}`);
}
