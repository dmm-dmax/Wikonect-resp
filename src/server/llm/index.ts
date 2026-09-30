import { MockProvider } from "./mock";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import type { LlmProvider } from "./types";

let override: LlmProvider | null = null;
/** Nur für Tests. */
export function setProvider(p: LlmProvider | null) {
  override = p;
}

export function getProvider(): LlmProvider {
  if (override) return override;
  const kind = process.env.LLM_PROVIDER ?? "mock";
  if (kind === "mock") return new MockProvider();
  if (kind === "openai-compatible") {
    // Schutz: Echte Anbindung nur nach bewusster Bestätigung von EU-Verarbeitung und AVV.
    if (process.env.LLM_EU_CONFIRMED !== "true") {
      throw new Error("LLM_EU_CONFIRMED=true fehlt. Echter Anbieter nur mit EU-Verarbeitung und AVV.");
    }
    const { LLM_BASE_URL: url, LLM_API_KEY: key, LLM_MODEL: model } = process.env;
    if (!url || !key || !model) throw new Error("LLM_BASE_URL, LLM_API_KEY, LLM_MODEL erforderlich");
    return new OpenAiCompatibleProvider(url, key, model);
  }
  throw new Error(`Unbekannter LLM_PROVIDER: ${kind}`);
}

export type { LlmProvider, LlmRequest, LlmResponse } from "./types";
