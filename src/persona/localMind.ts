/**
 * The boundary to the native GUS runtime (llama.cpp on iOS/Android). Only strings cross
 * it: the system contract, the compiled Context Box as JSON and the turn as JSON. The
 * plugin never receives the World, a store, settings or a secret, and has nothing to call
 * back into; whatever it returns is plain text for the validator.
 */
import { validateContextBox } from "./contextBox";
import { SYSTEM_PROMPT } from "./contract";
import type { CreatureMind } from "./mind";

export interface GusGenerateOptions {
  system: string;
  /** The compiled Context Box, JSON. */
  context: string;
  /** The current turn (event + what the player said), JSON. */
  turn: string;
  maxTokens: number;
}

/** Implemented natively (M3.3 iOS, M3.4 Android). */
export interface GusLocalPlugin {
  generate(options: GusGenerateOptions): Promise<{ text: string }>;
}

export const LOCAL_MAX_TOKENS = 160;

export function localMind(plugin: GusLocalPlugin, name = "GUS local"): CreatureMind {
  return {
    name,
    kind: "local",
    async respond(request, signal) {
      // Fail closed: an invalid box (or one carrying a credential) reaches no model.
      const checked = validateContextBox(request.box);
      if (!checked.ok) throw new Error(`context box rechazada: ${checked.error}`);
      if (signal.aborted) throw new Error("cancelado");
      const call = plugin.generate({
        system: SYSTEM_PROMPT,
        context: JSON.stringify(checked.box),
        turn: JSON.stringify(request.turn),
        maxTokens: LOCAL_MAX_TOKENS,
      });
      const aborted = new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelado")), { once: true });
      });
      const result = await Promise.race([call, aborted]);
      if (!result || typeof result.text !== "string") throw new Error("el runtime local no devolvió texto");
      return result.text;
    },
  };
}
