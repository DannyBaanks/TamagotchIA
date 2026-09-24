/** Canonical game model. Only the engine writes these; the persona and the UI read them. */

export type Stage = "egg" | "baby" | "child" | "adult";

export const STAT_KEYS = ["hunger", "energy", "mood", "health", "cleanliness", "curiosity", "bond"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/**
 * Every stat is 0..100.
 * hunger: 0 full, 100 starving. energy: 0 exhausted, 100 rested. mood: 0 miserable, 100 happy.
 * health: 0 critical, 100 healthy. cleanliness: 0 filthy, 100 clean.
 * curiosity: 0 content, 100 bored and restless. bond: 0 stranger, 100 inseparable.
 */
export type Stats = Record<StatKey, number>;

export const FOODS = ["apple", "rice", "fish", "candy"] as const;
export type Food = (typeof FOODS)[number];

export interface Traits {
  /** 0..1, fixed at birth from the seed. They colour the voice, never the rules. */
  affection: number;
  sarcasm: number;
  playfulness: number;
  appetite: number;
}

export interface Creature {
  id: string;
  name: string;
  species: string;
  seed: number;
  createdAt: number;
  hatchedAt: number | null;
  /** Game-time lived since hatching, in ms. */
  ageMs: number;
  stage: Stage;
  experience: number;
  traits: Traits;
  stats: Stats;
  asleep: boolean;
  sick: boolean;
  /** Continuous ms spent in a neglected state (drives sickness). */
  neglectMs: number;
  /** Continuous ms spent well cared for while sick (drives recovery). */
  recoveryMs: number;
  foodAffinity: Record<Food, number>;
  favoriteFood: Food | null;
  dislikedFood: Food | null;
  lastTickAt: number;
  lastInteractionAt: number;
  lastPetAt: number;
  miniGameWins: number;
}

export type EventKind =
  | "CREATURE_CREATED"
  | "HATCHED"
  | "FED"
  | "REFUSED"
  | "PLAYED"
  | "PETTED"
  | "CLEANED"
  | "TALKED"
  | "EXPLORED"
  | "WENT_TO_SLEEP"
  | "WOKE_UP"
  | "BECAME_SICK"
  | "RECOVERED"
  | "EVOLVED"
  | "FAVORITE_FOUND"
  | "MINI_GAME_WON"
  | "MINI_GAME_LOST"
  | "LONG_ABSENCE";

export interface GameEvent {
  seq: number;
  at: number;
  kind: EventKind;
  payload: Record<string, string | number | boolean | null>;
}

export type MemoryCategory = "milestone" | "health" | "preference" | "play" | "absence" | "said";

export interface Memory {
  id: string;
  at: number;
  category: MemoryCategory;
  summary: string;
  salience: number;
  /** null = permanent. */
  expiresAt: number | null;
}

export interface World {
  version: 1;
  creature: Creature;
  events: GameEvent[];
  memories: Memory[];
  seq: number;
  /** Recent command ids, so a double tap or a retried request applies once. */
  processedCommands: string[];
}
