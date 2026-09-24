/**
 * simulate_elapsed from SPEC §6: the world moves forward in fixed steps, never second by second.
 * Pure: same world + same `now` → same result. The clock is always passed in.
 */
import * as R from "./rules";
import type { Creature, World } from "./types";
import { clamp, clampStats, copyWorld, emit } from "./world";

export function simulateElapsed(world: World, now: number): World {
  const w = copyWorld(world);
  const c = w.creature;
  if (now <= c.lastTickAt) return w; // a clock that went backwards moves nothing

  const realElapsed = now - c.lastTickAt;
  if (realElapsed >= R.LONG_ABSENCE_MS && c.stage !== "egg") {
    emit(w, now, "LONG_ABSENCE", { hours: Math.floor(realElapsed / R.HOUR) });
  }
  const skipped = Math.max(0, realElapsed - R.MAX_CATCHUP_MS);
  let t = c.lastTickAt + skipped;

  while (t < now) {
    if (c.stage === "egg") {
      // an egg only waits: jump straight to the moment it hatches, or stay an egg
      const hatchAt = Math.max(c.createdAt + R.HATCH_MS, t);
      if (hatchAt > now) break;
      t = hatchAt;
      hatch(w, t);
      continue;
    }
    const dt = Math.min(R.STEP_MS, now - t);
    t += dt;
    step(w, dt, t);
  }
  c.lastTickAt = now;
  return w;
}

function hatch(w: World, at: number): void {
  const c = w.creature;
  c.stage = "baby";
  c.hatchedAt = at;
  emit(w, at, "HATCHED", {});
}

export function isNeglected(c: Creature): boolean {
  return c.stats.hunger >= R.NEGLECT.hunger || c.stats.cleanliness <= R.NEGLECT.cleanliness || c.stats.health <= R.NEGLECT.health;
}

/** What mood the needs deserve right now. */
export function moodTarget(c: Creature): number {
  const s = c.stats;
  const raw = 100 - 0.4 * s.hunger - 0.25 * (100 - s.energy) - 0.2 * (100 - s.cleanliness) - 0.15 * s.curiosity + 0.1 * s.bond;
  return clamp(raw - (c.sick ? 20 : 0));
}

function step(w: World, dt: number, t: number): void {
  const c = w.creature;
  const s = c.stats;
  const h = dt / R.HOUR;
  const rates = c.asleep ? R.ASLEEP : R.AWAKE;
  const appetite = 0.8 + 0.4 * c.traits.appetite;

  s.hunger += rates.hunger * appetite * h;
  s.energy += rates.energy * (c.sick && c.asleep ? 0.5 : 1) * h;
  s.cleanliness += rates.cleanliness * h;
  s.curiosity += rates.curiosity * h;

  if (s.hunger >= R.NEGLECT.hunger || s.cleanliness <= R.NEGLECT.cleanliness) s.health -= R.HEALTH_DECAY_PER_HOUR * h;
  else if (c.sick) s.health -= R.SICK_HEALTH_DECAY_PER_HOUR * h;
  else s.health += R.HEALTH_REGEN_PER_HOUR * h;

  if (t - c.lastInteractionAt > R.BOND_DECAY_AFTER_MS) s.bond -= R.BOND_DECAY_PER_HOUR * h;
  clampStats(s);

  const target = moodTarget(c);
  const delta = Math.min(Math.abs(target - s.mood), R.MOOD_RELAX_PER_HOUR * h);
  s.mood = clamp(s.mood + Math.sign(target - s.mood) * delta);

  if (!c.sick) {
    c.neglectMs = isNeglected(c) ? c.neglectMs + dt : 0;
    if (c.neglectMs >= R.NEGLECT_TO_SICK_MS) {
      c.sick = true;
      c.neglectMs = 0;
      c.recoveryMs = 0;
      emit(w, t, "BECAME_SICK", {});
    }
  } else {
    const cared = s.hunger <= R.RECOVERY.hunger && s.cleanliness >= R.RECOVERY.cleanliness;
    c.recoveryMs = cared ? c.recoveryMs + dt : 0;
    if (c.recoveryMs >= R.RECOVERY_MS) {
      c.sick = false;
      c.recoveryMs = 0;
      emit(w, t, "RECOVERED", {});
    }
  }

  if (!c.asleep && s.energy <= R.AUTO_SLEEP_ENERGY) {
    c.asleep = true;
    emit(w, t, "WENT_TO_SLEEP", { reason: "exhausted" });
  } else if (c.asleep && s.energy >= R.AUTO_WAKE_ENERGY) {
    c.asleep = false;
    emit(w, t, "WOKE_UP", { reason: "rested" });
  }

  c.ageMs += dt;
  evolve(w, t);
}

export function evolve(w: World, t: number): void {
  const c = w.creature;
  const next = c.stage === "baby" ? "child" : c.stage === "child" ? "adult" : null;
  if (!next) return;
  const need = R.EVOLUTION[next];
  if (c.ageMs >= need.ageMs && c.experience >= need.experience && c.stats.health >= need.health && !c.sick) {
    const from = c.stage;
    c.stage = next;
    emit(w, t, "EVOLVED", { from, to: next });
  }
}
