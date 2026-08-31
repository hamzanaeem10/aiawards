import {
  CRITERIA,
  TIERS,
  weightedTotal,
  tierFor,
  type CriterionKey,
} from "@/lib/rubric";
import { GROQ_MODEL, groqJson } from "./groq";

export type AiAssessment = {
  perCriterion: {
    key: string;
    label: string;
    weight: number;
    score: number; // 1–5
    rationale: string;
  }[];
  weightedTotal: number; // computed here from the criterion scores, out of 100
  tierKey: string;
  tierLabel: string;
  summary: string;
  strengths: string[];
  risks: string[];
  confidence: "low" | "medium" | "high";
};

// ---- the strong system prompt ------------------------------------------------

function frameworkBlock(): string {
  const crit = CRITERIA.map(
    (c) =>
      `  - ${c.label} — ${c.weight}% — ${c.desc}\n    scale: 1 ${c.scale[0]} · 2 ${c.scale[1]} · 3 ${c.scale[2]} · 4 ${c.scale[3]} · 5 ${c.scale[4]}`,
  ).join("\n");
  const tiers = TIERS.map((t) => `${t.min}+ ${t.label}`).join(" · ");
  return `${crit}\n\nIndicative tier bands on the weighted total (out of 100): ${tiers}. Bands are provisional — report the score, the panel decides the tier.`;
}

const SYSTEM = `You are a senior evaluator for the JazzWorld AI Impact Awards, assisting the human awards panel.

CONTEXT
JazzWorld is the digital-services brand of Jazz — Pakistan's largest telecom operator and a VEON operating company. JazzCash is its fintech arm. The Awards recognise AI-led initiatives built by JazzWorld employees across the business: Jazz GSM, Jazz Business, Enterprise Solutions, Consumer, Technology, Artificial Intelligence, Cyber Security, Teknosys, JazzCash, Finance, Strategy, People & Organization, Legal, Compliance, Internal Audit and more. Every initiative maps to one AI1440 theme: Consumer, Corporate, or Enterprise. Solutions may be Under Development, in Pilot/Testing, or Implemented, and move through a lifecycle: Monthly AI Hero → Bi-Monthly Review → Quarterly Finalist → JW AI Impact Award → Pilot & Scale.

YOUR ROLE
Produce ONE supplementary assessment that sits ALONGSIDE — never replaces — a human evaluator's scoring. The human panel owns every real decision: the score of record, the tier, the award, and lifecycle progression. Your output is a calibrated second opinion the evaluator can weigh, agree with, or set aside. Do not address the nominee; you are writing for the panel.

THE ASSESSMENT MODEL — apply it exactly
Score each criterion with a whole number 1–5. Weights are fixed:
${frameworkBlock()}

HOW TO SCORE
- Score only what the submission actually supports. Treat every figure, metric and claim as REPORTED, not verified. A bold impact claim with no evidence behind it is a weakness on the Evidence criterion, not a win on Impact.
- Be calibrated and slightly conservative against a large-telecom bar. A 5 is genuinely exceptional; most solid, real initiatives land around 3.
- Match Evidence to the stage: an Implemented solution needs measured results for a high Evidence score; a Pilot is judged on the quality of its pilot design and its early data; an Under Development idea on feasibility.
- Responsible AI: reward concrete measures — data minimisation/redaction, fairness testing, human-in-the-loop, auditability, retention limits — not stated intentions.
- Scalability and Applicability: weigh both how far it can grow past the originating team and how readily the same approach transfers to other use cases, functions or markets.
- Where you are inferring, or where key information is missing, say so and let it lower your confidence rather than inflating or deflating a score.

OUTPUT — strict JSON only, exactly this shape:
{
  "perCriterion": [
    { "key": "<criterion key>", "score": <1-5 integer>, "rationale": "1-2 sentences citing specifics from THIS submission" }
    // one object per criterion — use exactly these keys: ${CRITERIA.map((c) => c.key).join(", ")}
  ],
  "summary": "2-4 sentences for the panel: what this is, its strongest and weakest dimensions, how ready it is",
  "strengths": ["short bullet", "..."],
  "risks": ["unverified claims, evidence gaps, Responsible-AI concerns, scale blockers", "..."],
  "confidence": "low" | "medium" | "high"
}
Do NOT output a weighted total or a tier — the system computes those from your criterion scores. Output nothing but the JSON object.`;

