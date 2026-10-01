import * as R from "../src/engine/rules";
import { simulateElapsed } from "../src/engine/simulation";
import { createWorld } from "../src/engine/world";
import { estimateTokens } from "../src/persona/budget";
import { personaInput, type PersonaInput } from "../src/persona/contract";
import { validateContextBox } from "../src/persona/contextBox";
import { LOCAL_CONTEXT_TOKENS, LOCAL_MAX_TOKENS, composeLocalChat, localMind, type GusGenerateOptions } from "../src/persona/localMind";
import type { CreatureMind, MindRequest } from "../src/persona/mind";
import type { PersonalityProvider } from "../src/persona/providers";
import { LOCAL_REQUIRES_NATIVE, LOCAL_SAFETY_MARGIN_TOKENS, localRequest, routeMind, speakRouted } from "../src/persona/route";
import { MemoryStore } from "../src/store/save";
import { DEFAULT_SETTINGS, SETTINGS_KEY, isModelFileName, loadSettings } from "../src/store/settings";

const T0 = Date.UTC(2026, 8, 24, 12);
const world = simulateElapsed(createWorld("Malbolgato", "malbolge-cat", T0, 42), T0 + R.HATCH_MS);
const now = T0 + R.HATCH_MS;
const turn = () => personaInput(world, world.events.at(-1)!, now, "hola");
const good = '{"speech":"Hola, aquí estoy contigo.","emotion":"happy","intent":"comment","animation":"happy","memory_candidate":null}';
const MODEL = "qwen2.5-0.5b-instruct-q4_k_m.gguf";

function spyRemote() {
  const seen: PersonaInput[] = [];
  const provider: PersonalityProvider = { name: "remote-spy", react: async (input) => { seen.push(input); return good; } };
  return { provider, seen };
}
function spyLocal() {
  const got: MindRequest[] = [];
  const mind: CreatureMind = { name: "gus", kind: "local", respond: async (r) => { got.push(r); return good; } };
  return { mind, got };
}

describe("routing: which brain speaks, and what it may see", () => {
  it("GUS local in the PWA is the local voice plus a notice, never a silent switch to remote", async () => {
    const remote = spyRemote();
    const route = routeMind({ localEnabled: true, localModel: MODEL, local: () => null, remote: remote.provider });
    expect(route).toEqual({ kind: "fallback", notice: LOCAL_REQUIRES_NATIVE });
    const n = await speakRouted(route, world, turn(), now, 1, 1000);
    expect(n.source).toBe("fallback");
    expect(n.problem).toBe(LOCAL_REQUIRES_NATIVE);
    expect(n.reply.speech.length).toBeGreaterThan(0);
    expect(remote.seen).toEqual([]);
  });

  it("GUS local without a model file asks for one and does not call anything", () => {
    const remote = spyRemote();
    let asked = false;
    const route = routeMind({ localEnabled: true, localModel: "  ", local: () => { asked = true; return spyLocal().mind; }, remote: remote.provider });
    expect(route.kind).toBe("fallback");
    expect(asked).toBe(false);
  });

  it("GUS local in the app gets the compiled box; the remote provider is not called", async () => {
    const remote = spyRemote();
    const local = spyLocal();
    const route = routeMind({ localEnabled: true, localModel: MODEL, local: () => local.mind, remote: remote.provider });
    expect(route.kind).toBe("local");
    const n = await speakRouted(route, world, turn(), now, 1, 1000);
    expect(n.source).toBe("model");
    expect(remote.seen).toEqual([]);
    expect(local.got).toHaveLength(1);
    expect(validateContextBox(local.got[0]!.box).ok).toBe(true);
    expect(local.got[0]!.box!.model_context).toMatchObject({ mode: "local", model_id: MODEL });
  });

  it("remote stays exactly as before: the turn only, no box", async () => {
    const remote = spyRemote();
    const route = routeMind({ localEnabled: false, localModel: MODEL, local: () => spyLocal().mind, remote: remote.provider });
    expect(route.kind).toBe("remote");
    await speakRouted(route, world, turn(), now, 1, 1000);
    expect(remote.seen).toEqual([turn()]);
  });

  it("nothing configured is the local voice without a notice", async () => {
    const route = routeMind({ localEnabled: false, localModel: "", local: () => null, remote: null });
    expect(route).toEqual({ kind: "fallback", notice: null });
    expect((await speakRouted(route, world, turn(), now, 1, 1000)).problem).toBeNull();
  });
});

