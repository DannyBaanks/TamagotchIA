import { applyCommand } from "../src/engine/commands";
import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { personaInput, validateReply, type PersonaInput } from "../src/persona/contract";
import { ALL_FALLBACK_LINES, fallbackReply } from "../src/persona/fallback";
import { MockProvider, OpenAICompatibleProvider, narrate } from "../src/persona/providers";

const T0 = Date.UTC(2026, 8, 24, 12);
const good = JSON.stringify({ speech: "Qué rico, gracias por la manzana", emotion: "happy", intent: "comment", animation: "eating", memory_candidate: null });

function input(): PersonaInput {
  const w = simulateElapsed(createWorld("Mochi", "malbolge-cat", T0, 3), T0 + R.HATCH_MS);
  const r = applyCommand(w, { id: "x", kind: "feed", food: "apple" }, w.creature.lastTickAt);
  return personaInput(r.world, r.events.at(-1)!, w.creature.lastTickAt, "hola\u0007 mochi, " + "a".repeat(200));
}

describe("contract", () => {
  it("accepts a well-formed reply", () => {
    expect(validateReply(good)).toMatchObject({ ok: true, reply: { emotion: "happy" } });
  });

  it("repairs once: a reply wrapped in text or a code fence still parses", () => {
    expect(validateReply("```json\n" + good + "\n```").ok).toBe(true);
    expect(validateReply("Claro: " + good).ok).toBe(true);
    expect(validateReply("no json here").ok).toBe(false);
  });

  it.each([
    [{ speech: "hola", emotion: "happy", intent: "comment", animation: "idle" }, "palabras"],
    [{ speech: "uno ".repeat(21), emotion: "happy", intent: "comment", animation: "idle" }, "palabras"],
    [{ speech: "estoy **muy** feliz hoy", emotion: "happy", intent: "comment", animation: "idle" }, "markdown"],
    [{ speech: "como IA no tengo hambre", emotion: "happy", intent: "comment", animation: "idle" }, "asistente"],
    [{ speech: "me siento genial hoy", emotion: "ecstatic", intent: "comment", animation: "idle" }, "emotion"],
    [{ speech: "me siento genial hoy", emotion: "happy", intent: "set_hunger_0", animation: "idle" }, "intent"],
    [{ speech: "me siento genial hoy", emotion: "happy", intent: "comment", animation: "dance" }, "animation"],
  ])("rejects %j (%s)", (reply, reason) => {
    const r = validateReply(JSON.stringify(reply));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(reason);
  });

  it("every local line passes the same contract the model must pass", () => {
    for (const [speech, emotion, animation] of ALL_FALLBACK_LINES) {
      const r = validateReply(JSON.stringify({ speech, emotion, intent: "comment", animation, memory_candidate: null }));
      expect(r.ok, speech).toBe(true);
    }
  });

  it("caps and cleans what the player says before a model sees it", () => {
    const said = input().player_said!;
    expect(said.length).toBeLessThanOrEqual(80);
    expect(said).not.toMatch(/[\u0000-\u001f]/);
  });

  it("the local voice is deterministic", () => {
    expect(fallbackReply(input(), 5)).toEqual(fallbackReply(input(), 5));
  });
});

describe("narrate", () => {
  it("uses the model when its answer is valid", async () => {
    const n = await narrate(new MockProvider([good]), input(), 1, 1000);
    expect(n.source).toBe("model");
    expect(n.reply.speech).toBe("Qué rico, gracias por la manzana");
  });

  it("falls back on an invalid answer, an error, or no provider", async () => {
    expect((await narrate(new MockProvider(['{"speech":"hi"}']), input(), 1, 1000)).source).toBe("fallback");
    const err = await narrate(new MockProvider([new Error("offline")]), input(), 1, 1000);
    expect(err).toMatchObject({ source: "fallback", problem: "offline" });
    expect((await narrate(null, input(), 1, 1000)).problem).toBeNull();
  });

  it("gives up after the timeout instead of hanging the game", async () => {
    const hanging = {
      name: "hang",
      react: (_: PersonaInput, signal: AbortSignal) =>
        new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    };
    const n = await narrate(hanging, input(), 1, 30);
    expect(n).toMatchObject({ source: "fallback", problem: "sin respuesta en 30 ms" });
  });
});

describe("OpenAI-compatible transport", () => {
  it("sends the key only in the Authorization header, to /chat/completions", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: good } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://example.test/v1/", model: "m", apiKey: "sk-secret-123" }, fake);
    const n = await narrate(provider, input(), 1, 1000);
    expect(n.source).toBe("model");
    expect(calls[0]!.url).toBe("https://example.test/v1/chat/completions");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-secret-123");
    expect(String(calls[0]!.init.body)).not.toContain("sk-secret-123");
  });

  it("an HTTP error becomes a fallback with the status, not a crash", async () => {
    const fake = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://example.test/v1", model: "m", apiKey: "k" }, fake);
    expect(await narrate(provider, input(), 1, 1000)).toMatchObject({ source: "fallback", problem: "HTTP 401" });
  });
});
