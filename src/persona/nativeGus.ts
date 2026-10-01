/**
 * Wires the native plugin in the Capacitor app. In the PWA there is no native runtime:
 * this returns null and the creature keeps its remote or fallback voice.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { localMind, type GusLocalPlugin } from "./localMind";
import type { CreatureMind } from "./mind";

let plugin: GusLocalPlugin | null = null;
let cached: { model: string; mind: CreatureMind } | null = null;

/** The raw plugin, for model management in Settings. null outside the native app. */
export function nativeGusPlugin(): GusLocalPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  plugin ??= registerPlugin<GusLocalPlugin>("GusLocal");
  return plugin;
}

export function nativeLocalMind(model: string): CreatureMind | null {
  const gus = nativeGusPlugin();
  if (!gus) return null;
  // Reuse the mind (and the loaded model) while the chosen file stays the same.
  if (cached?.model !== model) cached = { model, mind: localMind(gus, { model }) };
  return cached.mind;
}

/** After a (re)import the file may have changed under the same name: load it again next turn. */
export function forgetLocalMind(): void {
  cached = null;
}
