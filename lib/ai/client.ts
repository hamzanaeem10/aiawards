import Anthropic from "@anthropic-ai/sdk";

export const AI_DISABLED =
  process.env.AI_DISABLED === "1" || !process.env.ANTHROPIC_API_KEY;

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export const anthropic = AI_DISABLED ? null : new Anthropic();

/**
 * Guardrail helper. Every AI call in this app is ADVISORY:
 *  - it summarizes / drafts / flags
 *  - it NEVER returns a score, a rank, a tier, or a pass/fail decision
 * The system prompt below is prepended to every call.
 */
export const ADVISORY_SYSTEM =
  "You are an assistant to the JazzWorld AI Impact Awards committee. " +
  "Your role is strictly advisory: you summarize submissions, surface questions, " +
  "and draft text for humans to edit. You must NEVER assign, suggest, or imply a " +
  "numeric score, a ranking, a tier, an award outcome, or a pass/fail judgement. " +
  "If asked to evaluate or score, respond that scoring is done only by the human panel.";

export async function runText(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  if (!anthropic) return "";
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    thinking: { type: "adaptive" },
    system: [ADVISORY_SYSTEM, opts.system].filter(Boolean).join("\n\n"),
    messages: [{ role: "user", content: opts.prompt }],
  });
  const msg = await stream.finalMessage();
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
