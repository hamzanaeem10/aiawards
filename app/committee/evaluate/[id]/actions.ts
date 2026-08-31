"use server";

import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import {
  db, evaluations, submissions, governanceChecks, statusHistory, auditLog,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  CRITERIA,
  TIERS,
  weightedTotal,
  tierFor,
  nextStepText,
  OUTCOME_STATUS,
  outcomeNeedsGovernance,
  type CriterionKey,
} from "@/lib/rubric";

const GOV_KEYS = [
  "conflictsDeclared",
  "bizFinValidated",
  "techValidated",
  "cpoCaioReviewed",
] as const;

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
  const outcome = recommendation === "auto" ? tier.key : recommendation;
  const newStatus = OUTCOME_STATUS[outcome] ?? "IN_REVIEW";

  // --- governance checklist (part of the evaluator's screen) -----------
  const gov = Object.fromEntries(
    GOV_KEYS.map((k) => [k, formData.get(k) === "on"]),
  ) as Record<(typeof GOV_KEYS)[number], boolean>;

  if (outcomeNeedsGovernance(outcome)) {
    const ok =
      gov.bizFinValidated &&
      gov.techValidated &&
      (outcome !== "award" || gov.cpoCaioReviewed);
    if (!ok) {
      throw new Error(
        "This outcome needs Business & Finance and Tech/Control validation" +
          (outcome === "award" ? " plus CPO & Chief AI Officer review" : "") +
          " — tick the governance items before recording.",
      );
    }
  }

  await db
    .insert(governanceChecks)
    .values({ submissionId, ...gov, updatedByUserId: s.userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: governanceChecks.submissionId,
      set: { ...gov, updatedByUserId: s.userId, updatedAt: new Date() },
    });

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

  // --- auto-advance the lifecycle ------------------------------------
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
      note: `Assessment recorded — ${TIERS.find((t) => t.key === outcome)?.label ?? outcome}. ${nextStepText(outcome)}`,
      byUserId: s.userId,
    });
  }

  await db.insert(auditLog).values({
    actorUserId: s.userId,
    action: "assessment.record",
    target: submissionId,
    meta: { total, tier: tier.key, outcome, newStatus },
  });

  redirect(`/committee/evaluate/${submissionId}?saved=1`);
}
