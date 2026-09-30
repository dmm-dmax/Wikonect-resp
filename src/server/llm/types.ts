export type LlmTask = "extract_complaints" | "extract_slot";

export interface LlmRequest {
  task: LlmTask;
  promptId: string;
  /** z. B. "extract-slot@v1" – wird je Eintrag gespeichert */
  promptVersion: string;
  system: string;
  input: Record<string, unknown>;
}

export interface LlmResponse {
  json: unknown;
  model: string;
}

/** Austauschbare KI-Anbindung. Kein Provider-Code außerhalb von src/server/llm/. */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
