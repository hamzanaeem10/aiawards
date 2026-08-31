import { runText, MODEL, AI_DISABLED } from "./client";
import { CRITERIA } from "../rubric";

export type ConsensusDraft = {
  consensusNote: string; // synthesis of reviewer scores + comments, editable
  divergences: string[]; // where reviewers disagreed and the likely reason
  feedbackLetter: string; // draft letter to the nominee, editable
};

const SYSTEM = `You are drafting text for the panel chair to edit before it is used.
Return a JSON object with keys: consensusNote (string), divergences (array of strings), feedbackLetter (string).
- Summarize what the reviewers said. Quote or paraphrase their rationale.
- You may state the reviewers' average as a fact IF it is given to you, but do not
  re-score, change any score, or recommend a different outcome than the panel's.
- feedbackLetter: warm, specific, constructive; addressed to the nominee; no scores unless already public.
Output ONLY the JSON object.`;

export async function generateConsensusDraft(input: {
  initiativeName: string;
  reviewers: {
    name: string;
    scores: Record<string, number>;
    weightedTotal: number;
    tier: string;
    rationale?: string | null;
  }[];
  panelOutcomeLabel: string;
}): Promise<{ model: string; content: ConsensusDraft }> {
  const fallback: ConsensusDraft = {
    consensusNote: "",
    divergences: [],
    feedbackLetter: "",
  };
  if (AI_DISABLED) return { model: "disabled", content: fallback };

  const critLabels = CRITERIA.map((c) => `${c.key}=${c.label}`).join(", ");
  const prompt = [
    `Initiative: ${input.initiativeName}`,
    `Panel outcome (decided by humans): ${input.panelOutcomeLabel}`,
    `Criteria keys: ${critLabels}`,
    "",
    "REVIEWER SCORECARDS:",
    ...input.reviewers.map(
      (r) =>
        `- ${r.name}: total ${r.weightedTotal}/100 (${r.tier}); scores ${JSON.stringify(
          r.scores,
        )}; rationale: ${r.rationale ?? "(none)"}`,
    ),
  ].join("\n");

  const raw = await runText({ system: SYSTEM, prompt, maxTokens: 4000 });
  try {
    const json = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
    return { model: MODEL, content: { ...fallback, ...json } };
  } catch {
    return { model: MODEL, content: { ...fallback, consensusNote: raw } };
  }
}
