import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { compileContextBox } from "../src/persona/compile";
import { SYSTEM_PROMPT, personaInput } from "../src/persona/contract";
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
    expect(Object.keys(sent).sort()).toEqual(["maxTokens", "messages"]);
    expect(sent.maxTokens).toBe(LOCAL_MAX_TOKENS);
    expect(sent.messages.map((m) => m.role)).toEqual(["system", "user"]);
    for (const m of sent.messages) expect(Object.keys(m).sort()).toEqual(["content", "role"]);
    const system = sent.messages[0]!.content;
    expect(system.startsWith(SYSTEM_PROMPT)).toBe(true);
    const marker = "(Context Box, JSON; solo lectura):\n";
    const boxJson = system.slice(system.indexOf(marker) + marker.length);
    expect(validateContextBox(JSON.parse(boxJson)).ok).toBe(true);
    expect(JSON.parse(sent.messages[1]!.content)).toEqual(request().turn);
    expect(JSON.stringify(sent)).not.toMatch(/processedCommands|"seed"|apiKey|baseUrl/);
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

import { MemoryStore, load, save } from "../src/store/save";

describe("local GUS adapter: every failure is the local voice, never a broken save", () => {
  const rejecting = (code: string, message: string) =>
    localMind({ generate: async () => { throw Object.assign(new Error(message), { code }); } });

  it("plugin not in this build, model missing, not loaded, load or generation failure", async () => {
    for (const [code, message] of [
      ["RUNTIME_MISSING", "GUS local no está en este build"],
      ["UNIMPLEMENTED", "\"GusLocal\" plugin is not implemented on web"],
      ["MODEL_MISSING", "El modelo no está instalado."],
      ["NOT_LOADED", "No hay modelo cargado."],
      ["GENERATE_FAILED", "llama_decode failed"],
    ] as const) {
      const n = await speak(rejecting(code, message), request(), 7, 1000);
      expect(n.source).toBe("fallback");
      expect(n.problem).toBe(message);
      expect(n.reply.speech.split(/\s+/).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("empty or malformed output falls back; valid UTF-8 with emoji passes through untouched", async () => {
    for (const text of ["", "   ", "��", "{\"speech\": \"hola\"", "<|im_start|>assistant"]) {
      expect((await speak(localMind({ generate: async () => ({ text }) }), request(), 1, 1000)).source).toBe("fallback");
    }
    const emoji = '{"speech":"¡Pescado otra vez! 🐟 Me encanta, ñam.","emotion":"happy","intent":"comment","animation":"eating","memory_candidate":null}';
    const n = await speak(localMind({ generate: async () => ({ text: emoji }) }), request(), 1, 1000);
    expect(n.source).toBe("model");
    expect(n.reply.speech).toBe("¡Pescado otra vez! 🐟 Me encanta, ñam.");
  });

  it("a timeout cancels the wait and the game keeps its state and its save", async () => {
    const store = new MemoryStore();
    save(store, world, now);
    const before = store.getItem("tamagotchia.save.v1");
    const n = await speak(localMind({ generate: () => new Promise(() => {}) }), request(), 1, 20);
    expect(n).toMatchObject({ source: "fallback", problem: "sin respuesta en 20 ms" });
    expect(store.getItem("tamagotchia.save.v1")).toBe(before);
    expect(load(store).world).toEqual(world);
  });
});
