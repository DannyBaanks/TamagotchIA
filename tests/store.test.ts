import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { BACKUP_KEY, MemoryStore, SAVE_KEY, exportSave, importSave, load, save, serialize } from "../src/store/save";
import { loadSecret, loadSettings, saveSecret, saveSettings } from "../src/store/settings";

const T0 = Date.UTC(2026, 8, 24, 12);
const world = () => simulateElapsed(createWorld("Mochi", "malbolge-cat", T0, 5), T0 + R.HATCH_MS);

describe("save and load", () => {
  it("round-trips a world", () => {
    const store = new MemoryStore();
    save(store, world(), T0);
    expect(load(store)).toMatchObject({ source: "save", world: world() });
  });

  it("a corrupt save falls back to the previous good one", () => {
    const store = new MemoryStore();
    const first = world();
    save(store, first, T0);
    save(store, simulateElapsed(first, T0 + R.HOUR), T0 + R.HOUR);
    store.setItem(SAVE_KEY, store.getItem(SAVE_KEY)!.slice(0, 40)); // truncated mid-write
    const r = load(store);
    expect(r.source).toBe("backup");
    expect(r.world).toEqual(first);
    expect(r.problem).toBe("el archivo no es JSON");
  });

  it("a broken backup is never promoted over it", () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, "garbage");
    store.setItem(BACKUP_KEY, serialize(world(), T0));
    save(store, world(), T0 + 1);
    expect(load(store).source).toBe("save");
    expect(store.getItem(BACKUP_KEY)).toBe(serialize(world(), T0));
  });

  it("rejects a hand-edited save (checksum) and impossible stats", () => {
    const tampered = JSON.parse(serialize(world(), T0));
    tampered.world.creature.stats.bond = 100;
    expect(importSave(JSON.stringify(tampered)).problem).toBe("el checksum no coincide");

    const w = world();
    w.creature.stats.hunger = 250;
    expect(importSave(serialize(w, T0)).problem).toBe("los datos no tienen la forma esperada");
  });

  it("with nothing usable it starts over instead of crashing", () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, "{}");
    expect(load(store)).toMatchObject({ world: null, source: "none" });
  });
});

describe("the API key", () => {
  it("never appears in a save or an export", () => {
    const store = new MemoryStore();
    saveSettings(store, { enabled: true, baseUrl: "https://x.test/v1", model: "m", timeoutMs: 5000 });
    saveSecret(store, "sk-live-do-not-leak");
    save(store, world(), T0);
    expect(store.getItem(SAVE_KEY)).not.toContain("sk-live-do-not-leak");
    expect(exportSave(load(store).world!, T0)).not.toContain("sk-live-do-not-leak");
    expect(loadSecret(store)).toBe("sk-live-do-not-leak");
    expect(loadSettings(store)).toMatchObject({ enabled: true, model: "m" });
  });

  it("clearing it removes it", () => {
    const store = new MemoryStore();
    saveSecret(store, "k");
    saveSecret(store, "");
    expect(loadSecret(store)).toBe("");
  });
});
