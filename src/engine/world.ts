import { rememberEvent } from "./memory";
import { prng } from "./random";
import { MAX_EVENTS, MAX_MEMORIES } from "./rules";
import { FOODS, STAT_KEYS, type Creature, type EventKind, type GameEvent, type Stats, type World } from "./types";

export function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function clampStats(stats: Stats): void {
  for (const key of STAT_KEYS) stats[key] = clamp(stats[key]);
}

export function createWorld(name: string, species: string, now: number, seed: number): World {
  const rand = prng(seed);
  const creature: Creature = {
    id: `c-${seed.toString(36)}`,
    name: name.trim() || "Huevito",
    species,
    seed,
    createdAt: now,
    hatchedAt: null,
    ageMs: 0,
    stage: "egg",
    experience: 0,
    traits: { affection: rand(), sarcasm: rand(), playfulness: rand(), appetite: rand() },
    stats: { hunger: 20, energy: 80, mood: 70, health: 100, cleanliness: 100, curiosity: 30, bond: 10 },
    asleep: false,
    sick: false,
    neglectMs: 0,
    recoveryMs: 0,
    foodAffinity: Object.fromEntries(FOODS.map((f) => [f, 0])) as Creature["foodAffinity"],
    favoriteFood: null,
    dislikedFood: FOODS[Math.floor(rand() * FOODS.length)] ?? null,
    lastTickAt: now,
    lastInteractionAt: now,
    lastPetAt: 0,
    miniGameWins: 0,
  };
  const world: World = { version: 1, creature, events: [], memories: [], seq: 0, processedCommands: [] };
  emit(world, now, "CREATURE_CREATED", { name: creature.name, species });
  return world;
}

/** Record an event on a world that is already a private copy. Returns the event. */
export function emit(world: World, at: number, kind: EventKind, payload: GameEvent["payload"] = {}): GameEvent {
  world.seq += 1;
  const event: GameEvent = { seq: world.seq, at, kind, payload };
  world.events.push(event);
  if (world.events.length > MAX_EVENTS) world.events.splice(0, world.events.length - MAX_EVENTS);
  const memory = rememberEvent(event, world.creature);
  if (memory && !world.memories.some((m) => m.summary === memory.summary)) {
    world.memories.push(memory);
    trimMemories(world);
  }
  return event;
}

export function trimMemories(world: World): void {
  if (world.memories.length <= MAX_MEMORIES) return;
  // keep permanent ones, then the most salient and most recent
  world.memories.sort((a, b) => Number(b.expiresAt === null) - Number(a.expiresAt === null) || b.salience - a.salience || b.at - a.at);
  world.memories.length = MAX_MEMORIES;
  world.memories.sort((a, b) => a.at - b.at);
}

export function copyWorld(world: World): World {
  return structuredClone(world);
}
