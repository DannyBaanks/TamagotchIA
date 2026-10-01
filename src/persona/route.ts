/**
 * Which brain speaks this turn, and what it may see. Pure, so the rules are testable:
 *
 * - GUS local chosen → only the local mind, with the compiled Context Box. Where there is
 *   no native runtime (the PWA) it is the local voice plus a notice, NEVER a silent switch
 *   to a remote model: choosing "on this phone" must not turn into egress.
 * - Otherwise the remote provider as before, with the turn only (box: null) until M5.
 * - Nothing configured → the local voice.
 */
import type { World } from "../engine/types";
import { estimateTokens } from "./budget";
import { compileContextBox } from "./compile";
import type { PersonaInput } from "./contract";
import { LOCAL_CONTEXT_TOKENS, LOCAL_MAX_TOKENS, composeLocalChat } from "./localMind";
import { remoteMind, type CreatureMind, type MindRequest } from "./mind";
import { speak, type Narration, type PersonalityProvider } from "./providers";

export const LOCAL_REQUIRES_NATIVE = "GUS local requiere la app nativa (Android o iPhone). Aquí habla con su voz local.";
/**
 * Headroom for the token ESTIMATE: tokenizers differ (the same chat measured 1380 tokens
 * with Qwen2.5 and 1662 with a llama vocabulary). M4.0 replaces this with real counts.
 */
export const LOCAL_SAFETY_MARGIN_TOKENS = 256;
/** Loading a model the first time can take seconds on a phone. */
export const LOCAL_TIMEOUT_MS = 45_000;

export interface RouteInput {
  localEnabled: boolean;
  localModel: string;
  /** null outside the native app. */
  local: (model: string) => CreatureMind | null;
  remote: PersonalityProvider | null;
}

export type Route =
  | { kind: "local"; mind: CreatureMind; model: string }
  | { kind: "remote"; mind: CreatureMind }
  | { kind: "fallback"; notice: string | null };

export function routeMind(input: RouteInput): Route {
  if (input.localEnabled) {
    const model = input.localModel.trim();
    if (!model) return { kind: "fallback", notice: "Elige el archivo del modelo para GUS local en Ajustes." };
    const mind = input.local(model);
    return mind ? { kind: "local", mind, model } : { kind: "fallback", notice: LOCAL_REQUIRES_NATIVE };
  }
  return input.remote ? { kind: "remote", mind: remoteMind(input.remote) } : { kind: "fallback", notice: null };
}

/**
 * The request for a local mind: the box is compiled to fit what is left of the window after
 * the reply, the margin, the system message and the turn. null when even the core does not
 * fit, so the caller uses the local voice instead of overflowing the runtime.
 */
export function localRequest(world: World, turn: PersonaInput, now: number, model: string): MindRequest | null {
  const turnJson = JSON.stringify(turn);
  // The system message minus the box itself, composed exactly as the plugin will see it.
  const systemTokens = estimateTokens(composeLocalChat("", turnJson)[0]!.content);
  const budget = LOCAL_CONTEXT_TOKENS - LOCAL_MAX_TOKENS - LOCAL_SAFETY_MARGIN_TOKENS - systemTokens - estimateTokens(turnJson);
  if (budget <= 0) return null;
  const compiled = compileContextBox({
    world, now, budgetTokens: budget,
    model: { mode: "local", model_id: model, context_budget_tokens: budget },
  });
  return compiled.fits ? { turn, box: compiled.box } : null;
}

/** One turn through the chosen route. Same contract as before: a validated reply or the local voice. */
export async function speakRouted(
  route: Route,
  world: World,
  turn: PersonaInput,
  now: number,
  seq: number,
  remoteTimeoutMs: number,
): Promise<Narration> {
  if (route.kind === "local") {
    const request = localRequest(world, turn, now, route.model);
    if (!request) return { ...(await speak(null, { turn, box: null }, seq, 0)), problem: "la Context Box no cabe en la ventana del modelo local" };
    return speak(route.mind, request, seq, LOCAL_TIMEOUT_MS);
  }
  if (route.kind === "remote") return speak(route.mind, { turn, box: null }, seq, remoteTimeoutMs);
  return { ...(await speak(null, { turn, box: null }, seq, 0)), problem: route.notice };
}