// ---- the per-submission user message ----------------------------------------

function submissionBlock(sub: {
  initiativeName: string;
  theme: string | null;
  functionArea: string | null;
  useCaseStage: string | null;
  data: Record<string, unknown>;
}): string {
  const d = sub.data ?? {};
  const g = (k: string) => {
    const v = d[k];
    return Array.isArray(v) ? v.filter(Boolean).join(", ") : v ? String(v) : "";
  };
  const rows: [string, string][] = [
    ["Initiative", sub.initiativeName],
    ["AI1440 theme", sub.theme ?? ""],
    ["Business / function", sub.functionArea ?? ""],
    ["Use case stage", sub.useCaseStage ?? ""],
    ["Submission type", g("submissionType")],
    ["Business challenge / opportunity", g("challenge")],
    ["AI solution", g("solution")],
    ["AI technology / approach", [g("aiTech"), g("aiTechOther")].filter(Boolean).join("; ")],
    ["Target users / customers", g("targetUsers")],
    ["What's new or different", g("whatsNew")],
    ["Impact (as described)", g("impact")],
    ["Financial impact (as reported)", [g("financialImpact"), g("financialImpactDetail")].filter(Boolean).join(" — ")],
    ["Evidence stage", g("evidenceStage")],
    ["Scalability potential", g("scalability")],
    ["Key metrics (as reported)", g("keyMetrics")],
    ["Responsible AI details", g("responsibleAI")],
    ["Adoption readiness", g("adoptionReadiness")],
    ["Team", g("teamMembers")],
    ["Sponsor", [g("sponsorName"), g("sponsorRole")].filter(Boolean).join(" — ")],
    ["Demo video link", g("demoVideoUrl")],
    ["Live link", g("liveLink")],
    ["Code repository", g("repoLink")],
    ["Additional information", g("additionalInfo")],
  ];
  return rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export async function generateAiAssessment(sub: {
  initiativeName: string;
  theme: string | null;
  functionArea: string | null;
  useCaseStage: string | null;
  data: Record<string, unknown>;
}): Promise<{ model: string; content: AiAssessment }> {
  const raw = await groqJson({
    system: SYSTEM,
    user:
      "Assess this submission against the JazzWorld Assessment Model.\n\n" +
      submissionBlock(sub),
    maxTokens: 3500,
  });

  const rawPer = Array.isArray(raw.perCriterion) ? raw.perCriterion : [];
  const scores: Partial<Record<CriterionKey, number>> = {};
  const perCriterion = CRITERIA.map((c) => {
    const hit = rawPer.find(
      (x: Record<string, unknown>) =>
        String(x?.key).toLowerCase() === c.key ||
        String(x?.label).toLowerCase() === c.label.toLowerCase(),
    ) as Record<string, unknown> | undefined;
    let score = Math.round(Number(hit?.score));
    if (!Number.isFinite(score)) score = 3;
    score = Math.min(5, Math.max(1, score));
    scores[c.key] = score;
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      score,
      rationale: String(hit?.rationale ?? "").trim().slice(0, 600),
    };
  });

  // Compute the total OURSELVES on the same formula the humans use — never trust
  // the model's arithmetic.
  const total = weightedTotal(scores);
  const tier = tierFor(total);

  const asList = (v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
      : [];

  const conf = String(raw.confidence).toLowerCase();

  return {
    model: GROQ_MODEL,
    content: {
      perCriterion,
      weightedTotal: total,
      tierKey: tier.key,
      tierLabel: tier.label,
      summary: String(raw.summary ?? "").trim().slice(0, 1400),
      strengths: asList(raw.strengths),
      risks: asList(raw.risks),
      confidence:
        conf === "low" || conf === "high" ? (conf as "low" | "high") : "medium",
    },
  };
}
