// Single source of truth for the JazzWorld Assessment Model.
//
// ⚠ PROVISIONAL — the criteria, weights and tier thresholds below are placeholders
// taken from the framework deck and are NOT yet signed off. The UI surfaces every
// total as "indicative". When the framework is finalised, edit this one file:
// nothing else hard-codes criteria, weights or thresholds.
//
// Scoring is done ONLY by a human evaluator — nothing in this file is ever produced by AI.

export const CRITERIA = [
  {
    key: "impact",
    label: "Impact (incl. financial)",
    weight: 45,
    desc: "The real difference this makes for customers, employees, or the business — including quantified financial impact (revenue, cost savings/avoidance, efficiency) where applicable.",
    scale: ["Negligible", "Limited", "Moderate", "Strong", "Exceptional"],
  },
  {
    key: "evidence",
    label: "Evidence",
    weight: 20,
    desc: "Quality of proof behind the results. Under Development / Pilot ideas are scored on feasibility & pilot quality instead.",
    scale: ["Unsubstantiated", "Anecdotal", "Feasibility shown", "Pilot data", "Verified results"],
  },
  {
    key: "innovation",
    label: "AI Innovation",
    weight: 15,
    desc: "How novel the approach is versus the status quo at JazzWorld.",
    scale: ["Routine", "Incremental", "Notable", "Distinctive", "Breakthrough"],
  },
  {
    key: "scalability",
    label: "Scalability and Applicability",
    weight: 10,
    desc: "Potential to grow beyond the originating team, and how broadly the approach applies to other use cases, functions or markets.",
    scale: ["Single use", "Team-only", "Function-wide", "Company-wide", "Multi-market"],
  },
  {
    key: "responsible",
    label: "Responsible AI",
    weight: 10,
    desc: "Data privacy, fairness, explainability and human oversight.",
    scale: ["Not addressed", "Partial", "Adequate", "Strong", "Exemplary"],
  },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export const TIERS = [
  { key: "award", min: 85, label: "JW AI Impact Award tier" },
  { key: "finalist", min: 70, label: "Quarterly Finalist" },
  { key: "hero", min: 55, label: "Monthly AI Hero" },
  { key: "develop", min: 40, label: "Needs Development" },
  { key: "noprogress", min: 0, label: "Not Progressed at This Time" },
] as const;

/** raw = { impact: 1..5, ... }. Returns weighted total out of 100. */
export function weightedTotal(raw: Partial<Record<CriterionKey, number>>): number {
  let total = 0;
  for (const c of CRITERIA) {
    const v = raw[c.key];
    if (typeof v === "number") total += (v / 5) * c.weight;
  }
  return Math.round(total * 10) / 10;
}

export function tierFor(total: number) {
  return TIERS.find((t) => total >= t.min) ?? TIERS[TIERS.length - 1];
}

// ---- Outcome → lifecycle -------------------------------------------------
// The evaluator's recorded outcome (auto-suggested tier, or an explicit
// override) advances the submission to one of these lifecycle statuses.
export const OUTCOME_STATUS: Record<string, string> = {
  award: "AWARD",
  finalist: "QUARTERLY_FINALIST",
  hero: "MONTHLY_HERO",
  develop: "BIMONTHLY_REVIEW",
  noprogress: "NOT_PROGRESSED",
};

const NEXT_STEP: Record<string, string> = {
  award:
    "Recommend for the JW AI Impact Award. Route to the CPO & Chief AI Officer for review and CEO approval, then move into Pilot & Scale support.",
  finalist:
    "Shortlist as a Quarterly Finalist. Confirm Business & Finance and Tech/Control validation before it competes for the JW AI Impact Award.",
  hero:
    "Recognize as a Monthly AI Hero. Continue through the Bi-Monthly Review for development support and to build toward quarterly selection.",
  develop:
    "Not shortlisted this cycle. Return with feedback via the Bi-Monthly Review — focus on strengthening Impact and Evidence before resubmission.",
  noprogress:
    "Do not progress at this time. Encourage the submitter to revisit the problem definition and feasibility, and resubmit in a future cycle.",
};

export function nextStepText(outcome: string): string {
  return NEXT_STEP[outcome] ?? "Score every criterion to see the recommended next step.";
}

export const STATUSES = [
  "SUBMITTED",
  "IN_REVIEW",
  "MONTHLY_HERO",
  "BIMONTHLY_REVIEW",
  "QUARTERLY_FINALIST",
  "AWARD",
  "PILOT_SCALE",
  "NOT_PROGRESSED",
] as const;
export type Status = (typeof STATUSES)[number];
