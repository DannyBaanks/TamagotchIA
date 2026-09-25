/**
 * The engine is pure, so it can look ahead: simulate forward from a copy and report when
 * each need will first cross its alert line. Nothing here touches the real world.
 * Used to show "next alert at…" today, and to schedule native local notifications later.
 */
import { conditions, type Condition } from "./derived";
import * as R from "./rules";
import { simulateElapsed } from "./simulation";
import type { Creature, World } from "./types";

export type AlertKind = "hatch" | "hungry" | "dirty" | "sick" | "exhausted" | "lonely" | "awake";

export interface Forecast {
  kind: AlertKind;
  at: number;
}

/** When a creature deserves an alert. Stricter than the on-screen hints, so alerts stay rare. */
export function alertConditions(c: Creature): Set<AlertKind> {
  const out = new Set<AlertKind>();
  if (c.stage === "egg") return out;
  const cond: Condition[] = conditions(c);
  if (c.sick) out.add("sick");
  if (c.stats.hunger >= 75) out.add("hungry");
  if (c.stats.cleanliness <= 20) out.add("dirty");
  if (!c.asleep && c.stats.energy <= 12) out.add("exhausted");
  if (c.stats.mood <= 25 && !c.sick && !cond.includes("hungry")) out.add("lonely");
  return out;
}

/**
 * First moment within `horizonMs` at which each alert becomes true that is not already
 * true now. "hatch" and "awake" are transitions (egg → baby, asleep → awake), not states.
 */
export function forecast(world: World, now: number, horizonMs = 24 * R.HOUR): Forecast[] {
  // events and memories never feed back into the rules, so drop them: a cheaper copy
  let w: World = { ...world, events: [], memories: [], processedCommands: [] };
  w = simulateElapsed(w, now);
  const start = alertConditions(w.creature);
  const wasEgg = w.creature.stage === "egg";
  let asleep = w.creature.asleep;
  const found = new Map<AlertKind, number>();
  for (let t = now + R.STEP_MS; t <= now + horizonMs; t += R.STEP_MS) {
    w = simulateElapsed(w, t);
    if (wasEgg && w.creature.stage !== "egg" && !found.has("hatch")) found.set("hatch", w.creature.hatchedAt ?? t);
    if (asleep && !w.creature.asleep && !found.has("awake")) found.set("awake", t);
    asleep = w.creature.asleep;
    for (const kind of alertConditions(w.creature)) {
      if (!start.has(kind) && !found.has(kind)) found.set(kind, t);
    }
  }
  return [...found].map(([kind, at]) => ({ kind, at })).sort((a, b) => a.at - b.at);
}
