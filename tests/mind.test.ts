import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { compileContextBox } from "../src/persona/compile";
import { personaInput, type PersonaInput } from "../src/persona/contract";
import { remoteMind, type CreatureMind, type MindRequest } from "../src/persona/mind";
import { OpenAICompatibleProvider, speak, type PersonalityProvider } from "../src/persona/providers";

const T0 = Date.UTC(2026, 8, 24, 12);
const world = simulateElapsed(createWorld("Malbolgato", "malbolge-cat", T0, 42), T0 + R.HATCH_MS);
const now = T0 + R.HATCH_MS;
const turn = () => personaInput(world, world.events.at(-1)!, now, "hola");
const box = () => compileContextBox({ world, now, budgetTokens: 2000 }).box;
const good = '{"speech":"Hola, aquí estoy contigo.","emotion":"happy","intent":"comment","animation":"happy","memory_candidate":null}';

describe("CreatureMind", () => {
  it("a remote mind sends only the turn, never the Context Box (until the Interaction Gate)", async () => {
    const seen: PersonaInput[] = [];
    const provider: PersonalityProvider = { name: "spy", react: async (input) => { seen.push(input); return good; } };
    const n = await speak(remoteMind(provider), { turn: turn(), box: box() }, 1, 1000);
    expect(n.source).toBe("model");
    expect(seen).toEqual([turn()]);
    const body = new OpenAICompatibleProvider({ baseUrl: "https://x", model: "m", apiKey: "k" }).body(turn());
    expect(body).not.toMatch(/guardrails|episodic_memories|canonical_state/);
  });

  it("a local mind receives the box and the turn", async () => {
    const got: MindRequest[] = [];
    const local: CreatureMind = { name: "gus", kind: "local", respond: async (r) => { got.push(r); return good; } };
    const n = await speak(local, { turn: turn(), box: box() }, 1, 1000);
    expect(n.source).toBe("model");
    expect(got[0]!.box).toEqual(box());
    expect(got[0]!.turn).toEqual(turn());
  });

  it("whatever the mind does wrong, the local voice answers and nothing else changes", async () => {
    const before = JSON.stringify(world);
    const minds: CreatureMind[] = [
      { name: "bad-json", kind: "local", respond: async () => "hola soy un modelo" },
      { name: "cheater", kind: "local", respond: async () => '{"speech":"Ya te di cien de salud.","emotion":"happy","intent":"comment","animation":"happy","memory_candidate":null,"hunger":0}' },
      { name: "crash", kind: "local", respond: async () => { throw new Error("runtime crashed"); } },
    ];
    for (const mind of minds) {
      const n = await speak(mind, { turn: turn(), box: box() }, 1, 1000);
      expect(["model", "fallback"]).toContain(n.source);
      expect(n.reply).not.toHaveProperty("hunger");
    }
    expect((await speak(minds[0]!, { turn: turn(), box: box() }, 1, 1000)).source).toBe("fallback");
    expect((await speak(minds[2]!, { turn: turn(), box: box() }, 1, 1000)).problem).toBe("runtime crashed");
    expect(JSON.stringify(world)).toBe(before);
  });

  it("swapping the brain does not change who the creature is", () => {
    const a = compileContextBox({ world, now, budgetTokens: 2000, model: { mode: "local", model_id: "smollm2-17b-q4km" } }).box;
    const b = compileContextBox({ world, now, budgetTokens: 2000, model: { mode: "remote", model_id: "nemotron" } }).box;
    const { model_context: _a, ...restA } = a;
    const { model_context: _b, ...restB } = b;
    expect(restA).toEqual(restB);
  });
});
