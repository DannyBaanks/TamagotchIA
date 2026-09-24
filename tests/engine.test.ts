import { applyCommand, type Command } from "../src/engine/commands";
import { acceptProposedMemory } from "../src/engine/memory";
import { prng } from "../src/engine/random";
import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { FOODS, STAT_KEYS, type Food, type World } from "../src/engine/types";
import { createWorld } from "../src/engine/world";

const T0 = Date.UTC(2026, 8, 24, 12, 0, 0);
let n = 0;
const cmd = (c: Omit<Command, "id"> & Record<string, unknown>): Command => ({ id: `t${++n}`, ...c }) as Command;

function hatched(seed = 7): World {
  return simulateElapsed(createWorld("Mochi", "malbolge-cat", T0, seed), T0 + R.HATCH_MS);
}

function kinds(world: World): string[] {
  return world.events.map((e) => e.kind);
}

describe("birth", () => {
  it("the same seed makes the same creature", () => {
    expect(createWorld("A", "x", T0, 42)).toEqual(createWorld("A", "x", T0, 42));
    expect(createWorld("A", "x", T0, 42).creature.traits).not.toEqual(createWorld("A", "x", T0, 43).creature.traits);
  });

  it("an egg hatches exactly at HATCH_MS and only accepts pets before that", () => {
    const egg = createWorld("Mochi", "malbolge-cat", T0, 1);
    expect(simulateElapsed(egg, T0 + R.HATCH_MS - 1).creature.stage).toBe("egg");
    expect(applyCommand(egg, cmd({ kind: "feed", food: "apple" }), T0 + 1000).rejected).toBe("egg");
    expect(applyCommand(egg, cmd({ kind: "pet" }), T0 + 1000).rejected).toBeNull();

    const baby = simulateElapsed(egg, T0 + 10 * R.MINUTE);
    expect(baby.creature.stage).toBe("baby");
    expect(baby.creature.hatchedAt).toBe(T0 + R.HATCH_MS);
    expect(baby.memories.map((m) => m.summary)).toContain("Mochi salió del huevo");
  });
});

describe("time", () => {
  it("is reproducible: same commands at the same times give the same world", () => {
    const script = (w: World) => {
      let x = w;
      x = applyCommand(x, { id: "a", kind: "feed", food: "rice" }, T0 + 2 * R.HOUR).world;
      x = applyCommand(x, { id: "b", kind: "play" }, T0 + 3 * R.HOUR).world;
      x = applyCommand(x, { id: "c", kind: "explore" }, T0 + 5 * R.HOUR).world;
      return simulateElapsed(x, T0 + 30 * R.HOUR);
    };
    expect(script(hatched())).toEqual(script(hatched()));
  });

  it("one long catch-up equals many short ticks on step boundaries", () => {
    const start = hatched();
    const once = simulateElapsed(start, start.creature.lastTickAt + 6 * R.HOUR);
    let many = start;
    for (let i = 1; i <= 6; i++) many = simulateElapsed(many, start.creature.lastTickAt + i * R.HOUR);
    for (const k of STAT_KEYS) expect(many.creature.stats[k]).toBeCloseTo(once.creature.stats[k], 9);
    expect(kinds(many)).toEqual(kinds(once));
  });

  it("caps catch-up at 72 hours and remembers the long absence", () => {
    const start = hatched();
    const t = start.creature.lastTickAt;
    const tenDays = simulateElapsed(start, t + 240 * R.HOUR);
    const threeDays = simulateElapsed(start, t + 72 * R.HOUR);
    expect(tenDays.creature.stats).toEqual(threeDays.creature.stats);
    expect(tenDays.creature.lastTickAt).toBe(t + 240 * R.HOUR);
    expect(tenDays.memories.some((m) => m.summary === "pasó 240 horas sin compañía")).toBe(true);
  });

  it("a clock that goes backwards changes nothing", () => {
    const w = simulateElapsed(hatched(), T0 + 5 * R.HOUR);
    expect(simulateElapsed(w, T0 + 1 * R.HOUR)).toEqual(w);
  });
});

