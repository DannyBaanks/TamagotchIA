/**
 * Every number that shapes the creature lives here, so tuning never touches logic.
 * Rates are per game hour.
 */
import type { Food } from "./types";

export const HOUR = 3_600_000;
export const MINUTE = 60_000;

/** Catch-up integrates in steps this long: coarse enough to be cheap, fine enough to catch thresholds. */
export const STEP_MS = 5 * MINUTE;
/** Time away beyond this is not simulated, so a month offline is not a death sentence. */
export const MAX_CATCHUP_MS = 72 * HOUR;
/** An absence at least this long becomes a memory. */
export const LONG_ABSENCE_MS = 12 * HOUR;

export const HATCH_MS = 90_000;

export const AWAKE = { hunger: 6, energy: -5, cleanliness: -4, curiosity: 3 };
export const ASLEEP = { hunger: 2.5, energy: 15, cleanliness: -1.5, curiosity: 1 };

/** Mood relaxes toward what the needs deserve at this rate. */
export const MOOD_RELAX_PER_HOUR = 12;
export const HEALTH_DECAY_PER_HOUR = 3;
export const HEALTH_REGEN_PER_HOUR = 1;
export const SICK_HEALTH_DECAY_PER_HOUR = 2;
export const BOND_DECAY_PER_HOUR = 0.5;
/** Without any interaction for this long, the bond starts to fade. */
export const BOND_DECAY_AFTER_MS = 12 * HOUR;

export const NEGLECT = { hunger: 80, cleanliness: 15, health: 30 };
export const NEGLECT_TO_SICK_MS = 6 * HOUR;
export const RECOVERY = { hunger: 40, cleanliness: 60 };
export const RECOVERY_MS = 2 * HOUR;

export const AUTO_SLEEP_ENERGY = 5;
export const AUTO_WAKE_ENERGY = 100;

export const EVOLUTION = {
  child: { ageMs: 24 * HOUR, experience: 40, health: 40 },
  adult: { ageMs: 72 * HOUR, experience: 150, health: 40 },
};

export interface FoodEffect {
  hunger: number;
  mood: number;
  health: number;
  cleanliness: number;
}

export const FOOD_EFFECTS: Record<Food, FoodEffect> = {
  apple: { hunger: -25, mood: 3, health: 1, cleanliness: -2 },
  rice: { hunger: -35, mood: 1, health: 1, cleanliness: -3 },
  fish: { hunger: -30, mood: 4, health: 2, cleanliness: -4 },
  candy: { hunger: -12, mood: 10, health: -3, cleanliness: -3 },
};

/** Below this hunger the creature is full and refuses food. */
export const FULL_HUNGER = 8;
/** Affinity needed before a food is declared the favourite. */
export const FAVORITE_AFFINITY = 5;
export const FAVORITE_BONUS = { mood: 8, bond: 2 };
export const DISLIKED_PENALTY = { mood: -6 };

export const PLAY = { minEnergy: 15, energy: -15, mood: 15, hunger: 5, curiosity: -20, bond: 3, experience: 5 };
export const PET = { mood: 5, bond: 2, asleepMood: 2, cooldownMs: 2 * MINUTE };
export const CLEAN = { mood: 2, experience: 1 };
export const SLEEP_MAX_ENERGY = 90;
export const GRUMPY_WAKE = { belowEnergy: 30, mood: -10 };
export const TALK = { curiosity: -5, bond: 1, mood: 2, experience: 1 };
export const EXPLORE = { minEnergy: 20, energy: -10, curiosity: -30, mood: 8, hunger: 4, experience: 8 };
export const MINI_GAME = { minEnergy: 10, energy: -10, moodPerPoint: 4, bondPerPoint: 1, experiencePerPoint: 3, winAt: 3, maxScore: 5 };

export const EXPLORE_FINDS = [
  "una piedra brillante",
  "una hoja con forma de corazón",
  "un botón perdido",
  "una pluma azul",
  "una semilla misteriosa",
  "un caracol dormido",
  "una canica verde",
  "un pedacito de cinta",
];

export const MAX_EVENTS = 300;
export const MAX_MEMORIES = 50;
export const MAX_PROCESSED_COMMANDS = 200;
