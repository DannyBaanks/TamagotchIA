/**
 * CreatureMind: whatever brain interprets the creature right now. The pet is not the
 * brain: minds are swappable and none of them can write the world. Each one only returns
 * text, which goes through the same validator and falls back to the local voice.
 *
 * What a mind may SEE depends on where it runs:
 * - local (on this device): the turn plus the compiled Context Box;
 * - remote: only the turn, exactly as before, until the Interaction Gate (M5) decides
 *   what a remote projection may contain. Adding the local seam must not widen egress.
 */
import type { ContextBoxV1 } from "./contextBox";
import type { PersonaInput } from "./contract";
import type { PersonalityProvider } from "./providers";

export type MindKind = "fallback" | "remote" | "local";

export interface MindRequest {
  turn: PersonaInput;
  /** Only ever handed to a local mind. */
  box: ContextBoxV1 | null;
}

export interface CreatureMind {
  readonly name: string;
  readonly kind: MindKind;
  respond(request: MindRequest, signal: AbortSignal): Promise<string>;
}

/** The existing OpenAI-compatible providers, seen as a mind. The box never leaves the device. */
export function remoteMind(provider: PersonalityProvider): CreatureMind {
  return {
    name: provider.name,
    kind: "remote",
    respond: (request, signal) => provider.react(request.turn, signal),
  };
}
