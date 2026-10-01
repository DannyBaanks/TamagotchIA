/**
 * Wires the native plugin in the Capacitor app. In the PWA there is no native runtime:
 * this returns null and the creature keeps its remote or fallback voice.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { localMind, type GusLocalPlugin } from "./localMind";
import type { CreatureMind } from "./mind";

let plugin: GusLocalPlugin | null = null;
let cached: { model: string; mind: CreatureMind } | null = null;

export function nativeLocalMind(model: string): CreatureMind | null {
  if (!Capacitor.isNativePlatform()) return null;
  plugin ??= registerPlugin<GusLocalPlugin>("GusLocal");
  // Reuse the mind (and the loaded model) while the chosen file stays the same.
  if (cached?.model !== model) cached = { model, mind: localMind(plugin, { model }) };
  return cached.mind;
}
