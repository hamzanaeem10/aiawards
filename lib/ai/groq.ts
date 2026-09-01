// Groq (OpenAI-compatible) — used only for the SUPPLEMENTARY AI assessment on the
// evaluate screen. It never writes to `evaluations` or the lifecycle.

export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
export const GROQ_ENABLED = !!process.env.GROQ_API_KEY;

/** One JSON completion. Throws on transport / parse failure — callers handle it. */
export async function groqJson(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: opts.model || GROQ_MODEL,
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : content);
}
