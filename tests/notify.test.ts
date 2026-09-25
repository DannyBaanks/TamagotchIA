import { forecast } from "../src/engine/forecast";
import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import type { Creature, World } from "../src/engine/types";
import { createWorld } from "../src/engine/world";
import { DEFAULT_PREFS, EMPTY_STATE, decide, inQuietHours, type NotifyPrefs, type NotifyState } from "../src/notify/alerts";

// local-time dates, because quiet hours are local
const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m).getTime();
const ON: NotifyPrefs = { ...DEFAULT_PREFS, enabled: true };

function baby(now = at(12)): World {
  return simulateElapsed(createWorld("TontoPT", "malbolge-cat", now - R.HATCH_MS, 11), now);
}

function withStats(c: Creature, stats: Partial<Creature["stats"]>, extra: Partial<Creature> = {}): Creature {
  return { ...c, ...extra, stats: { ...c.stats, ...stats } };
}

describe("forecast", () => {
  it("predicts hunger at the same step the real simulation reaches it, without touching the world", () => {
    const w = baby();
    const before = structuredClone(w);
    const hungry = forecast(w, at(12)).find((f) => f.kind === "hungry");
    expect(w).toEqual(before);
    expect(hungry).toBeDefined();
    const justBefore = simulateElapsed(w, hungry!.at - R.STEP_MS).creature.stats.hunger;
    const atAlert = simulateElapsed(w, hungry!.at).creature.stats.hunger;
    expect(justBefore).toBeLessThan(75);
    expect(atAlert).toBeGreaterThanOrEqual(75);
  });

  it("predicts the exact hatch time of an egg", () => {
    const egg = createWorld("TontoPT", "malbolge-cat", at(12), 1);
    expect(forecast(egg, at(12))[0]).toEqual({ kind: "hatch", at: at(12) + R.HATCH_MS });
  });

  it("predicts the wake-up of a sleeping creature", () => {
    const w = baby();
    w.creature.asleep = true;
    w.creature.stats.energy = 50;
    const wake = forecast(w, at(12)).find((f) => f.kind === "awake")!;
    // 50 energy at 15/h is 3h20m of sleep, rounded up to the next 5-minute step
    expect(wake.at).toBe(at(15, 20));
  });

  it("does not announce what is already true now", () => {
    const w = baby();
    w.creature.stats.hunger = 90;
    expect(forecast(w, at(12)).some((f) => f.kind === "hungry")).toBe(false);
  });
});

describe("quiet hours", () => {
  it("wraps around midnight", () => {
    expect(inQuietHours(at(23), ON)).toBe(true);
    expect(inQuietHours(at(3), ON)).toBe(true);
    expect(inQuietHours(at(8), ON), "quiet ends at 8").toBe(false);
    expect(inQuietHours(at(21, 59), ON)).toBe(false);
  });
});

describe("decide", () => {
  const c = () => baby().creature;
  const settle = (creature: Creature, now: number, state: NotifyState = EMPTY_STATE) => decide(state, creature, now, ON, true).next;

  it("says nothing when disabled or while the app is on screen", () => {
    const hungry = withStats(c(), { hunger: 90 });
    expect(decide(EMPTY_STATE, hungry, at(12), DEFAULT_PREFS, false).send).toEqual([]);
    const seen = decide(EMPTY_STATE, hungry, at(12), ON, true);
    expect(seen.send).toEqual([]);
    expect(seen.next.pending).toEqual([]);
  });

  it("announces a need once when it starts, not every minute it lasts", () => {
    const s0 = settle(c(), at(12));
    const first = decide(s0, withStats(c(), { hunger: 80 }), at(12, 5), ON, false);
    expect(first.send.map((a) => a.title)).toEqual(["🍙 TontoPT tiene hambre"]);
    const again = decide(first.next, withStats(c(), { hunger: 85 }), at(13), ON, false);
    expect(again.send).toEqual([]);
  });

  it("announces the same need again in a new episode", () => {
    let s = settle(c(), at(12));
    s = decide(s, withStats(c(), { hunger: 80 }), at(12, 5), ON, false).next;
    s = decide(s, withStats(c(), { hunger: 10 }), at(13), ON, false).next; // fed
    expect(decide(s, withStats(c(), { hunger: 80 }), at(18), ON, false).send[0]?.kind).toBe("hungry");
  });

  it("holds alerts during quiet hours and delivers them when quiet ends, if still true", () => {
    let s = settle(c(), at(21));
    const night = decide(s, withStats(c(), { hunger: 80 }), at(23), ON, false);
    expect(night.send).toEqual([]);
    expect(night.next.pending).toEqual(["hungry"]);
    s = night.next;
    expect(decide(s, withStats(c(), { hunger: 95 }), at(8), ON, false).send[0]?.kind).toBe("hungry");
  });

  it("drops a held alert that stopped being true", () => {
    let s = settle(c(), at(21));
    s = decide(s, withStats(c(), { hunger: 80 }), at(23), ON, false).next;
    expect(decide(s, withStats(c(), { hunger: 5 }), at(8), ON, false).send).toEqual([]);
  });

  it("sends one alert per gap, most urgent first", () => {
    const s = settle(c(), at(12));
    const both = withStats(c(), { hunger: 90 }, { sick: true });
    const first = decide(s, both, at(12, 5), ON, false);
    expect(first.send[0]?.kind).toBe("sick");
    expect(decide(first.next, both, at(12, 10), ON, false).send).toEqual([]);
    expect(decide(first.next, both, at(12, 30), ON, false).send[0]?.kind).toBe("hungry");
  });

  it("announces a hatch, and a hatch is not also a wake-up", () => {
    const egg = createWorld("TontoPT", "malbolge-cat", at(12), 1).creature;
    const s = settle(egg, at(12));
    const out = decide(s, c(), at(12, 2), ON, false);
    expect(out.send.map((a) => a.kind)).toEqual(["hatch"]);
    expect(out.next.pending).toEqual([]);
  });

  it("announces a wake-up after sleep", () => {
    const s = settle(withStats(c(), {}, { asleep: true }), at(12));
    expect(decide(s, withStats(c(), {}, { asleep: false }), at(15), ON, false).send[0]?.title).toBe("☀️ TontoPT ya despertó");
  });
});
