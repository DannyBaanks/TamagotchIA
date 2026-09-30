/**
 * Wires the native plugin in the Capacitor app. In the PWA there is no native runtime:
 * this returns null and the creature keeps its remote or fallback voice.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { localMind, type GusLocalPlugin } from "./localMind";
import type { CreatureMind } from "./mind";

export function nativeLocalMind(): CreatureMind | null {
  if (!Capacitor.isNativePlatform()) return null;
  return localMind(registerPlugin<GusLocalPlugin>("GusLocal"));
}