describe("the local request fits the model's window", () => {
  it("box + system + turn + reply + margin stay inside the context (by the estimate)", () => {
    const request = localRequest(world, turn(), now, MODEL)!;
    expect(request).not.toBeNull();
    const [system, user] = composeLocalChat(JSON.stringify(request.box), JSON.stringify(request.turn));
    const used = estimateTokens(system!.content) + estimateTokens(user!.content);
    expect(used + LOCAL_MAX_TOKENS + LOCAL_SAFETY_MARGIN_TOKENS).toBeLessThanOrEqual(LOCAL_CONTEXT_TOKENS + 1);
  });

  it("a turn too large for the window means no model call, not an overflow", async () => {
    const huge = { ...turn(), player_said: "x".repeat(6000) } as PersonaInput;
    expect(localRequest(world, huge, now, MODEL)).toBeNull();
    const local = spyLocal();
    const n = await speakRouted({ kind: "local", mind: local.mind, model: MODEL }, world, huge, now, 1, 1000);
    expect(local.got).toEqual([]);
    expect(n.source).toBe("fallback");
    expect(n.problem).toMatch(/no cabe/);
  });
});

describe("the local mind loads its model once, on first use", () => {
  it("load → generate; the next turn does not reload", async () => {
    const calls: string[] = [];
    const mind = localMind({
      load: async ({ model, contextTokens }) => { calls.push(`load ${model} ${contextTokens}`); return { model }; },
      generate: async (_o: GusGenerateOptions) => { calls.push("generate"); return { text: good }; },
    }, { model: MODEL });
    const request = localRequest(world, turn(), now, MODEL)!;
    const ctl = new AbortController();
    await mind.respond(request, ctl.signal);
    await mind.respond(request, ctl.signal);
    expect(calls).toEqual([`load ${MODEL} ${LOCAL_CONTEXT_TOKENS}`, "generate", "generate"]);
  });

  it("a failed load (model not installed) is retried on the next turn", async () => {
    let installed = false;
    let loads = 0;
    const mind = localMind({
      load: async ({ model }) => { loads++; if (!installed) throw Object.assign(new Error("El modelo no está instalado."), { code: "MODEL_MISSING" }); return { model }; },
      generate: async () => ({ text: good }),
    }, { model: MODEL });
    const request = localRequest(world, turn(), now, MODEL)!;
    await expect(mind.respond(request, new AbortController().signal)).rejects.toThrow("El modelo no está instalado.");
    installed = true;
    await expect(mind.respond(request, new AbortController().signal)).resolves.toBe(good);
    expect(loads).toBe(2);
  });
});

describe("GUS local settings", () => {
  it("old settings load with GUS local off", () => {
    const store = new MemoryStore();
    store.setItem(SETTINGS_KEY, JSON.stringify({ enabled: true, baseUrl: "https://x/v1", model: "m", timeoutMs: 5000 }));
    expect(loadSettings(store)).toMatchObject({ enabled: true, localEnabled: false, localModel: "" });
    expect(DEFAULT_SETTINGS.localEnabled).toBe(false);
  });

  it("the model is a bare .gguf file name, never a path", () => {
    expect(isModelFileName(MODEL)).toBe(true);
    for (const bad of ["", "../x.gguf", "/data/x.gguf", "a\\b.gguf", ".hidden.gguf", "model.bin"]) expect(isModelFileName(bad)).toBe(false);
    const store = new MemoryStore();
    store.setItem(SETTINGS_KEY, JSON.stringify({ localEnabled: true, localModel: "../../etc/passwd.gguf" }));
    expect(loadSettings(store)).toMatchObject({ localEnabled: true, localModel: "" });
  });
});

import { readFileSync } from "node:fs";
import { KNOWN_MODELS, describeImport, knownModelBySha } from "../src/persona/knownModels";

describe("known models", () => {
  it("match the model the native smoke actually ran (native/gus-smoke/model.json)", () => {
    const smoke = JSON.parse(readFileSync(new URL("../native/gus-smoke/model.json", import.meta.url), "utf8"));
    const known = KNOWN_MODELS.find((m) => m.id === smoke.id)!;
    expect(known).toMatchObject({ filename: smoke.filename, bytes: smoke.bytes, sha256: smoke.sha256 });
    expect(known.source).toContain(smoke.revision);
    expect(isModelFileName(known.filename)).toBe(true);
  });

  it("an import is vouched for only by hash, and never as 'works on this phone'", () => {
    const k = KNOWN_MODELS[0]!;
    expect(knownModelBySha(k.sha256.toUpperCase())).toBe(k);
    const ok = describeImport({ model: "renamed.gguf", bytes: k.bytes, sha256: k.sha256 });
    expect(ok).toMatch(/probó el CI/);
    expect(ok).toMatch(/todavía no está demostrado/);
    const other = describeImport({ model: k.filename, bytes: k.bytes, sha256: "0".repeat(64) });
    expect(other).toMatch(/No es un modelo probado/);
  });
});
