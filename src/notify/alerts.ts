/**
 * Which notifications to send, decided purely from the creature, the clock and a small
 * persisted memory of what was already said. The browser part only delivers them.
 *
 * Rules:
 *  - one alert per episode: it fires when a need starts, not every minute it lasts;
 *  - quiet hours hold alerts back and deliver them when the quiet ends, if still true;
 *  - at most one alert every `minGapMs`, most urgent first;
 *  - only while the app is not on screen: on screen, the creature already shows it.
 */
import { alertConditions, type AlertKind } from "../engine/forecast";
import type { Creature } from "../engine/types";

export interface NotifyPrefs {
  enabled: boolean;
  /** Hours 0..23. Quiet from quietStart up to (not including) quietEnd; may wrap midnight. */
  quietStart: number;
  quietEnd: number;
  minGapMs: number;
}

export const DEFAULT_PREFS: NotifyPrefs = { enabled: false, quietStart: 22, quietEnd: 8, minGapMs: 20 * 60_000 };

export interface NotifyState {
  /** Alerts true at the last check, so a lasting need is announced once. */
  active: AlertKind[];
  /** Alerts that became true but have not been delivered yet (quiet hours, gap). */
  pending: AlertKind[];
  lastSentAt: number;
  wasEgg: boolean;
  wasAsleep: boolean;
}

export const EMPTY_STATE: NotifyState = { active: [], pending: [], lastSentAt: 0, wasEgg: false, wasAsleep: false };

export interface Alert {
  kind: AlertKind;
  title: string;
  body: string;
}

const URGENCY: AlertKind[] = ["sick", "hatch", "hungry", "exhausted", "dirty", "lonely", "awake"];

export function inQuietHours(at: number, prefs: NotifyPrefs): boolean {
  const h = new Date(at).getHours();
  const { quietStart: s, quietEnd: e } = prefs;
  if (s === e) return false;
  return s < e ? h >= s && h < e : h >= s || h < e;
}

export function alertText(kind: AlertKind, name: string): Alert {
  const t: Record<AlertKind, [string, string]> = {
    hatch: [`🐣 ¡El huevo de ${name} se abrió!`, "Ven a conocer a tu criatura."],
    hungry: [`🍙 ${name} tiene hambre`, "Su pancita está vacía. ¿Le das algo?"],
    dirty: [`🧼 ${name} necesita un baño`, "Ya se nota el desorden en su cuarto."],
    sick: [`🤒 ${name} se enfermó`, "Necesita comida y un baño para recuperarse."],
    exhausted: [`🌙 ${name} no puede más de sueño`, "Arrópale para que descanse."],
    lonely: [`💧 ${name} te extraña`, "Unos mimos le cambiarían el día."],
    awake: [`☀️ ${name} ya despertó`, "Y quiere verte."],
  };
  const [title, body] = t[kind];
  return { kind, title, body };
}

export function decide(
  prev: NotifyState,
  creature: Creature,
  now: number,
  prefs: NotifyPrefs,
  onScreen: boolean,
): { send: Alert[]; next: NotifyState } {
  const current = alertConditions(creature);
  const started = [...current].filter((k) => !prev.active.includes(k));
  if (prev.wasEgg && creature.stage !== "egg") started.push("hatch");
  if (prev.wasAsleep && !creature.asleep) started.push("awake");

  // an alert that stopped being true before it could be sent is dropped;
  // a wake-up stays news only while it is still awake
  const stillTrue = (k: AlertKind) => k === "hatch" || (k === "awake" ? !creature.asleep : current.has(k));
  const pending = [...new Set([...prev.pending, ...started])].filter(stillTrue);

  const next: NotifyState = {
    active: [...current], pending, lastSentAt: prev.lastSentAt, wasEgg: creature.stage === "egg", wasAsleep: creature.asleep,
  };
  if (!prefs.enabled) return { send: [], next: { ...next, pending: [] } };
  if (onScreen) return { send: [], next: { ...next, pending: [] } };
  if (inQuietHours(now, prefs) || now - prev.lastSentAt < prefs.minGapMs || pending.length === 0) return { send: [], next };

  const kind = [...pending].sort((a, b) => URGENCY.indexOf(a) - URGENCY.indexOf(b))[0]!;
  return {
    send: [alertText(kind, creature.name)],
    next: { ...next, pending: pending.filter((k) => k !== kind), lastSentAt: now },
  };
}
