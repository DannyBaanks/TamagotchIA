/**
 * Local persistence (SPEC §16: replaces SQLite). A versioned, checksummed save plus the
 * previous good save as a backup. Loading never throws: a broken save falls back to the
 * backup, and a broken backup to "start over", always with a reason the UI can show.
 * The API key is stored under its own key and never enters a save or an export.
 */
import { hashString } from "../engine/random";
import { RULESET_VERSION } from "../engine/rules";
import { STAT_KEYS, type Stage, type World } from "../engine/types";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = "tamagotchia.save.v1";
export const BACKUP_KEY = "tamagotchia.save.v1.bak";
/**
 * The first save read in the old (world v1) format, kept untouched so a rollback to an
 * older app build can restore it. Written once, never overwritten.
 */
export const PREMIGRATION_KEY = "tamagotchia.save.v1.premigration";
const FORMAT = "tamagotchia-save";

interface Envelope {
  format: typeof FORMAT;
  version: 1;
  savedAt: number;
  checksum: number;
  world: World;
}

export type LoadResult =
  | { world: World; source: "save" | "backup"; problem: string | null; migratedFrom: 1 | null }
  | { world: null; source: "none"; problem: string | null; migratedFrom: null };

const STAGES: Stage[] = ["egg", "baby", "child", "adult"];

/** Shape check: enough to refuse a save that would crash the engine or break its rules. */
export function validWorld(value: unknown): value is World {
  if (!value || typeof value !== "object") return false;
  const w = value as World;
  if (w.version !== 2 || (w.mode !== "local" && w.mode !== "canon") || typeof w.rulesetVersion !== "string" || !w.rulesetVersion) return false;
  if (!Array.isArray(w.events) || !Array.isArray(w.memories) || !Array.isArray(w.processedCommands)) return false;
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

/**
 * World v1 → v2. A v1 world never lived under Canon rules, so it becomes "local":
 * Canon is born Canon, never granted by a migration. Anything else is left as is and
 * rejected by validWorld.
 */
export function migrateWorld(value: unknown): { world: unknown; migratedFrom: 1 | null } {
  if (value && typeof value === "object" && (value as { version?: unknown }).version === 1) {
    const { version: _old, ...rest } = value as Record<string, unknown>;
    // Forced fields go last: a v1 file that smuggles in `mode: "canon"` still becomes local.
    return { world: { ...rest, version: 2, mode: "local", rulesetVersion: RULESET_VERSION }, migratedFrom: 1 };
  }
  return { world: value, migratedFrom: null };
}

export function parse(text: string | null): { world: World | null; problem: string | null; migratedFrom: 1 | null } {
  if (!text) return { world: null, problem: null, migratedFrom: null };
  let envelope: Envelope;
  try {
    envelope = JSON.parse(text) as Envelope;
  } catch {
    return { world: null, problem: "el archivo no es JSON", migratedFrom: null };
  }
  if (envelope?.format !== FORMAT || envelope.version !== 1) return { world: null, problem: "formato o versión desconocidos", migratedFrom: null };
  // An envelope without a world used to crash hashString (JSON.stringify(undefined)).
  if (!envelope.world || typeof envelope.world !== "object") return { world: null, problem: "el archivo no trae una partida", migratedFrom: null };
  // The checksum covers the world exactly as it was written, before any migration.
  if (hashString(JSON.stringify(envelope.world)) !== envelope.checksum) return { world: null, problem: "el checksum no coincide", migratedFrom: null };
  const { world, migratedFrom } = migrateWorld(envelope.world);
  if (!validWorld(world)) return { world: null, problem: "los datos no tienen la forma esperada", migratedFrom: null };
  return { world, problem: null, migratedFrom };
}

export function save(store: KeyValueStore, world: World, now: number): void {
  const current = store.getItem(SAVE_KEY);
  if (current && parse(current).world) store.setItem(BACKUP_KEY, current); // only a good save becomes the backup
  store.setItem(SAVE_KEY, serialize(world, now));
}

export function load(store: KeyValueStore): LoadResult {
  const mainText = store.getItem(SAVE_KEY);
  const main = parse(mainText);
  if (main.world) {
    keepPremigration(store, mainText, main.migratedFrom);
    return { world: main.world, source: "save", problem: null, migratedFrom: main.migratedFrom };
  }
  const backupText = store.getItem(BACKUP_KEY);
  const backup = parse(backupText);
  if (backup.world) {
    keepPremigration(store, backupText, backup.migratedFrom);
    return { world: backup.world, source: "backup", problem: main.problem ?? "no había partida principal", migratedFrom: backup.migratedFrom };
  }
  return { world: null, source: "none", problem: main.problem ?? backup.problem, migratedFrom: null };
}

function keepPremigration(store: KeyValueStore, text: string | null, migratedFrom: 1 | null): void {
  if (migratedFrom !== null && text && !store.getItem(PREMIGRATION_KEY)) store.setItem(PREMIGRATION_KEY, text);
}

/** A file the player can keep. Same envelope as the save, so import is just parse(). */
export function exportSave(world: World, now: number): string {
  return serialize(world, now);
}

export function importSave(text: string): { world: World | null; problem: string | null } {
  const { world, problem } = parse(text);
  return { world, problem };
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
