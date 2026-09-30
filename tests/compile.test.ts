import { applyCommand } from "../src/engine/commands";
import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { copyWorld, createWorld } from "../src/engine/world";
import { compileContextBox } from "../src/persona/compile";
import { validateContextBox } from "../src/persona/contextBox";

const T0 = Date.UTC(2026, 8, 24, 12);

/** A creature with a few days of life: memories, a favourite food, lots of events. */
function lived() {
  let now = T0 + R.HATCH_MS;
  let w = simulateElapsed(createWorld("Malbolgato", "malbolge-cat", T0, 42), now);
  const cmds: any[] = [{ kind: "feed", food: "fish" }, { kind: "play" }, { kind: "pet" }, { kind: "clean" }, { kind: "talk" }, { kind: "explore" }];
  for (let i = 0; i < 60; i++) {
    now += R.HOUR;
    w = applyCommand(w, { id: `l${i}`, ...cmds[i % cmds.length] } as any, now).world;
  }
  return { world: w, now };
}

describe("context compiler", () => {
  it("produces a valid box with the full picture when the budget allows", () => {
    const { world, now } = lived();
    const r = compileContextBox({ world, now, budgetTokens: 4000 });
    expect(validateContextBox(r.box)).toMatchObject({ ok: true });
    expect(r.fits).toBe(true);
    expect(r.dropped).toEqual([]);
    expect(r.box.identity).toMatchObject({ name: "Malbolgato", species: "malbolge-cat" });
    expect(r.box.preferences_and_habits).toMatchObject({ favorite_food: "fish" });
    expect(r.box.recent_events!.length).toBeGreaterThan(0);
    expect(r.box.episodic_memories!.length).toBeGreaterThan(0);
  });

  it("never exceeds the budget, and drops in priority order", () => {
    const { world, now } = lived();
    const full = compileContextBox({ world, now, budgetTokens: 100_000 });
    for (const budget of [full.tokens - 1, 600, 400, 300]) {
      const r = compileContextBox({ world, now, budgetTokens: budget });
      if (r.fits) expect(r.tokens).toBeLessThanOrEqual(budget);
      // order: every recent event goes before preferences, before relationship, before memories
      const firstPref = r.dropped.indexOf("preferences_and_habits");
      const firstRel = r.dropped.indexOf("relationship");
      const firstMem = r.dropped.indexOf("episodic_memory");
      if (firstPref >= 0) expect(r.box.recent_events ?? []).toHaveLength(0);
      if (firstRel >= 0) expect(firstRel).toBeGreaterThan(firstPref);
      if (firstMem >= 0) expect(firstMem).toBeGreaterThan(firstRel);
    }
  });

  it("keeps the contract, identity and current state even when nothing else fits", () => {
    const { world, now } = lived();
    const r = compileContextBox({ world, now, budgetTokens: 1 });
    expect(r.fits).toBe(false);
    expect(r.box.guardrails.may_modify_game_state).toBe(false);
    expect(r.box.identity).toMatchObject({ name: "Malbolgato" });
    expect(r.box.canonical_state).toMatchObject({ hunger: Math.round(world.creature.stats.hunger) });
    expect(r.box.recent_events).toBeUndefined();
  });

  it("keeps the most important memories longest", () => {
    const { world, now } = lived();
    const full = compileContextBox({ world, now, budgetTokens: 100_000 });
    const summaries = full.box.episodic_memories!.map((m: any) => m.summary);
    // milestones (hatching, growing up: salience 1) come before everything else
    expect(summaries[0]).toMatch(/salió del huevo|creció/);
    const trimmed = compileContextBox({ world, now, budgetTokens: full.tokens - 60 }).box.episodic_memories ?? [];
    expect(summaries.slice(0, trimmed.length)).toEqual(trimmed.map((m: any) => m.summary));
  });

  it("is deterministic: same world, clock and budget give the same box", () => {
    const { world, now } = lived();
    const a = JSON.stringify(compileContextBox({ world, now, budgetTokens: 500 }).box);
    const b = JSON.stringify(compileContextBox({ world: copyWorld(world), now, budgetTokens: 500 }).box);
    expect(a).toBe(b);
  });

  it("orders keys from stable to volatile so a prompt prefix can be reused", () => {
    const { world, now } = lived();
    const keys = Object.keys(compileContextBox({ world, now, budgetTokens: 100_000, model: { mode: "local" } }).box);
    expect(keys.slice(0, 3)).toEqual(["schema", "guardrails", "identity"]);
    expect(keys.indexOf("canonical_state")).toBeGreaterThan(keys.indexOf("episodic_memories"));
    expect(keys.at(-1)).toBe("generated_at");
    // two moments of the same life share the stable prefix
    const later = applyCommand(world, { id: "later", kind: "pet" }, now + R.MINUTE * 5).world;
    const a = JSON.stringify(compileContextBox({ world, now, budgetTokens: 100_000 }).box);
    const b = JSON.stringify(compileContextBox({ world: later, now: now + R.MINUTE * 5, budgetTokens: 100_000 }).box);
    const prefix = a.slice(0, a.indexOf('"preferences_and_habits"'));
    expect(b.startsWith(prefix)).toBe(true);
  });

  it("never lets a credential in, even when a proposed memory carried one", () => {
    const { world, now } = lived();
    const w = copyWorld(world);
    w.memories.push({ id: "m-said-x", at: now, category: "said", summary: "mi clave sk-or-v1-abcdefghijklmnopqrstuv", salience: 0.4, expiresAt: now + R.HOUR });
    w.creature.name = "nvapi-ABCDEFGHIJKLMNOPQRSTUV";
    const r = compileContextBox({ world: w, now, budgetTokens: 100_000 });
    expect(JSON.stringify(r.box)).not.toMatch(/sk-or-|nvapi-/);
    expect(validateContextBox(r.box)).toMatchObject({ ok: true });
  });

  it("does not touch the world", () => {
    const { world, now } = lived();
    const before = JSON.stringify(world);
    const r = compileContextBox({ world, now, budgetTokens: 300 });
    (r.box.identity as any).name = "otro";
    expect(JSON.stringify(world)).toBe(before);
  });
});
