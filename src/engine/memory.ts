/**
 * MemoryPolicy. The code decides what is worth remembering; the persona may only
 * propose a small, short-lived note about something that actually just happened.
 */
import { HOUR } from "./rules";
import type { Creature, GameEvent, Memory, World } from "./types";

const DAY = 24 * HOUR;

const FOOD_NAMES: Record<string, string> = { apple: "manzana", rice: "arroz", fish: "pescado", candy: "dulce" };
const STAGE_NAMES: Record<string, string> = { baby: "bebé", child: "peque", adult: "grande" };

function memory(event: GameEvent, category: Memory["category"], summary: string, salience: number, ttl: number | null): Memory {
  return { id: `m-${event.seq}`, at: event.at, category, summary, salience, expiresAt: ttl === null ? null : event.at + ttl };
}

export function rememberEvent(event: GameEvent, creature: Creature): Memory | null {
  const p = event.payload;
  switch (event.kind) {
    case "HATCHED":
      return memory(event, "milestone", `${creature.name} salió del huevo`, 1, null);
    case "EVOLVED":
      return memory(event, "milestone", `${creature.name} creció: ahora es ${STAGE_NAMES[String(p.to)] ?? p.to}`, 1, null);
    case "BECAME_SICK":
      return memory(event, "health", "se enfermó por descuido", 0.8, 14 * DAY);
    case "RECOVERED":
      return memory(event, "health", "se recuperó gracias a los cuidados", 0.8, 14 * DAY);
    case "FAVORITE_FOUND":
      return memory(event, "preference", `su comida favorita es ${FOOD_NAMES[String(p.food)] ?? p.food}`, 0.9, null);
    case "MINI_GAME_WON":
      return creature.miniGameWins === 1 ? memory(event, "play", "ganó su primer minijuego", 0.6, 30 * DAY) : null;
    case "LONG_ABSENCE":
      return memory(event, "absence", `pasó ${p.hours} horas sin compañía`, 0.7, 7 * DAY);
    default:
      return null;
  }
}

/** What the persona can see: the few most salient memories that have not expired. */
export function relevantMemories(world: World, now: number, limit = 5): Memory[] {
  return world.memories
    .filter((m) => m.expiresAt === null || m.expiresAt > now)
    .sort((a, b) => b.salience - a.salience || b.at - a.at)
    .slice(0, limit);
}

/**
 * Accept a memory proposed by the persona only if it is short, plain, and tied to the
 * event it was reacting to. It never becomes permanent and never outranks a real milestone.
 */
export function acceptProposedMemory(world: World, candidate: string, event: GameEvent, now: number): Memory | null {
  const text = candidate.trim();
  if (text.length < 4 || text.length > 80) return null;
  if (/[<>{}\[\]`*#]/.test(text)) return null;
  if (!world.events.some((e) => e.seq === event.seq)) return null;
  if (world.memories.some((m) => m.summary.toLowerCase() === text.toLowerCase())) return null;
  const said = world.memories.filter((m) => m.category === "said" && (m.expiresAt ?? 0) > now);
  if (said.length >= 10) return null;
  return { id: `m-said-${event.seq}`, at: now, category: "said", summary: text, salience: 0.4, expiresAt: now + 7 * DAY };
}
