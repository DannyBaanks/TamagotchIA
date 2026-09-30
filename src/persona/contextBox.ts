/**
 * Context Box v1: the bounded, versioned snapshot of what the creature's brain may know
 * right now. It is built by code from the save (M2), read by any brain (fallback, remote,
 * local GGUF), and never written back. Keys are snake_case because the model reads them.
 *
 * Aligned with the life packet schema (docs/tamagotchia/life-packet in IsyMotron).
 */

export const CONTEXT_BOX_SCHEMA = "tamagotchia.context-box.v1";
/** The reply contract today is PersonaReply (persona/contract.ts), stricter than the packet's MindReplyV1. */
export const REPLY_SCHEMA = "tamagotchia.persona-reply.v1";

export interface Guardrails {
  may_modify_game_state: false;
  may_use_tools: false;
  may_access_files: false;
  may_access_network: false;
  reply_schema: string;
}

/** Written by code, identical for every brain: no model is ever granted more. */
export const GUARDRAILS: Readonly<Guardrails> = Object.freeze({
  may_modify_game_state: false,
  may_use_tools: false,
  may_access_files: false,
  may_access_network: false,
  reply_schema: REPLY_SCHEMA,
});

export interface ContextBoxV1 {
  schema: typeof CONTEXT_BOX_SCHEMA;
  generated_at: number;
  identity: Record<string, unknown>;
  canonical_state: Record<string, unknown>;
  stat_trends?: Record<string, unknown>;
  recent_events?: unknown[];
  episodic_memories?: unknown[];
  relationship?: Record<string, unknown>;
  preferences_and_habits?: Record<string, unknown>;
  conversation_digest?: Record<string, unknown>;
  open_threads?: unknown[];
  environment?: Record<string, unknown>;
  model_context?: Record<string, unknown>;
  guardrails: Guardrails;
}

export const LIMITS = { recent_events: 20, episodic_memories: 20, open_threads: 8 } as const;

const OBJECT_KEYS = ["identity", "canonical_state", "stat_trends", "relationship", "preferences_and_habits",
  "conversation_digest", "environment", "model_context"] as const;
const ALLOWED_KEYS = new Set<string>(["schema", "generated_at", "guardrails", ...OBJECT_KEYS, ...Object.keys(LIMITS)]);

/**
 * Text that looks like a credential. Defence in depth: the compiler must never put one
 * in, and a box that contains one is rejected rather than sent to any model.
 */
const SECRET_SHAPES = [
  /\bsk-[A-Za-z0-9_-]{16,}/, // OpenAI / OpenRouter style
  /\bnvapi-[A-Za-z0-9_-]{16,}/, // NVIDIA
  /\bAIza[0-9A-Za-z_-]{30,}/, // Google
  /\bxai-[A-Za-z0-9_-]{16,}/, // xAI
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub
  /\bBearer\s+[A-Za-z0-9._-]{12,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function containsSecret(value: unknown): boolean {
  const text = JSON.stringify(value) ?? "";
  return SECRET_SHAPES.some((re) => re.test(text));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export type BoxValidation = { ok: true; box: ContextBoxV1 } | { ok: false; error: string };

/** Fail closed: anything unexpected makes the box invalid, and an invalid box reaches no model. */
export function validateContextBox(value: unknown): BoxValidation {
  if (!isObject(value)) return { ok: false, error: "no es un objeto" };
  if (value.schema !== CONTEXT_BOX_SCHEMA) return { ok: false, error: `schema desconocido: ${String(value.schema)}` };
  if (typeof value.generated_at !== "number" || !Number.isFinite(value.generated_at)) return { ok: false, error: "generated_at inválido" };
  const extra = Object.keys(value).filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length) return { ok: false, error: `campos no permitidos: ${extra.join(", ")}` };
  if (!isObject(value.identity) || !isObject(value.canonical_state)) return { ok: false, error: "faltan identity o canonical_state" };
  for (const key of OBJECT_KEYS) {
    if (value[key] !== undefined && !isObject(value[key])) return { ok: false, error: `${key} no es un objeto` };
  }
  for (const [key, max] of Object.entries(LIMITS)) {
    const list = value[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return { ok: false, error: `${key} no es una lista` };
    if (list.length > max) return { ok: false, error: `${key} excede ${max}` };
  }
  const g = value.guardrails;
  if (!isObject(g)) return { ok: false, error: "faltan guardrails" };
  const granted = ["may_modify_game_state", "may_use_tools", "may_access_files", "may_access_network"].filter((k) => g[k] !== false);
  if (granted.length) return { ok: false, error: `guardrails conceden permisos: ${granted.join(", ")}` };
  if (typeof g.reply_schema !== "string") return { ok: false, error: "guardrails sin reply_schema" };
  if (containsSecret(value)) return { ok: false, error: "contiene algo con forma de credencial" };
  return { ok: true, box: value as unknown as ContextBoxV1 };
}
