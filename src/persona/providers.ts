/**
 * Who speaks. The model is tried first when configured; anything that goes wrong
 * (no key, offline, timeout, CORS, bad JSON, out-of-list emotion) falls back to the local
 * voice. The game has already moved on by then: narration never blocks or changes a command.
 */
import { SYSTEM_PROMPT, validateReply, type PersonaInput, type PersonaReply } from "./contract";
import { fallbackReply } from "./fallback";

export interface PersonalityProvider {
  readonly name: string;
  react(input: PersonaInput, signal: AbortSignal): Promise<string>;
}

export interface OpenAICompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export class OpenAICompatibleProvider implements PersonalityProvider {
  readonly name: string;
  constructor(private readonly config: OpenAICompatibleConfig, private readonly fetcher: typeof fetch = fetch.bind(globalThis)) {
    this.name = config.model || "modelo";
  }

  /** The request body, exposed so tests can prove the key never travels inside it. */
  body(input: PersonaInput): string {
    return JSON.stringify({
      model: this.config.model,
      temperature: 0.8,
      max_tokens: 160,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input) },
      ],
    });
  }

  async react(input: PersonaInput, signal: AbortSignal): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    const res = await this.fetcher(url, { method: "POST", headers, body: this.body(input), signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("respuesta sin choices[0].message.content");
    return content;
  }
}

/** Test double: answers whatever it was given, in order. */
export class MockProvider implements PersonalityProvider {
  readonly name = "mock";
  constructor(private readonly answers: Array<string | Error>) {}
  async react(): Promise<string> {
    const next = this.answers.shift();
    if (next === undefined) throw new Error("mock sin respuestas");
    if (next instanceof Error) throw next;
    return next;
  }
}

export interface Narration {
  reply: PersonaReply;
  source: "model" | "fallback";
  /** Why the model was not used, for the debug panel. Never contains the key. */
  problem: string | null;
  latencyMs: number | null;
}

export async function narrate(
  provider: PersonalityProvider | null,
  input: PersonaInput,
  seq: number,
  timeoutMs: number,
  clock: () => number = Date.now,
): Promise<Narration> {
  if (!provider) return { reply: fallbackReply(input, seq), source: "fallback", problem: null, latencyMs: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = clock();
  try {
    const raw = await provider.react(input, controller.signal);
    const checked = validateReply(raw);
    if (checked.ok) return { reply: checked.reply, source: "model", problem: null, latencyMs: clock() - started };
    return { reply: fallbackReply(input, seq), source: "fallback", problem: `respuesta inválida: ${checked.error}`, latencyMs: clock() - started };
  } catch (error) {
    const aborted = controller.signal.aborted;
    const message = aborted ? `sin respuesta en ${timeoutMs} ms` : error instanceof Error ? error.message : String(error);
    return { reply: fallbackReply(input, seq), source: "fallback", problem: message, latencyMs: null };
  } finally {
    clearTimeout(timer);
  }
}
