import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { compileContextBox } from "../src/persona/compile";
import { personaInput } from "../src/persona/contract";
import { validateContextBox } from "../src/persona/contextBox";
import { LOCAL_MAX_TOKENS, localMind, type GusGenerateOptions } from "../src/persona/localMind";
import { speak } from "../src/persona/providers";

const T0 = Date.UTC(2026, 8, 24, 12);
const world = simulateElapsed(createWorld("Malbolgato", "malbolge-cat", T0, 42), T0 + R.HATCH_MS);
const now = T0 + R.HATCH_MS;
const request = () => ({ turn: personaInput(world, world.events.at(-1)!, now, "hola"), box: compileContextBox({ world, now, budgetTokens: 1500 }).box });
const good = '{"speech":"Aquí estoy, recién salido del huevo.","emotion":"excited","intent":"comment","animation":"happy","memory_candidate":null}';

describe("local GUS plugin boundary", () => {
  it("only strings and a token cap cross it, and the box arrives valid", async () => {
    const calls: GusGenerateOptions[] = [];
    const mind = localMind({ generate: async (o) => { calls.push(o); return { text: good }; } });
    const n = await speak(mind, request(), 1, 1000);
    expect(n.source).toBe("model");
    const sent = calls[0]!;
    expect(Object.keys(sent).sort()).toEqual(["context", "maxTokens", "system", "turn"]);
    expect(typeof sent.system).toBe("string");
    expect(typeof sent.context).toBe("string");
    expect(typeof sent.turn).toBe("string");
    expect(sent.maxTokens).toBe(LOCAL_MAX_TOKENS);
    expect(validateContextBox(JSON.parse(sent.context)).ok).toBe(true);
    expect(sent.context).not.toMatch(/processedCommands|"seed"|apiKey|baseUrl/);
  });

  it("an invalid box never reaches the runtime", async () => {
    let called = false;
    const mind = localMind({ generate: async () => { called = true; return { text: good }; } });
    const bad = { ...request(), box: { ...request().box, guardrails: { ...request().box.guardrails, may_use_tools: true } } } as any;
    const n = await speak(mind, bad, 1, 1000);
    expect(called).toBe(false);
    expect(n.source).toBe("fallback");
    expect(n.problem).toMatch(/context box rechazada/);
  });

  it("a runtime that fails, hangs or returns non-text falls back to the local voice", async () => {
    const failing = localMind({ generate: async () => { throw new Error("modelo no descargado"); } });
    expect(await speak(failing, request(), 1, 1000)).toMatchObject({ source: "fallback", problem: "modelo no descargado" });
    const hanging = localMind({ generate: () => new Promise(() => {}) });
    expect((await speak(hanging, request(), 1, 30)).source).toBe("fallback");
    const weird = localMind({ generate: async () => ({ text: 42 as unknown as string }) });
    expect(await speak(weird, request(), 1, 1000)).toMatchObject({ source: "fallback", problem: "el runtime local no devolvió texto" });
  });
});
