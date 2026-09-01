import { desc, eq } from "drizzle-orm";
import { db, evaluations, submissions, users } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { CRITERIA, TIERS } from "@/lib/rubric";
import { toCsv, csvResponse } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await db
    .select({
      subId: submissions.id,
      initiative: submissions.initiativeName,
      theme: submissions.theme,
      fn: submissions.functionArea,
      stage: submissions.useCaseStage,
      submitter: submissions.submitterName,
      status: submissions.status,
      evaluator: users.name,
      scores: evaluations.scores,
      weightedTotal: evaluations.weightedTotal,
      tier: evaluations.tier,
      recommendation: evaluations.recommendation,
      rationale: evaluations.rationale,
      additionalValidation: evaluations.additionalValidation,
      recordedAt: evaluations.submittedAt,
    })
    .from(evaluations)
    .innerJoin(submissions, eq(submissions.id, evaluations.submissionId))
    .leftJoin(users, eq(users.id, evaluations.reviewerUserId))
    .orderBy(desc(evaluations.submittedAt));

  const tierLabel = (k: string) => TIERS.find((t) => t.key === k)?.label ?? k;

  const headers = [
    "Submission ID",
    "Initiative",
    "Theme",
    "Function",
    "Use case stage",
    "Submitter",
    "Submission status",
    "Evaluator",
    ...CRITERIA.map((c) => `${c.label} (/5)`),
    "Weighted total (/100)",
    "Tier",
    "Recommendation",
    "Rationale",
    "Additional validation",
    "Recorded at",
  ];

  const body = toCsv(
    headers,
    rows.map((r) => {
      const sc = (r.scores ?? {}) as Record<string, number>;
      return [
        r.subId,
        r.initiative,
        r.theme,
        r.fn,
        r.stage,
        r.submitter,
        r.status,
        r.evaluator ?? "",
        ...CRITERIA.map((c) => sc[c.key] ?? ""),
        (r.weightedTotal / 10).toFixed(1),
        tierLabel(r.tier),
        r.recommendation,
        r.rationale,
        r.additionalValidation,
        r.recordedAt,
      ];
    }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`evaluations-${stamp}.csv`, body);
}
