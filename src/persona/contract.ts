/**
 * PersonalityProvider contract (SPEC §8). The model gets a bounded summary and must answer
 * with one small JSON object. Anything else is rejected and the local fallback speaks instead.
 * The reply is only words and a face: it is never turned into a game command.
 */
import { conditions, timeOfDay } from "../engine/derived";
import { relevantMemories } from "../engine/memory";
import type { GameEvent, World } from "../engine/types";

export const EMOTIONS = ["happy", "content", "excited", "curious", "shy", "sad", "grumpy", "sleepy", "sick"] as const;
export const INTENTS = ["idle", "comment", "request_food", "request_play", "request_sleep", "request_attention", "request_cleaning"] as const;
export const ANIMATIONS = ["idle", "happy", "sad", "sleepy", "eating", "playing", "sick", "side_eye", "sleeping"] as const;

export type Emotion = (typeof EMOTIONS)[number];
export type Intent = (typeof INTENTS)[number];
export type Animation = (typeof ANIMATIONS)[number];

export interface PersonaReply {
  speech: string;
  emotion: Emotion;
  intent: Intent;
  animation: Animation;
  memory_candidate: string | null;
}

export interface PersonaInput {
  name: string;
  species: string;
  stage: string;
  event: { kind: string; payload: GameEvent["payload"] };
  state: Record<string, number | boolean>;
  conditions: string[];
  traits: Record<string, number>;
  favorite_food: string | null;
  memories: string[];
  time_of_day: string;
  /** Only for Talk: what the player said, already trimmed and capped. Never reaches the engine. */
  player_said: string | null;
}

export function personaInput(world: World, event: GameEvent, now: number, playerSaid: string | null = null): PersonaInput {
  const c = world.creature;
  const round = (x: number) => Math.round(x);
  return {
    name: c.name,
    species: c.species,
    stage: c.stage,
    event: { kind: event.kind, payload: event.payload },
    state: {
      hunger: round(c.stats.hunger), energy: round(c.stats.energy), mood: round(c.stats.mood),
      health: round(c.stats.health), cleanliness: round(c.stats.cleanliness), bond: round(c.stats.bond),
      asleep: c.asleep, sick: c.sick,
    },
    conditions: conditions(c),
    traits: {
      affection: Math.round(c.traits.affection * 10) / 10,
      sarcasm: Math.round(c.traits.sarcasm * 10) / 10,
      playfulness: Math.round(c.traits.playfulness * 10) / 10,
    },
    favorite_food: c.favoriteFood,
    memories: relevantMemories(world, now).map((m) => m.summary),
    time_of_day: timeOfDay(now),
    player_said: playerSaid ? cleanPlayerText(playerSaid) : null,
  };
}

export function cleanPlayerText(text: string): string {
  return text.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export const SYSTEM_PROMPT = `Eres la voz de una criatura virtual tipo Tamagotchi. No eres un asistente.
Hablas en español, en primera persona, como la criatura: breve, tierna o sarcástica según tus rasgos.
Reaccionas SOLO al evento que te dan. No inventes comida, objetos ni cosas que no ocurrieron.
No puedes cambiar el juego: no prometas ni anuncies cambios de hambre, energía, salud o evolución.
Si "player_said" viene con texto, respóndele a eso, pero sigue siendo la criatura.
Una etapa "baby" habla muy simple; "adult" puede ser más elocuente.

Responde con UN solo objeto JSON y nada más, sin markdown:
{"speech": "...", "emotion": "...", "intent": "...", "animation": "...", "memory_candidate": null}

speech: entre 3 y 20 palabras.
emotion: una de ${EMOTIONS.join(", ")}.
intent: una de ${INTENTS.join(", ")}.
animation: una de ${ANIMATIONS.join(", ")}.
memory_candidate: null, o una frase corta (máx. 80 caracteres) que valga la pena recordar sobre ESTE momento.`;

export type Validation = { ok: true; reply: PersonaReply } | { ok: false; error: string };

const ASSISTANT_TALK = /\b(como (una )?(ia|inteligencia artificial|modelo)|as an ai|language model|asistente virtual|¿en qué (más )?puedo ayudar)/i;

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Validate a raw model answer. One repair only: pull the first {...} out of surrounding text. */
export function validateReply(raw: string): Validation {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "no es JSON" };
    try {
      data = JSON.parse(match[0]);
    } catch {
      return { ok: false, error: "no es JSON" };
    }
  }
  if (!data || typeof data !== "object") return { ok: false, error: "no es un objeto" };
  const r = data as Record<string, unknown>;
  const speech = typeof r.speech === "string" ? r.speech.trim() : "";
  const n = words(speech);
  if (n < 3 || n > 20) return { ok: false, error: `speech tiene ${n} palabras` };
  if (/[*_#`<>\[\]]/.test(speech)) return { ok: false, error: "speech trae markdown o etiquetas" };
  if (ASSISTANT_TALK.test(speech)) return { ok: false, error: "speech suena a asistente" };
  if (!EMOTIONS.includes(r.emotion as Emotion)) return { ok: false, error: `emotion fuera de lista: ${String(r.emotion)}` };
  if (!INTENTS.includes(r.intent as Intent)) return { ok: false, error: `intent fuera de lista: ${String(r.intent)}` };
  if (!ANIMATIONS.includes(r.animation as Animation)) return { ok: false, error: `animation fuera de lista: ${String(r.animation)}` };
  const mem = r.memory_candidate;
  if (mem !== null && mem !== undefined && typeof mem !== "string") return { ok: false, error: "memory_candidate no es texto" };
  return {
    ok: true,
    reply: {
      speech,
      emotion: r.emotion as Emotion,
      intent: r.intent as Intent,
      animation: r.animation as Animation,
      memory_candidate: typeof mem === "string" && mem.trim() ? mem.trim() : null,
    },
  };
}
