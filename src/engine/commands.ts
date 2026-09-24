/**
 * Game commands (SPEC §7). Each one first applies the elapsed time, then the action,
 * and returns the new world plus the events it produced. Nothing here waits on the persona.
 */
import { pick, hashString } from "./random";
import * as R from "./rules";
import { evolve, simulateElapsed } from "./simulation";
import { FOODS, type Food, type GameEvent, type World } from "./types";
import { clampStats, emit } from "./world";

export type Command =
  | { id: string; kind: "feed"; food: Food }
  | { id: string; kind: "play" }
  | { id: string; kind: "pet" }
  | { id: string; kind: "clean" }
  | { id: string; kind: "sleep" }
  | { id: string; kind: "wake" }
  | { id: string; kind: "talk" }
  | { id: string; kind: "explore" }
  | { id: string; kind: "minigame"; score: number };

/** A command before it gets its id (Omit distributed over the union). */
export type CommandInput = Command extends infer C ? (C extends Command ? Omit<C, "id"> : never) : never;

export type RejectReason = "egg" | "asleep" | "awake" | "full" | "tired" | "not_tired" | "bad_input";

export interface CommandResult {
  world: World;
  events: GameEvent[];
  rejected: RejectReason | null;
  /** The command id was already applied: nothing changed. */
  duplicate: boolean;
}

export function applyCommand(world: World, command: Command, now: number): CommandResult {
  if (world.processedCommands.includes(command.id)) {
    return { world, events: [], rejected: null, duplicate: true };
  }
  const w = simulateElapsed(world, now);
  const firstSeq = w.seq;
  const rejected = run(w, command, now);

  w.creature.lastInteractionAt = now;
  w.processedCommands.push(command.id);
  if (w.processedCommands.length > R.MAX_PROCESSED_COMMANDS) w.processedCommands.shift();
  clampStats(w.creature.stats);
  if (!rejected) evolve(w, now);
  if (rejected) emit(w, now, "REFUSED", { command: command.kind, reason: rejected });

  return { world: w, events: w.events.filter((e) => e.seq > firstSeq), rejected, duplicate: false };
}

function run(w: World, cmd: Command, now: number): RejectReason | null {
  const c = w.creature;
  const s = c.stats;

  if (c.stage === "egg") {
    if (cmd.kind !== "pet") return "egg";
    emit(w, now, "PETTED", { egg: true });
    return null;
  }
  const needsAwake = cmd.kind !== "pet" && cmd.kind !== "wake" && cmd.kind !== "clean";
  if (needsAwake && c.asleep) return "asleep";

  switch (cmd.kind) {
    case "feed": {
      if (!FOODS.includes(cmd.food)) return "bad_input";
      if (s.hunger <= R.FULL_HUNGER) return "full";
      const fx = R.FOOD_EFFECTS[cmd.food];
      s.hunger += fx.hunger;
      s.mood += fx.mood;
      s.health += fx.health;
      s.cleanliness += fx.cleanliness;
      const disliked = c.dislikedFood === cmd.food;
      if (disliked) s.mood += R.DISLIKED_PENALTY.mood;
      else c.foodAffinity[cmd.food] += 1;
      if (c.favoriteFood === cmd.food) {
        s.mood += R.FAVORITE_BONUS.mood;
        s.bond += R.FAVORITE_BONUS.bond;
      }
      c.experience += 1;
      emit(w, now, "FED", { food: cmd.food, favorite: c.favoriteFood === cmd.food, disliked });
      if (!c.favoriteFood && c.foodAffinity[cmd.food] >= R.FAVORITE_AFFINITY) {
        c.favoriteFood = cmd.food;
        emit(w, now, "FAVORITE_FOUND", { food: cmd.food });
      }
      return null;
    }
    case "play": {
      if (s.energy < R.PLAY.minEnergy) return "tired";
      s.energy += R.PLAY.energy;
      s.mood += R.PLAY.mood * (0.7 + 0.6 * c.traits.playfulness);
      s.hunger += R.PLAY.hunger;
      s.curiosity += R.PLAY.curiosity;
      s.bond += R.PLAY.bond;
      c.experience += R.PLAY.experience;
      emit(w, now, "PLAYED", {});
      return null;
    }
    case "pet": {
      const fresh = now - c.lastPetAt >= R.PET.cooldownMs;
      s.mood += c.asleep ? R.PET.asleepMood : R.PET.mood;
      if (fresh) s.bond += R.PET.bond * (0.6 + 0.8 * c.traits.affection);
      c.lastPetAt = now;
      emit(w, now, "PETTED", { asleep: c.asleep, bonded: fresh });
      return null;
    }
    case "clean": {
      s.cleanliness = 100;
      s.mood += R.CLEAN.mood;
      c.experience += R.CLEAN.experience;
      emit(w, now, "CLEANED", {});
      return null;
    }
    case "sleep": {
      if (s.energy >= R.SLEEP_MAX_ENERGY) return "not_tired";
      c.asleep = true;
      emit(w, now, "WENT_TO_SLEEP", { reason: "tucked_in" });
      return null;
    }
    case "wake": {
      if (!c.asleep) return "awake";
      c.asleep = false;
      const grumpy = s.energy < R.GRUMPY_WAKE.belowEnergy;
      if (grumpy) s.mood += R.GRUMPY_WAKE.mood;
      emit(w, now, "WOKE_UP", { reason: "woken", grumpy });
      return null;
    }
    case "talk": {
      s.curiosity += R.TALK.curiosity;
      s.bond += R.TALK.bond;
      s.mood += R.TALK.mood;
      c.experience += R.TALK.experience;
      emit(w, now, "TALKED", {});
      return null;
    }
    case "explore": {
      if (s.energy < R.EXPLORE.minEnergy) return "tired";
      s.energy += R.EXPLORE.energy;
      s.curiosity += R.EXPLORE.curiosity;
      s.mood += R.EXPLORE.mood;
      s.hunger += R.EXPLORE.hunger;
      c.experience += R.EXPLORE.experience;
      const found = pick(R.EXPLORE_FINDS, hashString(`${c.seed}:${w.seq}`));
      emit(w, now, "EXPLORED", { found });
      return null;
    }
    case "minigame": {
      if (!Number.isInteger(cmd.score) || cmd.score < 0 || cmd.score > R.MINI_GAME.maxScore) return "bad_input";
      if (s.energy < R.MINI_GAME.minEnergy) return "tired";
      s.energy += R.MINI_GAME.energy;
      s.mood += R.MINI_GAME.moodPerPoint * cmd.score;
      s.bond += R.MINI_GAME.bondPerPoint * cmd.score;
      c.experience += R.MINI_GAME.experiencePerPoint * cmd.score;
      const won = cmd.score >= R.MINI_GAME.winAt;
      if (won) c.miniGameWins += 1;
      emit(w, now, won ? "MINI_GAME_WON" : "MINI_GAME_LOST", { score: cmd.score });
      return null;
    }
  }
}
