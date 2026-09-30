/**
 * LifeLog: the creature's history as the engine wrote it, with provenance. Only engine
 * events go in; the persona can propose a memory but never an entry here.
 *
 * The world keeps the last MAX_EVENTS events, so this is the retained window, not the
 * full life. `droppedBefore` says so explicitly instead of pretending to be complete.
 */
import { RULESET_VERSION } from "../engine/rules";
import type { GameEvent, World } from "../engine/types";

export interface Provenance {
  /** Who wrote the fact. Engine events are the only source today. */
  source: "engine";
  ruleset: string;
}

export interface LifeLogEntry {
  seq: number;
  at: number;
  kind: GameEvent["kind"];
  payload: GameEvent["payload"];
  provenance: Provenance;
}

export interface LifeLog {
  creatureId: string;
  entries: LifeLogEntry[];
  /** Events with seq below this were trimmed from the save; null when nothing was lost. */
  droppedBefore: number | null;
}

export function lifeLogEntry(event: GameEvent, ruleset: string = RULESET_VERSION): LifeLogEntry {
  return { seq: event.seq, at: event.at, kind: event.kind, payload: { ...event.payload }, provenance: { source: "engine", ruleset } };
}

export function lifeLog(world: World, ruleset: string = RULESET_VERSION): LifeLog {
  const first = world.events[0];
  return {
    creatureId: world.creature.id,
    entries: world.events.map((e) => lifeLogEntry(e, ruleset)),
    droppedBefore: first && first.seq > 1 ? first.seq : null,
  };
}
