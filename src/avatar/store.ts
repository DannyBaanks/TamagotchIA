/**
 * The chosen look lives beside the save, never inside it: the engine's world (and its
 * checksum) stays exactly as before, and "back to the GIF" is just removing this key.
 */
import type { KeyValueStore } from "../store/save";
import { parseSpec, type CreatureSpec } from "./spec";

export const AVATAR_KEY = "tamagotchia.avatar.v1";

export interface SavedAvatar {
  spec: CreatureSpec;
  /** Who designed it: the player's words, or which model. */
  author: string;
  /** What was asked for, to show it back. */
  prompt: string;
  savedAt: number;
}

export function loadAvatar(store: KeyValueStore): SavedAvatar | null {
  try {
    const raw = JSON.parse(store.getItem(AVATAR_KEY) ?? "null") as Partial<SavedAvatar> | null;
    if (!raw || !raw.spec) return null;
    // re-validate: an old or hand-edited entry must never reach the compiler unchecked
    const checked = parseSpec(raw.spec);
    if (!checked.ok) return null;
    return { spec: checked.spec, author: String(raw.author ?? ""), prompt: String(raw.prompt ?? ""), savedAt: Number(raw.savedAt ?? 0) };
  } catch {
    return null;
  }
}

export function saveAvatar(store: KeyValueStore, avatar: SavedAvatar | null): void {
  if (avatar) store.setItem(AVATAR_KEY, JSON.stringify(avatar));
  else store.removeItem(AVATAR_KEY);
}