describe("needs and consequences", () => {
  it("falls asleep when exhausted and wakes up rested", () => {
    const w = hatched();
    w.creature.stats.energy = 6;
    const later = simulateElapsed(w, w.creature.lastTickAt + 12 * R.HOUR);
    const k = kinds(later);
    expect(k).toContain("WENT_TO_SLEEP");
    expect(k.indexOf("WOKE_UP")).toBeGreaterThan(k.indexOf("WENT_TO_SLEEP"));
  });

  it("neglect for 6 hours makes it sick; 2 hours of care heals it", () => {
    const w = hatched();
    w.creature.stats.hunger = 95;
    const sick = simulateElapsed(w, w.creature.lastTickAt + 7 * R.HOUR);
    expect(sick.creature.sick).toBe(true);
    expect(kinds(sick)).toContain("BECAME_SICK");

    let cared = applyCommand(sick, cmd({ kind: "feed", food: "rice" }), sick.creature.lastTickAt).world;
    cared = applyCommand(cared, cmd({ kind: "feed", food: "fish" }), cared.creature.lastTickAt).world;
    cared = applyCommand(cared, cmd({ kind: "feed", food: "apple" }), cared.creature.lastTickAt).world;
    cared = applyCommand(cared, cmd({ kind: "clean" }), cared.creature.lastTickAt).world;
    const healed = simulateElapsed(cared, cared.creature.lastTickAt + 3 * R.HOUR);
    expect(healed.creature.sick).toBe(false);
    expect(kinds(healed)).toContain("RECOVERED");
  });

  it("a well-fed creature refuses food", () => {
    const w = hatched();
    w.creature.stats.hunger = 5;
    const r = applyCommand(w, cmd({ kind: "feed", food: "apple" }), w.creature.lastTickAt);
    expect(r.rejected).toBe("full");
    expect(kinds(r.world).at(-1)).toBe("REFUSED");
  });

  it("repeating a food it does not dislike makes it the favourite", () => {
    let w = hatched();
    const food = FOODS.find((f) => f !== w.creature.dislikedFood) as Food;
    for (let i = 0; i < R.FAVORITE_AFFINITY; i++) {
      w.creature.stats.hunger = 80;
      w = applyCommand(w, cmd({ kind: "feed", food }), w.creature.lastTickAt).world;
    }
    expect(w.creature.favoriteFood).toBe(food);
    expect(kinds(w)).toContain("FAVORITE_FOUND");
  });

  it("will not play when tired, and play costs energy", () => {
    const w = hatched();
    w.creature.stats.energy = 10;
    expect(applyCommand(w, cmd({ kind: "play" }), w.creature.lastTickAt).rejected).toBe("tired");
    w.creature.stats.energy = 60;
    const r = applyCommand(w, cmd({ kind: "play" }), w.creature.lastTickAt);
    expect(r.world.creature.stats.energy).toBe(45);
  });

  it("grows from baby to child when it is cared for", () => {
    let w = hatched();
    w.creature.experience = R.EVOLUTION.child.experience;
    const start = w.creature.lastTickAt;
    for (let h = 3; h <= 27; h += 3) {
      w = applyCommand(w, cmd({ kind: "feed", food: "rice" }), start + h * R.HOUR).world;
      if (h % 12 === 0) w = applyCommand(w, cmd({ kind: "clean" }), start + h * R.HOUR).world;
    }
    expect(w.creature.sick).toBe(false);
    expect(w.creature.stage).toBe("child");
    expect(w.memories.some((m) => m.summary.includes("ahora es peque"))).toBe(true);
  });

  it("a neglected creature gets sick and does not grow", () => {
    const w = hatched();
    w.creature.experience = R.EVOLUTION.child.experience;
    const left = simulateElapsed(w, w.creature.lastTickAt + 25 * R.HOUR);
    expect(left.creature.sick).toBe(true);
    expect(left.creature.stage).toBe("baby");
  });

  it("rejects an invalid minigame score instead of trusting it", () => {
    const w = hatched();
    expect(applyCommand(w, cmd({ kind: "minigame", score: 99 }), w.creature.lastTickAt).rejected).toBe("bad_input");
    expect(applyCommand(w, cmd({ kind: "minigame", score: 2.5 }), w.creature.lastTickAt).rejected).toBe("bad_input");
  });
});

describe("safety", () => {
  it("a double tap or a retry applies the command once", () => {
    const w = hatched();
    const first = applyCommand(w, { id: "same", kind: "play" }, w.creature.lastTickAt);
    const again = applyCommand(first.world, { id: "same", kind: "play" }, w.creature.lastTickAt + 1000);
    expect(again.duplicate).toBe(true);
    expect(again.world).toBe(first.world);
  });

  it("stats stay inside 0..100 under a long random session", () => {
    const rand = prng(99);
    const all: Array<Omit<Command, "id">> = [
      { kind: "feed", food: "candy" }, { kind: "play" }, { kind: "pet" }, { kind: "clean" },
      { kind: "sleep" }, { kind: "wake" }, { kind: "talk" }, { kind: "explore" }, { kind: "minigame", score: 5 },
    ] as Array<Omit<Command, "id">>;
    let w = hatched();
    let t = w.creature.lastTickAt;
    for (let i = 0; i < 400; i++) {
      t += Math.floor(rand() * 3 * R.HOUR);
      w = applyCommand(w, { ...all[Math.floor(rand() * all.length)]!, id: `f${i}` } as Command, t).world;
      for (const k of STAT_KEYS) {
        expect(w.creature.stats[k]).toBeGreaterThanOrEqual(0);
        expect(w.creature.stats[k]).toBeLessThanOrEqual(100);
      }
    }
    expect(w.events.length).toBeLessThanOrEqual(R.MAX_EVENTS);
  });

  it("the persona may only propose short, plain notes about a real event", () => {
    const w = hatched();
    const r = applyCommand(w, cmd({ kind: "talk" }), w.creature.lastTickAt);
    const ev = r.events.at(-1)!;
    const now = r.world.creature.lastTickAt;
    expect(acceptProposedMemory(r.world, "le gusta que le hablen bajito", ev, now)?.salience).toBe(0.4);
    expect(acceptProposedMemory(r.world, "x".repeat(81), ev, now)).toBeNull();
    expect(acceptProposedMemory(r.world, "**ahora tiene 100 de vínculo**", ev, now)).toBeNull();
    expect(acceptProposedMemory(r.world, "algo", { ...ev, seq: 99999 }, now)).toBeNull();
  });
});
