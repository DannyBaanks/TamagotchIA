import { applyCommand, type Command } from "../src/engine/commands";
import { dominantReasons, projectCareFingerprint } from "../src/engine/fingerprint";
import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import type { World } from "../src/engine/types";
import { createWorld } from "../src/engine/world";
import { identityDigest, proveVoiceSwap } from "../src/persona/independence";

const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);
let n = 0;
const cmd = (c: Omit<Command, "id"> & Record<string, unknown>): Command => ({ id: `i${++n}`, ...c }) as Command;

/** A creature with a real history, so the identity has something to preserve. */
function raised(seed = 7): World {
  let w = simulateElapsed(createWorld("Mochi", "malbolge-cat", T0, seed), T0 + R.HATCH_MS);
  for (let s = 0; s < 2; s++) {
    const b = T0 + R.HATCH_MS + s * 6 * R.HOUR;
    w = applyCommand(w, cmd({ kind: "pet" }), b + R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "explore" }), b + 2 * R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "sleep" }), b + 3 * R.MINUTE).world;
    w = applyCommand(w, cmd({ kind: "wake" }), b + 3 * R.HOUR).world;
  }
  return w;
}

describe("identity is not the model", () => {
  it("F03 · changing the voice does not change the identity", () => {
    const world = raised();
    const swap = proveVoiceSwap(world, "sin IA", "otro-proveedor", (provider) => ({
      // Two very different voices: the words may differ, the identity may not.
      speech: provider === "sin IA" ? "Mmm, qué rico" : "Saludos, soy una criatura de bolsillo",
    }));

    expect(swap.identityPreserved).toBe(true);
    expect(swap.before).toBe(swap.after);
  });

  it("F03 · a provider that fails changes nothing either", () => {
    const world = raised();
    const before = identityDigest(world);
    // A failing provider is the same as a change of voice: the engine already moved on.
    try {
      proveVoiceSwap(world, "rompe", "sin IA", () => {
        throw new Error("provider down");
      });
    } catch {
      /* the app falls back to the local voice; the world is untouched */
    }
    expect(identityDigest(world).digest).toBe(before.digest);
  });

  it("the digest covers the care history, so a different upbringing is visible", () => {
    let a = raised();
    const b = raised();
    expect(identityDigest(a).digest).toBe(identityDigest(b).digest);

    // One more real care event must change the canonical digest.
    a = applyCommand(a, cmd({ kind: "pet" }), T0 + R.HATCH_MS + 20 * R.HOUR).world;
    expect(identityDigest(a).digest).not.toBe(identityDigest(b).digest);
  });

  it("a shuffled event array does not fake a new identity", () => {
    const world = raised();
    const before = identityDigest(world);
    const shuffled: World = { ...world, events: [...world.events].reverse() };
    expect(identityDigest(shuffled).digest).toBe(before.digest);
  });

  it("the digest reports what it covers, so the claim can be audited", () => {
    const info = identityDigest(raised());
    expect(info.schema).toBe("creature-identity/1");
    expect(info.components).toContain("careFingerprint");
    expect(info.components).toContain("events");
    expect(info.digest).toMatch(/^id-[0-9a-f]{8}$/);
    expect(info.fingerprint).toMatch(/^fp-[0-9a-f]{8}$/);
  });

  it("does not mutate the world it digests", () => {
    const world = raised();
    const snapshot = JSON.stringify(world);
    identityDigest(world);
    expect(JSON.stringify(world)).toBe(snapshot);
  });

  it("the care fingerprint survives a save/restore round trip", () => {
    const world = raised();
    const restored = JSON.parse(JSON.stringify(world)) as World;
    expect(identityDigest(restored).digest).toBe(identityDigest(world).digest);
    expect(dominantReasons(projectCareFingerprint(restored))).toEqual(
      dominantReasons(projectCareFingerprint(world)),
    );
  });
});
