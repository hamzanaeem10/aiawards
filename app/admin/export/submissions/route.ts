import { desc } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { getSession } from "@/lib/auth";
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
    ...FIELDS.map(([, label]) => label),
  ];

  const body = toCsv(
    headers,
    rows.map((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
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
