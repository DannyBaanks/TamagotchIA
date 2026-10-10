import { projectCareFingerprint } from "../src/engine/fingerprint";
import { buildComparison, demoTraits, upbringingA, upbringingB, DEMO_T0 } from "../src/ui/abDemo";

describe("the A/B demo scene", () => {
  it("F02 · two creatures from the same seed end up different, by care alone", () => {
    const { a, b } = buildComparison();

    // Same species and same seed: they were born identical.
    expect(a.world.creature.seed).toBe(b.world.creature.seed);
    expect(a.world.creature.species).toBe(b.world.creature.species);

    const fa = projectCareFingerprint(a.world);
    const fb = projectCareFingerprint(b.world);
    expect(fa.axes).not.toEqual(fb.axes);
  });

  it("each side shows the traits its own upbringing produced", () => {
    const { a, b } = buildComparison();
    const traitsA = demoTraits(a).map((r) => r.axis);
    const traitsB = demoTraits(b).map((r) => r.axis);

    expect(traitsA).toContain("affection");
    expect(traitsB.some((axis) => axis === "curiosity" || axis === "playfulness")).toBe(true);
  });

  it("is reproducible: running it twice gives the same two creatures", () => {
    const first = buildComparison();
    const second = buildComparison();
    expect(JSON.stringify(first.a.world.creature)).toBe(JSON.stringify(second.a.world.creature));
    expect(JSON.stringify(first.b.world.creature)).toBe(JSON.stringify(second.b.world.creature));
    expect(demoTraits(first.a)).toEqual(demoTraits(second.a));
    expect(demoTraits(first.b)).toEqual(demoTraits(second.b));
  });

  it("F11 · never writes to any store: it is pure engine work", () => {
    // The module takes no store and reaches for no localStorage. If it did, this
    // test would fail on the first access in a Node environment.
    expect(typeof globalThis.localStorage).toBe("undefined");
    expect(() => buildComparison()).not.toThrow();
  });

  it("labels the clock honestly instead of pretending real days passed", () => {
    const { clockNote, a } = buildComparison();
    expect(clockNote).toMatch(/demostración|simulad/i);
    // every event of the demo lives inside the simulated window, on the demo clock
    const last = a.world.events.at(-1)!;
    expect(last.at).toBeGreaterThanOrEqual(DEMO_T0);
    expect(last.at - DEMO_T0).toBeLessThan(24 * 3_600_000);
  });

  it("does not claim a trait that has no events behind it", () => {
    for (const creature of [upbringingA(), upbringingB()]) {
      const fp = projectCareFingerprint(creature);
      for (const reason of demoTraits({ title: "", blurb: "", world: creature })) {
        expect(reason.events).toBeGreaterThanOrEqual(2);
        expect(fp.evidence.some((e) => e.axis === reason.axis)).toBe(true);
      }
    }
  });
});
