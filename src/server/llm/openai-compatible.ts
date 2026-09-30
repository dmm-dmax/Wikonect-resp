import type { LlmProvider, LlmRequest, LlmResponse } from "./types";

/**
 * Adapter für OpenAI-kompatible Chat-Completions (Mistral, Azure OpenAI, vLLM, …).
 * Nur Metadaten werden geloggt, nie Inhalte. Aktivierung erfordert LLM_EU_CONFIRMED=true.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai-compatible";
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: JSON.stringify(req.input) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM-Anbieter antwortete mit ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Leere LLM-Antwort");
    return { json: JSON.parse(content), model: body.model ?? this.model };
  }
}
