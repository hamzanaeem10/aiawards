import { runText, MODEL, AI_DISABLED } from "./client";

export type IntakeSummary = {
  overview: string; // 1 short paragraph, plain language
  themeSuggestion: string; // Consumer / Corporate / Enterprise + confidence note
  reportedMetrics: string[]; // metrics AS STATED by the submitter (not verified)
  clarifyingQuestions: string[]; // what the reviewer may want to ask
  completenessFlags: string[]; // missing evidence, vague claims, RAI gaps
  possibleDuplicateNote: string; // free text, only if similar past entries were provided
};

const SYSTEM = `Produce a JSON object with keys: overview, themeSuggestion, reportedMetrics (array),
clarifyingQuestions (array), completenessFlags (array), possibleDuplicateNote (string).
- overview: one plain-language paragraph orienting a reviewer, <= 90 words.
- reportedMetrics: copy figures/claims exactly as the submitter phrased them; do not compute or judge them.
- Do NOT score, rank, or recommend an outcome. Output ONLY the JSON object.`;

export async function generateIntakeSummary(input: {
  submission: Record<string, unknown>;
  priorInitiatives?: { id: string; name: string; summary: string }[];
}): Promise<{ model: string; content: IntakeSummary }> {
  const fallback: IntakeSummary = {
    overview: "",
    themeSuggestion: "",
    reportedMetrics: [],
    clarifyingQuestions: [],
    completenessFlags: [],
    possibleDuplicateNote: "",
  };
  if (AI_DISABLED) return { model: "disabled", content: fallback };

  const prompt = [
    "SUBMISSION (JSON):",
    JSON.stringify(input.submission, null, 2),
    input.priorInitiatives?.length
      ? "\nPAST INITIATIVES (for duplicate awareness only):\n" +
        input.priorInitiatives
          .map((p) => `- ${p.name}: ${p.summary}`)
          .join("\n")
      : "",
  ].join("\n");

  const raw = await runText({ system: SYSTEM, prompt, maxTokens: 2000 });
  try {
    const json = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
    return { model: MODEL, content: { ...fallback, ...json } };
  } catch {
    return { model: MODEL, content: { ...fallback, overview: raw.slice(0, 800) } };
  }
}
