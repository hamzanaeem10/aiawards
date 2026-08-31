import { desc, inArray } from "drizzle-orm";
import { db, submissions, evaluations } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { CRITERIA, TIERS, tierFor } from "@/lib/rubric";
import { toCsv, csvResponse } from "@/lib/csv";

export const dynamic = "force-dynamic";

const FIELDS: [string, string][] = [
  ["submissionType", "Submission type"],
  ["challenge", "Business challenge"],
  ["solution", "AI solution"],
  ["aiTech", "AI technology"],
  ["aiTechOther", "AI technology (other)"],
  ["targetUsers", "Target users"],
  ["whatsNew", "What's new"],
  ["impact", "Impact"],
  ["financialImpact", "Financial impact type"],
  ["financialImpactDetail", "Financial impact detail"],
  ["evidenceStage", "Evidence stage"],
  ["scalability", "Scalability"],
  ["keyMetrics", "Key metrics"],
  ["responsibleAI", "Responsible AI"],
  ["adoptionReadiness", "Adoption readiness"],
  ["teamMembers", "Team members"],
  ["sponsorName", "Sponsor"],
  ["sponsorRole", "Sponsor role"],
  ["demoVideoUrl", "Demo video link"],
  ["liveLink", "Live link"],
  ["repoLink", "Repository"],
  ["additionalInfo", "Additional info"],
];

export async function GET() {
  const s = await getSession();
  if (!s || (s.role !== "admin" && s.role !== "chair")) {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await db
    .select()
    .from(submissions)
    .orderBy(desc(submissions.createdAt));

  const evals = rows.length
    ? await db
        .select({
          submissionId: evaluations.submissionId,
          scores: evaluations.scores,
          weightedTotal: evaluations.weightedTotal,
        })
        .from(evaluations)
        .where(inArray(evaluations.submissionId, rows.map((r) => r.id)))
    : [];

  const byId = new Map<string, typeof evals>();
  for (const e of evals) {
    const list = byId.get(e.submissionId) ?? [];
    list.push(e);
    byId.set(e.submissionId, list);
  }
  const tierLabel = (k: string) => TIERS.find((t) => t.key === k)?.label ?? k;

  const headers = [
    "Submission ID",
    "Initiative",
    "Status",
    "Theme",
    "Function",
    "Use case stage",
    "Submitter",
    "Submitter email",
    "Submitted at",
    "Evaluators",
    "Panel average (/100)",
    "Panel tier",
    ...CRITERIA.map((c) => `Panel avg — ${c.label} (/5)`),
    ...FIELDS.map(([, label]) => label),
  ];

  const body = toCsv(
    headers,
    rows.map((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      const es = byId.get(r.id) ?? [];
      const n = es.length;
      const avg = n ? es.reduce((a, e) => a + e.weightedTotal / 10, 0) / n : null;
      const critAvg = (key: string) =>
        n
          ? (
              es.reduce(
                (a, e) => a + (Number((e.scores as Record<string, number>)[key]) || 0),
                0,
              ) / n
            ).toFixed(1)
          : "";
      return [
        r.id,
        r.initiativeName,
        r.status,
        r.theme,
        r.functionArea,
        r.useCaseStage,
        r.submitterName,
        r.submitterEmail,
        r.createdAt,
        n,
        avg == null ? "" : avg.toFixed(1),
        avg == null ? "" : tierLabel(tierFor(avg).key),
        ...CRITERIA.map((c) => critAvg(c.key)),
        ...FIELDS.map(([key]) => {
          const v = d[key];
          return Array.isArray(v) ? v.join("; ") : v;
        }),
      ];
    }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`submissions-${stamp}.csv`, body);
}
