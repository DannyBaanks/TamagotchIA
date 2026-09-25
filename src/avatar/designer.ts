/**
 * The model as a designer. It gets the catalog and the player's request and must answer
 * with a criatura/1 spec. The compiler checks it; if it is wrong, the model gets ONE more
 * turn carrying the exact error (field, value, what is allowed) — Munder's INVALID_ENUM
 * loop. If that also fails, the player's own words are compiled instead, so asking for a
 * look always ends with a creature on screen.
 *
 * What comes back is data. It never runs, never touches the game, never reaches the save.
 */
import type { ChatMessage, ChatModel } from "../persona/providers";
import { ERAS, SPEC_ID, catalogText, describe, parseSpec, type CreatureSpec, type EraId, type SpecError } from "./spec";

export type DesignMode = "partes" | "pixeles";

export interface DesignRequest {
  description: string;
  era: EraId;
  mode: DesignMode;
  name: string;
}

export interface Attempt {
  ok: boolean;
  /** The compiler's verdict in words, for the "cómo lo hizo" panel. */
  note: string;
  latencyMs: number;
}

export interface Design {
  spec: CreatureSpec;
  source: "model" | "words";
  attempts: Attempt[];
  warnings: string[];
  /** Why the model's design was not used, when it was not. Never contains the key. */
  problem: string | null;
}

const PIXEL_POSES = ["idle", "success", "error", "waiting"] as const;

export function systemPrompt(req: DesignRequest): string {
  const era = ERAS[req.era];
  if (req.mode === "pixeles") {
    const row = ".".repeat(era.size);
    return [
      `You are a pixel artist for a virtual pet. Draw it as JSON, nothing else.`,
      `Canvas: ${era.size}×${era.size} (${era.label}). Up to ${era.maxColors} colors plus "." for transparent.`,
      `Format: {"spec":"${SPEC_ID}","era":"${req.era}","kind":"pixeles","palette":{"a":"#rrggbb",...},"poses":{"idle":[[${era.size} rows]],...}}`,
      `Each pose is a list of frames; each frame is exactly ${era.size} strings of exactly ${era.size} characters, e.g. "${row}".`,
      `Every character is "." or a palette key. Draw poses ${PIXEL_POSES.join(", ")}; idle should have 2 frames (a small bob). Missing poses reuse idle.`,
      `Front view, centered, feet on the bottom rows, a dark outline around the body.`,
    ].join("\n");
  }
  return [
    `You design the look of a virtual pet. You do not draw: you pick parts from closed lists and a compiler draws them in ${era.label}.`,
    `Answer with ONE JSON object, nothing else:`,
    `{"spec":"${SPEC_ID}","era":"${req.era}","kind":"partes","body":…,"ears":…,"eyes":…,"mouth":…,"tail":…,"pattern":…,"accessory":…,"color":…,"accent":…,"accessory_color":…}`,
    `Use only these values (exact spelling):`,
    catalogText(),
    `"accent" colors the belly, inner ears and markings. Pick what best matches the request; if something asked for is not in the lists, choose the closest.`,
  ].join("\n");
}

export function userPrompt(req: DesignRequest): string {
  return `Pet name: ${req.name.slice(0, 40)}\nRequest: ${req.description.slice(0, 400)}`;
}

/** The correction a model reads after a rejected answer. */
export function correction(error: SpecError): string {
  const parts = [`The compiler rejected your answer: ${error.code} at ${error.field}: ${error.message}.`];
  if (error.available) parts.push(`Allowed values for ${error.field}: ${error.available.join(", ")}.`);
  parts.push("Send the whole JSON object again, fixed, and nothing else.");
  return parts.join(" ");
}

function explain(error: SpecError): string {
  const allowed = error.available ? ` (se vale: ${error.available.slice(0, 8).join(", ")}${error.available.length > 8 ? "…" : ""})` : "";
  return `${error.field}: ${error.message}${allowed}`;
}

export async function design(
  model: ChatModel | null,
  req: DesignRequest,
  timeoutMs: number,
  clock: () => number = Date.now,
): Promise<Design> {
  const fromWords = (problem: string | null, attempts: Attempt[]): Design => {
    const d = describe(req.description, req.era);
    return { spec: d.spec, source: "words", attempts, warnings: d.warnings, problem };
  };
  if (!model) return fromWords(null, []);

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(req) }, { role: "user", content: userPrompt(req) }];
  const attempts: Attempt[] = [];
  const size = ERAS[req.era].size;
  const maxTokens = req.mode === "pixeles" ? Math.min(6000, 400 + size * size * PIXEL_POSES.length) : 400;
  let problem = "";
  for (let turn = 0; turn < 2; turn++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = clock();
    try {
      const raw = await model.chat(messages, { temperature: turn === 0 ? 0.7 : 0.2, maxTokens }, controller.signal);
      const checked = parseSpec(raw, req.era);
      const latencyMs = clock() - started;
      if (checked.ok) {
        // the era is the player's choice, whatever the model wrote
        const spec = { ...checked.spec, era: req.era } as CreatureSpec;
        const again = parseSpec(spec);
        if (again.ok) {
          attempts.push({ ok: true, note: turn === 0 ? "el motor lo aceptó a la primera" : "el motor lo aceptó después de una corrección", latencyMs });
          return { spec: again.spec, source: "model", attempts, warnings: checked.warnings, problem: null };
        }
        problem = explain(again.error);
        attempts.push({ ok: false, note: problem, latencyMs });
        messages.push({ role: "assistant", content: raw.slice(0, 20000) }, { role: "user", content: correction(again.error) });
        continue;
      }
      problem = explain(checked.error);
      attempts.push({ ok: false, note: problem, latencyMs });
      messages.push({ role: "assistant", content: raw.slice(0, 20000) }, { role: "user", content: correction(checked.error) });
    } catch (error) {
      const aborted = controller.signal.aborted;
      problem = aborted ? `sin respuesta en ${Math.round(timeoutMs / 1000)} s`
        : error instanceof TypeError ? "el servicio no le contestó a esta página: sin internet, o no acepta apps web (CORS)"
        : error instanceof Error ? error.message : String(error);
      attempts.push({ ok: false, note: problem, latencyMs: clock() - started });
      break; // a network problem will not fix itself with a correction
    } finally {
      clearTimeout(timer);
    }
  }
  return fromWords(problem, attempts);
}

