/**
 * Local persistence (SPEC §16: replaces SQLite). A versioned, checksummed save plus the
 * previous good save as a backup. Loading never throws: a broken save falls back to the
 * backup, and a broken backup to "start over", always with a reason the UI can show.
 * The API key is stored under its own key and never enters a save or an export.
 */
import { hashString } from "../engine/random";
import { STAT_KEYS, type Stage, type World } from "../engine/types";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = "tamagotchia.save.v1";
export const BACKUP_KEY = "tamagotchia.save.v1.bak";
const FORMAT = "tamagotchia-save";

interface Envelope {
  format: typeof FORMAT;
  version: 1;
  savedAt: number;
  checksum: number;
  world: World;
}

export type LoadResult =
  | { world: World; source: "save" | "backup"; problem: string | null }
  | { world: null; source: "none"; problem: string | null };

const STAGES: Stage[] = ["egg", "baby", "child", "adult"];

/** Shape check: enough to refuse a save that would crash the engine or break its rules. */
export function validWorld(value: unknown): value is World {
  if (!value || typeof value !== "object") return false;
  const w = value as World;
  if (w.version !== 1 || !Array.isArray(w.events) || !Array.isArray(w.memories) || !Array.isArray(w.processedCommands)) return false;
  if (typeof w.seq !== "number" || !w.creature || typeof w.creature !== "object") return false;
  const c = w.creature;
  if (typeof c.name !== "string" || typeof c.lastTickAt !== "number" || !Number.isFinite(c.lastTickAt)) return false;
  if (!STAGES.includes(c.stage)) return false;
  return STAT_KEYS.every((k) => typeof c.stats?.[k] === "number" && c.stats[k] >= 0 && c.stats[k] <= 100);
}

export function serialize(world: World, now: number): string {
  const envelope: Envelope = { format: FORMAT, version: 1, savedAt: now, checksum: hashString(JSON.stringify(world)), world };
  return JSON.stringify(envelope);
}

export function parse(text: string | null): { world: World | null; problem: string | null } {
  if (!text) return { world: null, problem: null };
  let envelope: Envelope;
  try {
    envelope = JSON.parse(text) as Envelope;
  } catch {
    return { world: null, problem: "el archivo no es JSON" };
  }
  if (envelope?.format !== FORMAT || envelope.version !== 1) return { world: null, problem: "formato o versión desconocidos" };
  if (hashString(JSON.stringify(envelope.world)) !== envelope.checksum) return { world: null, problem: "el checksum no coincide" };
  if (!validWorld(envelope.world)) return { world: null, problem: "los datos no tienen la forma esperada" };
  return { world: envelope.world, problem: null };
}

export function save(store: KeyValueStore, world: World, now: number): void {
  const current = store.getItem(SAVE_KEY);
  if (current && parse(current).world) store.setItem(BACKUP_KEY, current); // only a good save becomes the backup
  store.setItem(SAVE_KEY, serialize(world, now));
}

export function load(store: KeyValueStore): LoadResult {
  const main = parse(store.getItem(SAVE_KEY));
  if (main.world) return { world: main.world, source: "save", problem: null };
  const backup = parse(store.getItem(BACKUP_KEY));
  if (backup.world) return { world: backup.world, source: "backup", problem: main.problem ?? "no había partida principal" };
  return { world: null, source: "none", problem: main.problem ?? backup.problem };
}

/** A file the player can keep. Same envelope as the save, so import is just parse(). */
export function exportSave(world: World, now: number): string {
  return serialize(world, now);
}

export function importSave(text: string): { world: World | null; problem: string | null } {
  return parse(text);
}

export function wipe(store: KeyValueStore): void {
  store.removeItem(SAVE_KEY);
  store.removeItem(BACKUP_KEY);
}

/** In-memory store for tests and for browsers where localStorage is blocked. */
export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** localStorage when it works, memory when it throws (private mode, blocked storage). */
export function browserStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const probe = "tamagotchia.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return { store: window.localStorage, persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}
