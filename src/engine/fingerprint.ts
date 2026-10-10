/**
 * CareFingerprint —"huella de crianza".
 *
 * A small, versioned, deterministic projection of the events the engine already
 * recorded. It answers one question: *how has this creature been cared for?*
 *
 * It is NOT a second source of truth. It never writes to the world, never becomes
 * an event, and can always be rebuilt from the event store, so a save that loses it
 * loses nothing. Same world + same rules version => same fingerprint, always.
 *
 * Four legible axes, not thirty opaque scores:
 *   affection   mimos, comida preferida, acompañar la recuperación
 *   curiosity   explorar y descubrir cosas
 *   playfulness jugar y ganar minijuegos
 *   calm        rutinas de descanso y cuidados equilibrados
 *
 * Two guards keep the numbers honest:
 *  - the score saturates, so repeating one action adds less and less;
 *  - within a "session" (events less than SESSION_GAP_MS apart) one action counts
 *    at most MAX_PER_SESSION times. Holding a button is not a personality.
 */
import type { Axis, CareFingerprint, FingerprintEvidence, FingerprintReason, World } from "./types";

/** Bump this whenever a weight, a cap or an axis changes: evidence is bound to it. */
export const FINGERPRINT_RULES_VERSION = "care-fingerprint-rules/1";
export const FINGERPRINT_SCHEMA = "care-fingerprint/1";

/** Events closer than this belong to the same care session. */
export const SESSION_GAP_MS = 30 * 60_000;
/** One action counts at most this many times inside one session. */
export const MAX_PER_SESSION = 3;
/** Points needed for an axis to show up as a trait. */
export const REASON_MIN_SCORE = 25;
/** Minimum counted actions behind an axis before it is named. */
export const REASON_MIN_EVIDENCE = 2;
/** Points at which an axis is considered full (soft saturation). */
const SATURATION = 40;

/** Weight of each event kind on each axis. Absent kinds contribute nothing. */
const WEIGHTS: Partial<Record<World["events"][number]["kind"], Partial<Record<Axis, number>>>> = {
  PETTED: { affection: 3 },
  FED: { affection: 2 },
  TALKED: { affection: 1, curiosity: 1 },
  RECOVERED: { affection: 5, calm: 2 },
  EXPLORED: { curiosity: 6 },
  FAVORITE_FOUND: { curiosity: 3 },
  PLAYED: { playfulness: 4 },
  MINI_GAME_WON: { playfulness: 3 },
  MINI_GAME_LOST: { playfulness: 1 },
  WENT_TO_SLEEP: { calm: 3 },
  CLEANED: { calm: 2 },
};

const AXIS_ORDER: Axis[] = ["affection", "curiosity", "playfulness", "calm"];

/** Sentences a person can read. Counted from real events, never estimated. */
const PHRASES: Record<Axis, (n: number) => string> = {
  affection: (n) => (n === 1 ? "Me diste mimos una vez" : `Me diste mimos ${n} veces`),
  curiosity: (n) => (n === 1 ? "Exploramos juntos una vez" : `Exploramos juntos ${n} veces`),
  playfulness: (n) => (n === 1 ? "Jugamos una vez" : `Jugamos ${n} veces`),
  calm: (n) => (n === 1 ? "Descansamos juntos una vez" : `Descansamos juntos ${n} veces`),
};

const AXIS_LABEL: Record<Axis, string> = {
  affection: "Cariñosa",
  curiosity: "Curiosa",
  playfulness: "Juguetona",
  calm: "Tranquila",
};

/** Same event twice (a retried command) must not count twice. */
function dedupe(world: World) {
  const seen = new Set<number>();
  const out = [];
  for (const event of world.events) {
    if (seen.has(event.seq)) continue;
    seen.add(event.seq);
    out.push(event);
  }
  // total order: when two events share a timestamp, seq decides
  return out.sort((a, b) => a.at - b.at || a.seq - b.seq);
}

export function projectCareFingerprint(world: World): CareFingerprint {
  const events = dedupe(world);
  const raw: Record<Axis, number> = { affection: 0, curiosity: 0, playfulness: 0, calm: 0 };
  const counted: Record<Axis, number> = { affection: 0, curiosity: 0, playfulness: 0, calm: 0 };
  const evidence: FingerprintEvidence[] = [];

  // session bookkeeping: how many times a (kind, axis) already counted this session
  let sessionStart: number | null = null;
  let perSession = new Map<string, number>();

  for (const event of events) {
    if (event.kind === "REFUSED" || event.kind === "CREATURE_CREATED" || event.kind === "HATCHED") continue;
    const weights = WEIGHTS[event.kind];
    if (!weights) continue;
    if (sessionStart === null || event.at - sessionStart > SESSION_GAP_MS) {
      sessionStart = event.at;
      perSession = new Map();
    }
    for (const axis of AXIS_ORDER) {
      const weight = weights[axis];
      if (!weight) continue;
      const key = `${event.kind}:${axis}`;
      const used = perSession.get(key) ?? 0;
      if (used >= MAX_PER_SESSION) continue;
      perSession.set(key, used + 1);
      raw[axis] += weight;
      counted[axis] += 1;
      evidence.push({ eventId: event.seq, axis, kind: event.kind, effect: `+${weight}`, occurredAt: event.at });
    }
  }

  const axes = {} as Record<Axis, number>;
  for (const axis of AXIS_ORDER) {
    // soft saturation: doubling the actions never doubles the score
    axes[axis] = Math.round(100 * (1 - Math.exp(-raw[axis] / SATURATION)));
  }

  return {
    schema: FINGERPRINT_SCHEMA,
    rulesVersion: FINGERPRINT_RULES_VERSION,
    creatureId: world.creature.id,
    derivedFromThroughEventId: events.length ? events[events.length - 1]!.seq : null,
    axes,
    evidence,
    counts: counted,
  };
}

/**
 * Up to `limit` traits the creature can show, each with the real count behind it.
 * An axis with too little evidence is simply not named: no invented personality.
 */
export function dominantReasons(fingerprint: CareFingerprint, limit = 3): FingerprintReason[] {
  return AXIS_ORDER
    .filter((axis) => fingerprint.axes[axis] >= REASON_MIN_SCORE && fingerprint.counts[axis] >= REASON_MIN_EVIDENCE)
    .sort((a, b) => fingerprint.axes[b] - fingerprint.axes[a] || AXIS_ORDER.indexOf(a) - AXIS_ORDER.indexOf(b))
    .slice(0, limit)
    .map((axis) => ({
      axis,
      label: AXIS_LABEL[axis],
      score: fingerprint.axes[axis],
      events: fingerprint.counts[axis],
      sentence: PHRASES[axis](fingerprint.counts[axis]),
    }));
}

/** Stable digest of the fingerprint, for tests and the independence proof. */
export function fingerprintDigest(fingerprint: CareFingerprint): string {
  const canonical = JSON.stringify([
    fingerprint.schema,
    fingerprint.rulesVersion,
    fingerprint.creatureId,
    AXIS_ORDER.map((axis) => fingerprint.axes[axis]),
    fingerprint.counts ? AXIS_ORDER.map((axis) => fingerprint.counts[axis]) : [],
  ]);
  // small deterministic hash (FNV-1a 32-bit), enough to compare, not to secure
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fp-${h.toString(16).padStart(8, "0")}`;
}
