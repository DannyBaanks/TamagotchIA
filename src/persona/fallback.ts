/**
 * The local voice: always available, offline, no key. Deterministic: the same event
 * gets the same line. Every line is 3..20 words so it passes the same contract as the model.
 */
import { hashString, pick } from "../engine/random";
import type { Animation, Emotion, Intent, PersonaInput, PersonaReply } from "./contract";

type Line = [speech: string, emotion: Emotion, animation: Animation];

const LINES: Record<string, Line[]> = {
  HATCHED: [["¡Hola, mundo! ¿Tú eres mi persona?", "excited", "happy"], ["Crac, crac… ¡ya salí! Qué frío hace aquí.", "curious", "happy"]],
  FED: [["Ñam, ñam. Gracias por la comida.", "content", "eating"], ["Mmm, esto estuvo rico.", "happy", "eating"], ["Panza contenta, corazón contento.", "happy", "eating"]],
  FED_FAVORITE: [["¡Mi favorita! Sabía que te acordarías.", "excited", "eating"], ["¡Siií! Esto es lo que más me gusta.", "excited", "eating"]],
  FED_DISLIKED: [["Mmm… esto no me encanta, la verdad.", "grumpy", "side_eye"], ["Me lo como, pero pongo cara.", "grumpy", "side_eye"]],
  FAVORITE_FOUND: [["Ya lo decidí: esta es mi comida favorita.", "excited", "happy"]],
  PLAYED: [["¡Otra vez, otra vez!", "excited", "playing"], ["Jugar contigo es lo mejor del día.", "happy", "playing"]],
  PETTED: [["Mmm, qué rico se siente eso.", "content", "happy"], ["Más cariñitos, por favor.", "shy", "happy"]],
  PETTED_ASLEEP: [["Zzz… mmm… zzz…", "sleepy", "sleeping"]],
  PETTED_EGG: [["…tac, tac… algo se mueve adentro.", "curious", "idle"]],
  CLEANED: [["¡Rechinando de limpio!", "happy", "happy"], ["Ahh, ya no huelo a aventura.", "content", "happy"]],
  TALKED: [["Te escucho, cuéntame más.", "curious", "idle"], ["Me gusta cuando platicamos.", "content", "happy"], ["¿Y luego qué pasó?", "curious", "idle"]],
  EXPLORED: [["¡Mira lo que encontré por ahí!", "excited", "happy"], ["Salí a explorar y traje un tesoro.", "curious", "happy"]],
  WENT_TO_SLEEP: [["Buenas noches… zzz…", "sleepy", "sleeping"], ["Ya no aguanto los ojos. A dormir.", "sleepy", "sleeping"]],
  WOKE_UP: [["¡Buenos días! Dormí rico.", "happy", "idle"], ["Ya desperté. ¿Qué hacemos hoy?", "curious", "idle"]],
  WOKE_UP_GRUMPY: [["¿Por qué me despiertas? Tenía sueño.", "grumpy", "side_eye"]],
  BECAME_SICK: [["No me siento nada bien…", "sick", "sick"], ["Me duele la pancita. Cuídame, porfa.", "sick", "sick"]],
  RECOVERED: [["¡Ya me siento mejor! Gracias por cuidarme.", "happy", "happy"]],
  EVOLVED: [["¡Mírame! Ya crecí un montón.", "excited", "happy"], ["Algo cambió en mí… ¡me siento más grande!", "excited", "happy"]],
  MINI_GAME_WON: [["¡Gané! Soy lo máximo.", "excited", "happy"], ["¿Viste eso? ¡Qué reflejos!", "excited", "playing"]],
  MINI_GAME_LOST: [["Casi… la próxima te gano.", "grumpy", "side_eye"], ["Bueno, lo importante es jugar juntos.", "content", "idle"]],
  LONG_ABSENCE: [["¡Volviste! Te extrañé muchísimo.", "excited", "happy"], ["Pensé que ya no ibas a volver…", "sad", "sad"]],
  REFUSED_full: [["Ya no me cabe nada más.", "content", "side_eye"]],
  REFUSED_tired: [["Tengo demasiado sueño para eso ahora.", "sleepy", "sleepy"]],
  REFUSED_asleep: [["Zzz… zzz… (duerme profundamente)", "sleepy", "sleeping"]],
  REFUSED_not_tired: [["¡Pero si todavía no tengo sueño!", "grumpy", "side_eye"]],
  REFUSED_awake: [["¡Si ya tengo los ojos abiertos!", "content", "idle"]],
  REFUSED_egg: [["…el huevo se mueve un poquito…", "curious", "idle"]],
  DEFAULT: [["Aquí estoy, contigo.", "content", "idle"]],
};

function lineKey(input: PersonaInput): string {
  const { kind, payload } = input.event;
  if (kind === "FED" && payload.favorite) return "FED_FAVORITE";
  if (kind === "FED" && payload.disliked) return "FED_DISLIKED";
  if (kind === "PETTED" && payload.egg) return "PETTED_EGG";
  if (kind === "PETTED" && payload.asleep) return "PETTED_ASLEEP";
  if (kind === "WOKE_UP" && payload.grumpy) return "WOKE_UP_GRUMPY";
  if (kind === "REFUSED") return `REFUSED_${String(payload.reason)}`;
  return kind;
}

function intentFor(input: PersonaInput): Intent {
  const c = input.conditions;
  if (c.includes("asleep")) return "idle";
  if (c.includes("hungry")) return "request_food";
  if (c.includes("dirty")) return "request_cleaning";
  if (c.includes("tired")) return "request_sleep";
  if (c.includes("bored")) return "request_play";
  return "comment";
}

export function fallbackReply(input: PersonaInput, seq: number): PersonaReply {
  const options = LINES[lineKey(input)] ?? LINES[input.event.kind] ?? LINES.DEFAULT!;
  const [speech, emotion, animation] = pick(options, hashString(`${input.name}:${seq}`));
  return { speech, emotion, intent: intentFor(input), animation, memory_candidate: null };
}

export const ALL_FALLBACK_LINES: readonly Line[] = Object.values(LINES).flat();
