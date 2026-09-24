/** Read-only views of the state: labels the UI and the persona can use. Never written back. */
import type { Creature } from "./types";

export type Condition = "hungry" | "tired" | "dirty" | "bored" | "grumpy" | "happy" | "sick" | "asleep";

export function conditions(c: Creature): Condition[] {
  const s = c.stats;
  const out: Condition[] = [];
  if (c.asleep) out.push("asleep");
  if (c.sick) out.push("sick");
  if (s.hunger >= 60) out.push("hungry");
  if (s.energy <= 25) out.push("tired");
  if (s.cleanliness <= 35) out.push("dirty");
  if (s.curiosity >= 70) out.push("bored");
  if (s.mood <= 30) out.push("grumpy");
  if (s.mood >= 75 && !c.sick) out.push("happy");
  return out;
}

export type Pose = "idle" | "thinking" | "working" | "success" | "error" | "waiting";

/** Which pack animation fits the creature right now. */
export function pose(c: Creature, transient: Pose | null = null): Pose {
  if (transient) return transient;
  if (c.asleep) return "waiting";
  if (c.sick) return "error";
  return "idle";
}

export function timeOfDay(at: number): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date(at).getHours();
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 19) return "afternoon";
  return hour < 23 ? "evening" : "night";
}
