import { applyCommand, type Command } from "../src/engine/commands";
import {
  FINGERPRINT_RULES_VERSION,
  MAX_PER_SESSION,
  dominantReasons,
  fingerprintDigest,
  projectCareFingerprint,
} from "../src/engine/fingerprint";
import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import type { Axis, World } from "../src/engine/types";
import { createWorld } from "../src/engine/world";

const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);
let n = 0;
const cmd = (c: Omit<Command, "id"> & Record<string, unknown>): Command => ({ id: `f${++n}`, ...c }) as Command;

function fresh(seed = 7): World {
  return simulateElapsed(createWorld("Mochi", "malbolge-cat", T0, seed), T0 + R.HATCH_MS);
}

/**
 * A=care and rest; B=play and explore. Same seed, same species, same elapsed time.
 *
 * Both stories are feasible: the engine refuses actions the creature cannot do
 * (no energy to play, already full, ...), so each step leaves room to rest
 * between sessions. That is the point — a difference in care, not in legality.
 */
function storyA(world: World): World {
  let w = world;
  for (let session = 0; session < 3; session++) {
    const base = T0 + R.HATCH_MS + session * 6 * R.HOUR;
    // a care session: mimos and a gentle routine
    w = applyCommand(w, cmd({ kind: "pet" }), base + R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "pet" }), base + 2 * R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "clean" }), base + 3 * R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "sleep" }), base + 4 * R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "wake" }), base + 3 * R.HOUR).world;
  }
  return w;
}

function storyB(world: World): World {
  let w = world;
  for (let session = 0; session < 3; session++) {
    const base = T0 + R.HATCH_MS + session * 6 * R.HOUR;
    // an adventure session: out and about, then a game
    w = applyCommand(w, cmd({ kind: "explore" }), base + R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "minigame", score: 3 }), base + 2 * R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "play" }), base + 3 * R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "sleep" }), base + 4 * R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "wake" }), base + 2 * R.HOUR).world;
  }
  return w;
}

