import type { Condition } from "../engine/derived";
import type { Food, GameEvent, Memory, Stage } from "../engine/types";

export const STAGE_LABEL: Record<Stage, string> = { egg: "huevo", baby: "bebé", child: "peque", adult: "grande" };

export const FOOD_LABEL: Record<Food, { name: string; icon: string; note: string }> = {
  apple: { name: "Manzana", icon: "🍎", note: "ligera" },
  rice: { name: "Arroz", icon: "🍙", note: "llena mucho" },
  fish: { name: "Pescado", icon: "🐟", note: "la favorita de muchos gatos" },
  candy: { name: "Dulce", icon: "🍬", note: "alegra, pero no es sano" },
};

export const ATTENTION: Partial<Record<Condition, string>> = {
  sick: "🤒",
  hungry: "🍙",
  dirty: "🧼",
  tired: "🌙",
  bored: "🎈",
  grumpy: "💢",
};

export const MEMORY_ICON: Record<Memory["category"], string> = {
  milestone: "🌟",
  health: "🩹",
  preference: "💛",
  play: "⭐",
  absence: "🕰️",
  said: "💬",
};

export function describeEvent(e: GameEvent): string | null {
  const p = e.payload;
  switch (e.kind) {
    case "CREATURE_CREATED": return "Llegó un huevo";
    case "HATCHED": return "Salió del huevo";
    case "FED": return `Comió ${FOOD_LABEL[p.food as Food]?.name.toLowerCase() ?? p.food}${p.disliked ? " (no le gustó)" : ""}`;
    case "REFUSED": return `No quiso ${REFUSE_WHAT[String(p.command)] ?? p.command}`;
    case "PLAYED": return "Jugaron un rato";
    case "PETTED": return p.egg ? "Le diste calor al huevo" : "Le hiciste mimos";
    case "CLEANED": return "Baño completo";
    case "TALKED": return "Platicaron";
    case "EXPLORED": return `Exploró y encontró ${p.found}`;
    case "WENT_TO_SLEEP": return p.reason === "exhausted" ? "Se durmió de cansancio" : "Le diste las buenas noches";
    case "WOKE_UP": return p.grumpy ? "Despertó de malas" : "Despertó";
    case "BECAME_SICK": return "Se enfermó";
    case "RECOVERED": return "Se recuperó";
    case "EVOLVED": return `Creció: ahora es ${STAGE_LABEL[p.to as Stage] ?? p.to}`;
    case "FAVORITE_FOUND": return `Descubrió su comida favorita: ${FOOD_LABEL[p.food as Food]?.name.toLowerCase() ?? p.food}`;
    case "MINI_GAME_WON": return `Ganó el minijuego (${p.score}/5)`;
    case "MINI_GAME_LOST": return `Perdió el minijuego (${p.score}/5)`;
    case "LONG_ABSENCE": return `Pasó ${p.hours} h sin ti`;
    default: return null;
  }
}

const REFUSE_WHAT: Record<string, string> = {
  feed: "comer", play: "jugar", sleep: "dormir", wake: "despertar", explore: "explorar", minigame: "jugar al minijuego",
  talk: "platicar", clean: "bañarse", pet: "mimos",
};

export function clockLabel(at: number): string {
  return new Date(at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(at: number): string {
  return new Date(at).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
