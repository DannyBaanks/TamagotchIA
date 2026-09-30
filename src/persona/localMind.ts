/**
 * The boundary to the native GUS runtime (llama.cpp on iOS/Android). Only strings cross
 * it: a system message (contract + compiled Context Box) and a user message (the turn). The
 * plugin never receives the World, a store, settings or a secret, and has nothing to call
 * back into; whatever it returns is plain text for the validator.
 */
import { validateContextBox } from "./contextBox";
import { SYSTEM_PROMPT } from "./contract";
import type { CreatureMind } from "./mind";

export interface GusMessage {
  role: "system" | "user";
  content: string;
}

export interface GusGenerateOptions {
  /** Already composed by composeLocalChat, so every native glue sends exactly the same chat. */
  messages: GusMessage[];
  maxTokens: number;
}

/** Implemented natively (M3.4: Android and iOS); the native side only formats and generates. */
export interface GusLocalPlugin {
  generate(options: GusGenerateOptions): Promise<{ text: string }>;
}

/**
 * The one place the local chat is composed. The system message carries the contract and
 * the Context Box: both change slowly, so they form a prefix a runtime can reuse. The turn
 * (event + what the player said) is the user message.
 */
export function composeLocalChat(boxJson: string, turnJson: string): GusMessage[] {
  return [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nLo que sabes de ti (Context Box, JSON; solo lectura):\n${boxJson}` },
    { role: "user", content: turnJson },
  ];
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
        messages: composeLocalChat(JSON.stringify(checked.box), JSON.stringify(request.turn)),
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