describe("care fingerprint", () => {
  it("F01 · the same history gives the same fingerprint", () => {
    const a1 = projectCareFingerprint(storyA(fresh(7)));
    const a2 = projectCareFingerprint(storyA(fresh(7)));
    expect(a1).toEqual(a2);
    expect(fingerprintDigest(a1)).toBe(fingerprintDigest(a2));
  });

  it("F02 · two different histories differ, and the difference is traceable", () => {
    const a = projectCareFingerprint(storyA(fresh(7)));
    const b = projectCareFingerprint(storyB(fresh(7)));

    // Same creature seed and species, so any difference comes from the care.
    expect(a.creatureId).toBe(b.creatureId);
    expect(a.axes).not.toEqual(b.axes);

    // A is affectionate and calm; B is curious and playful.
    expect(a.axes.affection).toBeGreaterThan(b.axes.affection);
    expect(a.axes.calm).toBeGreaterThan(b.axes.calm);
    expect(b.axes.curiosity).toBeGreaterThan(a.axes.curiosity);
    expect(b.axes.playfulness).toBeGreaterThan(a.axes.playfulness);

    // Every point spent has a real event behind it.
    const seqs = new Set(storyB(fresh(7)).events.map((e) => e.seq));
    expect(b.evidence.length).toBeGreaterThan(0);
    expect(b.evidence.every((e) => seqs.has(e.eventId))).toBe(true);
    expect(b.evidence.every((e) => e.occurredAt > 0)).toBe(true);
  });

  it("F06 · a duplicate or reordered event stream does not change the fingerprint", () => {
    const world = storyA(fresh(7));
    const plain = projectCareFingerprint(world);

    // Same events, duplicated and shuffled, with the seq intact.
    const doubled = { ...world, events: [...world.events, ...world.events] };
    expect(fingerprintDigest(projectCareFingerprint(doubled))).toBe(fingerprintDigest(plain));

    const reversed = { ...world, events: [...world.events].reverse() };
    expect(fingerprintDigest(projectCareFingerprint(reversed))).toBe(fingerprintDigest(plain));
  });

  it("saturates: holding one button does not fabricate a personality", () => {
    // 40 pets inside a single session
    let spam = fresh(7);
    for (let i = 0; i < 40; i++) {
      spam = applyCommand(spam, cmd({ kind: "pet" }), T0 + R.HATCH_MS + i * 1000).world;
    }
    const spamFp = projectCareFingerprint(spam);

    // Only MAX_PER_SESSION pets counted, so affection stays modest.
    expect(spamFp.counts.affection).toBeLessThanOrEqual(MAX_PER_SESSION);
    expect(spamFp.axes.affection).toBeLessThan(50);

    // The same pets spread over many sessions do build the axis.
    let spaced = fresh(7);
    for (let i = 0; i < 8; i++) {
      spaced = applyCommand(spaced, cmd({ kind: "pet" }), T0 + R.HATCH_MS + i * 2 * R.HOUR).world;
    }
    expect(projectCareFingerprint(spaced).axes.affection).toBeGreaterThan(spamFp.axes.affection);
  });

  it("F10 · an axis with too little evidence is never named", () => {
    const empty = projectCareFingerprint(fresh(7));
    expect(dominantReasons(empty)).toEqual([]);

    // One single exploration is not a personality.
    const one = applyCommand(fresh(7), cmd({ kind: "explore" }), T0 + R.HATCH_MS + R.HOUR).world;
    expect(dominantReasons(projectCareFingerprint(one)).some((r) => r.axis === "curiosity")).toBe(false);

    // Six explorations, spread over sessions, are.
    const many = storyB(fresh(7));
    const reasons = dominantReasons(projectCareFingerprint(many));
    expect(reasons.some((r) => r.axis === "curiosity")).toBe(true);
  });

  it("F09 · every reason shown quotes a real count, and names no internals", () => {
    const world = storyB(fresh(7));
    const fp = projectCareFingerprint(world);
    const reasons = dominantReasons(fp);

    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(reason.events).toBe(fp.counts[reason.axis]);
      expect(reason.events).toBeGreaterThanOrEqual(2);
      // A person reads this: no ids, no JSON, no "seq"
      expect(reason.sentence).not.toMatch(/seq|eventId|\{|\}|\[\]/);
      expect(reason.sentence.length).toBeGreaterThan(8);
    }
  });

  it("evidence never points at events that do not exist", () => {
    const world = storyA(fresh(7));
    const fp = projectCareFingerprint(world);
    const known = new Set(world.events.map((e) => e.seq));
    for (const item of fp.evidence) {
      expect(known.has(item.eventId)).toBe(true);
    }
    expect(fp.derivedFromThroughEventId === null || known.has(fp.derivedFromThroughEventId)).toBe(true);
  });

  it("is versioned, so old evidence is never read with new rules", () => {
    const fp = projectCareFingerprint(fresh(7));
    expect(fp.rulesVersion).toBe(FINGERPRINT_RULES_VERSION);
    expect(fp.schema).toBe("care-fingerprint/1");
  });

  it("does not mutate the world it projects", () => {
    const world = storyA(fresh(7));
    const before = JSON.stringify(world);
    projectCareFingerprint(world);
    expect(JSON.stringify(world)).toBe(before);
  });

  it("ignores REFUSED events: being told no is not a personality", () => {
    // A command the engine refuses for the creature's state: too tired to explore.
    const base = fresh(7);
    let tired = base;
    for (let i = 0; i < 40; i++) {
      tired = applyCommand(tired, cmd({ kind: "play" }), T0 + R.HATCH_MS + i * 60_000).world;
    }
    const refused = applyCommand(tired, cmd({ kind: "explore" }), T0 + R.HATCH_MS + 41 * 60_000);
    expect(refused.rejected).not.toBeNull();
    expect(refused.world.events.at(-1)?.kind).toBe("REFUSED");
    const before = projectCareFingerprint(tired);
    const after = projectCareFingerprint(refused.world);
    const axesOf = (fp: { axes: Record<Axis, number> }) => Object.values(fp.axes);
    expect(axesOf(after)).toEqual(axesOf(before));
    // and the refusal is not counted as evidence for any axis
    const refusalSeq = refused.world.events.at(-1)!.seq;
    expect(after.evidence.some((e) => e.eventId === refusalSeq)).toBe(false);
  });
});
