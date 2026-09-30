import { applyCommand } from "../src/engine/commands";
import { hashString } from "../src/engine/random";
import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { MemoryStore, PREMIGRATION_KEY, SAVE_KEY, importSave, load, migrateWorld, save } from "../src/store/save";

const T0 = Date.UTC(2026, 8, 24, 12);
const world = () => simulateElapsed(createWorld("Mochi", "malbolge-cat", T0, 5), T0 + R.HATCH_MS);

/** A save exactly as the v1 build wrote it: world without mode/ruleset, checksum over that world. */
function v1SaveText(extra: Record<string, unknown> = {}): string {
  const { mode: _m, rulesetVersion: _r, ...rest } = world();
  const v1 = { ...rest, ...extra, version: 1 };
  return JSON.stringify({ format: "tamagotchia-save", version: 1, savedAt: T0, checksum: hashString(JSON.stringify(v1)), world: v1 });
}

describe("world v2: local/canon marker and ruleset", () => {
  it("new worlds are local by default and record their ruleset", () => {
    expect(world()).toMatchObject({ version: 2, mode: "local", rulesetVersion: R.RULESET_VERSION });
    expect(createWorld("Canonito", "malbolge-cat", T0, 7, "canon").mode).toBe("canon");
  });

  it("commands never change the mode or the ruleset", () => {
    const canon = simulateElapsed(createWorld("Canonito", "malbolge-cat", T0, 7, "canon"), T0 + R.HATCH_MS);
    const after = applyCommand(canon, { id: "c1", kind: "play" }, T0 + R.HATCH_MS + R.HOUR).world;
    expect(after.mode).toBe("canon");
    expect(after.rulesetVersion).toBe(R.RULESET_VERSION);
  });
});

describe("v1 → v2 migration", () => {
  it("loads an old save as a local world and keeps the untouched original for rollback", () => {
    const store = new MemoryStore();
    const original = v1SaveText();
    store.setItem(SAVE_KEY, original);
    const r = load(store);
    expect(r.migratedFrom).toBe(1);
    expect(r.world).toMatchObject({ version: 2, mode: "local", rulesetVersion: R.RULESET_VERSION });
    expect(r.world!.creature).toEqual(world().creature);
    expect(store.getItem(PREMIGRATION_KEY)).toBe(original);
  });

  it("never grants canon, even to a v1 file that claims it", () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, v1SaveText({ mode: "canon", rulesetVersion: "made-up" }));
    expect(load(store).world).toMatchObject({ mode: "local", rulesetVersion: R.RULESET_VERSION });
    expect(migrateWorld({ version: 1, mode: "canon" }).world).toMatchObject({ mode: "local" });
  });

  it("is idempotent and the pre-migration copy is written once, never overwritten", () => {
    const store = new MemoryStore();
    const original = v1SaveText();
    store.setItem(SAVE_KEY, original);
    const first = load(store).world!;
    save(store, first, T0 + 1);
    const second = load(store);
    expect(second.migratedFrom).toBeNull();
    expect(second.world).toEqual(first);
    expect(migrateWorld(first)).toEqual({ world: first, migratedFrom: null });
    store.setItem(SAVE_KEY, v1SaveText({ seq: 999 }));
    load(store);
    expect(store.getItem(PREMIGRATION_KEY)).toBe(original);
  });

  it("an exported v1 file can still be imported", () => {
    expect(importSave(v1SaveText())).toMatchObject({ problem: null, world: { version: 2, mode: "local" } });
  });

  it("a v1 file edited by hand still fails its checksum", () => {
    const tampered = JSON.parse(v1SaveText());
    tampered.world.creature.stats.bond = 100;
    expect(importSave(JSON.stringify(tampered))).toMatchObject({ world: null, problem: "el checksum no coincide" });
  });
});
