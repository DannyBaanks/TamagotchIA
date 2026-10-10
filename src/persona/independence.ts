/**
 * Proof that the voice is not the identity.
 *
 * The claim of "Crianza Viva" is that a creature keeps who it is when its model
 * changes, disappears or fails. That is a testable property, not a slogan: take a
 * digest of everything that is *canonical* (creature, stats, memories, events, care
 * fingerprint), swap the PersonalityProvider, and the digest must be identical.
 *
 * What is deliberately NOT hashed: the last sentence the creature said, which
 * provider answered, timings and anything else the model can legitimately change.
 */
import { fingerprintDigest, projectCareFingerprint } from "../engine/fingerprint";
import type { World } from "../engine/types";

export const IDENTITY_SCHEMA = "creature-identity/1";

export interface IdentityDigest {
  schema: typeof IDENTITY_SCHEMA;
  /** The canonical digest. Same creature + same history => same value, whatever speaks. */
  digest: string;
  /** The care fingerprint's own digest, so a trait change is visible on its own. */
  fingerprint: string;
  /** What went into the hash, so the claim can be audited instead of trusted. */
  components: string[];
}

/**
 * Digest of the canonical state. Read-only: it never writes and never mutates.
 * The order is fixed (events by seq), so a shuffled array cannot fake a change.
 */
export function identityDigest(world: World): IdentityDigest {
  const creature = world.creature;
  const events = [...world.events].sort((a, b) => a.seq - b.seq);
  const memories = [...world.memories].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  const canonical = {
    schema: IDENTITY_SCHEMA,
    worldVersion: world.version,
    creature: {
      id: creature.id,
      name: creature.name,
      species: creature.species,
      seed: creature.seed,
      stage: creature.stage,
      ageMs: creature.ageMs,
      experience: creature.experience,
      stats: creature.stats,
      traits: creature.traits,
      favoriteFood: creature.favoriteFood,
      dislikedFood: creature.dislikedFood,
      foodAffinity: creature.foodAffinity,
      miniGameWins: creature.miniGameWins,
    },
    events: events.map((e) => [e.seq, e.at, e.kind]),
    memories: memories.map((m) => [m.id, m.at, m.category, m.summary]),
    seq: world.seq,
  };

  return {
    schema: IDENTITY_SCHEMA,
    digest: hash(JSON.stringify(canonical)),
    fingerprint: fingerprintDigest(projectCareFingerprint(world)),
    components: ["creature", "stats", "traits", "events", "memories", "careFingerprint"],
  };
}

/** FNV-1a 32-bit over the canonical JSON. For comparison in tests and UI, not for security. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `id-${h.toString(16).padStart(8, "0")}`;
}

export interface VoiceSwap {
  from: string;
  to: string;
  /** True when the canonical identity survived the swap. */
  identityPreserved: boolean;
  before: string;
  after: string;
}

/**
 * Compare the identity before and after changing who speaks.
 *
 * `speak` runs the provider exactly as the app does (send the bounded input, take the
 * narration back). Its answer is allowed to differ — that is the point — and is never
 * fed back into the engine.
 */
export function proveVoiceSwap(
  world: World,
  from: string,
  to: string,
  speak: (provider: string, world: World) => { speech: string },
): VoiceSwap {
  const before = identityDigest(world);

  // The model answers. Its words are read and then thrown away: nothing here writes
  // to the world, which is exactly the invariant being demonstrated.
  const first = speak(from, world);
  const second = speak(to, world);
  if (typeof first.speech !== "string" || typeof second.speech !== "string") {
    throw new Error("a provider must answer with a speech string");
  }

  const after = identityDigest(world);
  return {
    from,
    to,
    before: before.digest,
    after: after.digest,
    identityPreserved: before.digest === after.digest && before.fingerprint === after.fingerprint,
  };
}
