import { applyCommand } from "../src/engine/commands";
import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { petIdentity } from "../src/life/identity";

const T0 = Date.UTC(2026, 8, 24, 12);
const hatched = () => simulateElapsed(createWorld("Malbolgato", "malbolge-cat", T0, 42), T0 + R.HATCH_MS);

describe("PetIdentity", () => {
  it("is derived from the save and carries nothing about a model or provider", () => {
    const id = petIdentity(hatched());
    expect(Object.keys(id).sort()).toEqual(["bornAt", "hatchedAt", "id", "name", "seed", "species", "stage", "traits"]);
    expect(JSON.stringify(id)).not.toMatch(/model|provider|prompt|endpoint|baseUrl|apiKey|gguf/i);
  });

  it("stays the same creature while its state changes", () => {
    const before = hatched();
    const after = applyCommand(before, { id: "c1", kind: "feed", food: "fish" }, T0 + R.HATCH_MS + R.HOUR).world;
    const a = petIdentity(before);
    const b = petIdentity(after);
    expect(b.id).toBe(a.id);
    expect(b.traits).toEqual(a.traits);
    expect(b.bornAt).toBe(a.bornAt);
  });

  it("is a copy: writing to it cannot reach the world", () => {
    const world = hatched();
    const id = petIdentity(world);
    id.traits.sarcasm = 99;
    id.name = "otro";
    expect(world.creature.traits.sarcasm).not.toBe(99);
    expect(world.creature.name).toBe("Malbolgato");
  });
});

import { lifeLog } from "../src/life/lifelog";
import { MAX_EVENTS, RULESET_VERSION } from "../src/engine/rules";

describe("LifeLog", () => {
  it("records engine events in order, each with its provenance and ruleset", () => {
    const world = applyCommand(hatched(), { id: "c1", kind: "feed", food: "fish" }, T0 + R.HATCH_MS + R.HOUR).world;
    const log = lifeLog(world);
    expect(log.creatureId).toBe(world.creature.id);
    expect(log.entries.map((e) => e.kind)).toEqual(world.events.map((e) => e.kind));
    expect(log.entries.every((e) => e.provenance.source === "engine" && e.provenance.ruleset === RULESET_VERSION)).toBe(true);
    const seqs = log.entries.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(log.droppedBefore).toBeNull();
  });

  it("says when old events were trimmed instead of pretending to be the whole life", () => {
    let world = hatched();
    let now = T0 + R.HATCH_MS;
    for (let i = 0; i < MAX_EVENTS + 20; i++) {
      now += R.MINUTE;
      world = applyCommand(world, { id: `t${i}`, kind: "talk" }, now).world;
    }
    const log = lifeLog(world);
    expect(log.entries.length).toBe(MAX_EVENTS);
    expect(log.droppedBefore).toBe(log.entries[0]!.seq);
    expect(log.droppedBefore).toBeGreaterThan(1);
  });

  it("is a copy: editing an entry cannot reach the world", () => {
    const world = hatched();
    const log = lifeLog(world);
    log.entries[0]!.payload.name = "otro";
    expect(world.events[0]!.payload.name).toBe("Malbolgato");
  });
});
