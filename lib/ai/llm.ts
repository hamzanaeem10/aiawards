// LLM client for the SUPPLEMENTARY AI assessment on the evaluate screen.
// It never writes to `evaluations` or the lifecycle — see the scoring policy
// in README.md.
//
// Two providers, one code path (both speak the OpenAI chat-completions shape):
//   • OpenAI — set OPENAI_API_KEY (+ optional OPENAI_MODEL)
//   • Groq   — set GROQ_API_KEY   (+ optional GROQ_MODEL)
// OpenAI wins if both are set. With neither, AI_ENABLED is false and the
// "Run AI assessment" button is not rendered.

type Provider = {
  name: "openai" | "groq";
  url: string;
  key: string;
  model: string;
  /** GPT-5-family models reject `max_tokens` and require `max_completion_tokens`. */
  tokenParam: "max_tokens" | "max_completion_tokens";
};

function resolveProvider(): Provider | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    return {
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      key: openaiKey,
      model,
      // gpt-5* and the o-series count reasoning tokens against the completion
      // budget and only accept the newer parameter name.
      tokenParam: /^(gpt-5|o[1-9])/.test(model)
        ? "max_completion_tokens"
        : "max_tokens",
    };
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: groqKey,
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      tokenParam: "max_tokens",
    };
  }

  return null;
}

const provider = resolveProvider();

export const AI_ENABLED = !!provider;
export const AI_PROVIDER = provider?.name ?? null;
/** Recorded on the ai_insights row so the panel can see what produced it. */
export const AI_MODEL = provider
  ? `${provider.name}/${provider.model}`
  : "none";

/** One JSON completion. Throws on transport / parse failure — callers handle it. */
export async function llmJson(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  if (!provider) {
    throw new Error("No AI provider configured (set OPENAI_API_KEY or GROQ_API_KEY)");
  }

  const body: Record<string, unknown> = {
    model: opts.model || provider.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  // Reasoning tokens are drawn from the same budget, so give the models that
  // use them more headroom or the JSON comes back truncated.
  const cap = opts.maxTokens ?? 3500;
  body[provider.tokenParam] =
    provider.tokenParam === "max_completion_tokens" ? Math.max(cap, 8000) : cap;

  // Don't hang the evaluate screen if the provider is unreachable — this
  // surfaces as "Couldn't reach the AI service" rather than a stuck spinner.
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${provider.name} ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length" && !content.trim()) {
    throw new Error(
      `${provider.name}: response truncated before any content (raise maxTokens)`,
    );
  }
  const match = content.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : content);
}
