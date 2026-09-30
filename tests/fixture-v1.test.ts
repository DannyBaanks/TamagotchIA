/**
 * A real save written by the v1 build (TamagotchIA main @ b7fe4b1: createWorld + 24 hours of
 * care, exportSave). If this file stops loading, players lose their creature.
 */
import { readFileSync } from "node:fs";
import { RULESET_VERSION } from "../src/engine/rules";
import { applyCommand } from "../src/engine/commands";
import { petIdentity } from "../src/life/identity";
import { BACKUP_KEY, MemoryStore, PREMIGRATION_KEY, SAVE_KEY, importSave, load, save } from "../src/store/save";

const V1 = readFileSync(new URL("./fixtures/save-v1.b7fe4b1.json", import.meta.url), "utf8");
const v1World = JSON.parse(V1).world;

describe("real v1 save (b7fe4b1)", () => {
  it("loads, migrates to local v2 and keeps every fact of the creature", () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, V1);
    const r = load(store);
    expect(r).toMatchObject({ source: "save", migratedFrom: 1, problem: null });
    const w = r.world!;
    expect(w).toMatchObject({ version: 2, mode: "local", rulesetVersion: RULESET_VERSION });
    expect(w.creature).toEqual(v1World.creature);
    expect(w.events).toEqual(v1World.events);
    expect(w.memories).toEqual(v1World.memories);
    expect(w.creature.favoriteFood).toBe("fish");
    expect(petIdentity(w).name).toBe("Malbolgato");
  });

  it("round-trips after migration and keeps playing", () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, V1);
    const migrated = load(store).world!;
    const next = applyCommand(migrated, { id: "after-migration", kind: "pet" }, migrated.creature.lastTickAt + 60_000).world;
    save(store, next, next.creature.lastTickAt);
    const again = load(store);
    expect(again).toMatchObject({ source: "save", migratedFrom: null });
    expect(again.world).toEqual(next);
    // the migrated v1 save became the backup; the original stays in the pre-migration slot
    expect(importSave(store.getItem(BACKUP_KEY)!).world).toEqual(migrated);
    expect(store.getItem(PREMIGRATION_KEY)).toBe(V1);
  });

  it("a corrupt main save falls back to a v1 backup, migrating it", () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, V1.slice(0, 200)); // cut mid-write
    store.setItem(BACKUP_KEY, V1);
    const r = load(store);
    expect(r).toMatchObject({ source: "backup", migratedFrom: 1, problem: "el archivo no es JSON" });
    expect(r.world!.mode).toBe("local");
  });

  it("garbage never loads and never crashes", () => {
    for (const text of ["", "null", "{}", "[]", '{"format":"tamagotchia-save","version":1}', V1.replace('"version":1', '"version":7')]) {
      expect(() => importSave(text)).not.toThrow();
      expect(importSave(text).world).toBeNull();
    }
  });
});
