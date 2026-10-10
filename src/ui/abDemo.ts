/**
 * The A/B scene: two creatures, same species and same seed, two different upbringings.
 *
 * This is the experiment the whole idea rests on, so it is built to be honest:
 *  - everything runs on a temporary world (`simulateElapsed` + `applyCommand` only);
 *  - the player's real save is never touched: this module has no store and no access to one;
 *  - the timestamps are a fixed demo clock, shown as such, not passed off as real days;
 *  - the difference comes from the events, and each trait quotes the real count behind it.
 */
import { applyCommand, type Command } from "../engine/commands";
import { dominantReasons, projectCareFingerprint } from "../engine/fingerprint";
import * as R from "../engine/rules";
import { simulateElapsed } from "../engine/simulation";
import type { World } from "../engine/types";
import { createWorld } from "../engine/world";

/** The fixed clock of the demo. Nothing here reads the real time. */
export const DEMO_T0 = Date.UTC(2026, 9, 10, 12, 0, 0);
export const DEMO_SEED = 7;

export interface DemoCreature {
  title: string;
  blurb: string;
  world: World;
}

export interface DemoComparison {
  /** Shown in the UI, so nobody mistakes the demo for real elapsed days. */
  clockNote: string;
  a: DemoCreature;
  b: DemoCreature;
}

let counter = 0;
const step = (kind: string, extra: Record<string, unknown> = {}): Command =>
  ({ id: `demo-${++counter}`, kind, ...extra }) as Command;

function born(): World {
  return simulateElapsed(createWorld("Demo", "claw-crab", DEMO_T0, DEMO_SEED), DEMO_T0 + R.HATCH_MS);
}

/** A = care and rest: mimos, clean, sleep. */
export function upbringingA(): World {
  let world = born();
  for (let session = 0; session < 3; session++) {
    const base = DEMO_T0 + R.HATCH_MS + session * 6 * R.HOUR;
    world = applyCommand(world, step("pet"), base + R.MINUTE).world;
    world = applyCommand(world, step("pet"), base + 2 * R.MINUTE).world;
    world = applyCommand(world, step("clean"), base + 3 * R.MINUTE).world;
    world = applyCommand(world, step("sleep"), base + 4 * R.MINUTE).world;
    world = applyCommand(world, step("wake"), base + 3 * R.HOUR).world;
  }
  return world;
}

/** B = play and explore: explore, minigame, play. */
export function upbringingB(): World {
  let world = born();
  for (let session = 0; session < 3; session++) {
    const base = DEMO_T0 + R.HATCH_MS + session * 6 * R.HOUR;
    world = applyCommand(world, step("explore"), base + R.MINUTE).world;
    world = applyCommand(world, step("minigame", { score: 3 }), base + 2 * R.MINUTE).world;
    world = applyCommand(world, step("play"), base + 3 * R.MINUTE).world;
    world = applyCommand(world, step("sleep"), base + 4 * R.MINUTE).world;
    world = applyCommand(world, step("wake"), base + 2 * R.HOUR).world;
  }
  return world;
}

/** Both creatures, with the traits each upbringing produced. */
export function buildComparison(): DemoComparison {
  return {
    clockNote: "Reloj de demostración: 3 sesiones de cuidado simuladas, no días reales.",
    a: {
      title: "Criada con cariño",
      blurb: "Mimos, baños y siestas. Nadie la dejó sola.",
      world: upbringingA(),
    },
    b: {
      title: "Criada con aventuras",
      blurb: "Salidas a explorar, juegos y minijuegos.",
      world: upbringingB(),
    },
  };
}

/** The traits of one demo creature, already phrased for a person. */
export function demoTraits(creature: DemoCreature) {
  return dominantReasons(projectCareFingerprint(creature.world));
}
