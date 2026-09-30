import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { contextBudget, estimateTokens } from "../src/persona/budget";
import { SYSTEM_PROMPT, personaInput } from "../src/persona/contract";

describe("ContextBudget", () => {
  it("is total minus reserved output, system and turn", () => {
    const b = contextBudget({ totalTokens: 2048, reservedOutputTokens: 160, systemTokens: 440, turnTokens: 60 });
    expect(b.availableTokens).toBe(1388);
    expect(b.fits).toBe(true);
  });

  it("never goes negative and says when the fixed parts alone overflow", () => {
    const b = contextBudget({ totalTokens: 2048, reservedOutputTokens: 256, systemTokens: 1700, turnTokens: 200 });
    expect(b.availableTokens).toBe(0);
    expect(b.fits).toBe(false);
  });

  it("treats nonsense input as zero instead of inventing room", () => {
    const b = contextBudget({ totalTokens: Number.NaN, reservedOutputTokens: -5, systemTokens: Infinity, turnTokens: 10.9 });
    expect(b).toMatchObject({ totalTokens: 0, reservedOutputTokens: 0, systemTokens: 0, turnTokens: 10, availableTokens: 0, fits: false });
  });

  it("estimates pessimistically and counts characters, not UTF-16 units", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("hola")).toBe(2);
    expect(estimateTokens("🐱🐱🐱🐱🐱")).toBe(2);
    const text = "¿Quién fue presidente de México en el año 2000?";
    expect(estimateTokens(text)).toBeGreaterThanOrEqual(Math.ceil(text.length / 4));
  });

  it("today's prompt fits a 2048-token local model with the reply reserved", () => {
    const T0 = Date.UTC(2026, 8, 24, 12);
    const world = simulateElapsed(createWorld("Malbolgato", "malbolge-cat", T0, 42), T0 + R.HATCH_MS);
    const turn = JSON.stringify(personaInput(world, world.events.at(-1)!, T0 + R.HATCH_MS, "hola, ¿cómo estás hoy?"));
    const b = contextBudget({ totalTokens: 2048, reservedOutputTokens: 160, systemTokens: estimateTokens(SYSTEM_PROMPT), turnTokens: estimateTokens(turn) });
    expect(b.fits).toBe(true);
    expect(b.availableTokens).toBeGreaterThan(800);
  });
});
