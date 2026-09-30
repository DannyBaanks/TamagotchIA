import example from "./fixtures/context-box.example.json";
import { CONTEXT_BOX_SCHEMA, GUARDRAILS, LIMITS, containsSecret, validateContextBox } from "../src/persona/contextBox";

const minimal = () => ({
  schema: CONTEXT_BOX_SCHEMA,
  generated_at: 1_790_791_800_000,
  identity: { id: "c-1", name: "Malbolgato" },
  canonical_state: { hunger: 41, sick: false },
  guardrails: { ...GUARDRAILS },
});

describe("Context Box v1", () => {
  it("accepts a minimal box and the life packet's example", () => {
    expect(validateContextBox(minimal()).ok).toBe(true);
    // The packet example allows network for remote brains; ours never grants it.
    const packet = structuredClone(example) as Record<string, any>;
    packet.guardrails.may_access_network = false;
    expect(validateContextBox(packet)).toMatchObject({ ok: true });
  });

  it("guardrails never grant anything, and a box that tries is rejected", () => {
    expect(Object.isFrozen(GUARDRAILS)).toBe(true);
    for (const key of ["may_modify_game_state", "may_use_tools", "may_access_files", "may_access_network"] as const) {
      const box = minimal() as Record<string, any>;
      box.guardrails[key] = true;
      expect(validateContextBox(box)).toMatchObject({ ok: false });
    }
  });

  it("fails closed on unknown fields, wrong schema and oversized lists", () => {
    expect(validateContextBox({ ...minimal(), new_hunger: 100 })).toMatchObject({ ok: false });
    expect(validateContextBox({ ...minimal(), schema: "tamagotchia.context-box.v2" })).toMatchObject({ ok: false });
    expect(validateContextBox({ ...minimal(), open_threads: Array(LIMITS.open_threads + 1).fill({}) })).toMatchObject({ ok: false });
    expect(validateContextBox({ ...minimal(), identity: "Malbolgato" })).toMatchObject({ ok: false });
    expect(validateContextBox(null)).toMatchObject({ ok: false });
  });

  it("rejects anything shaped like a credential, wherever it hides", () => {
    const leaked = { ...minimal(), conversation_digest: { summary: "mi clave es sk-or-v1-abcdefghijklmnopqrstuvwxyz0123" } };
    expect(containsSecret(leaked)).toBe(true);
    expect(validateContextBox(leaked)).toMatchObject({ ok: false, error: "contiene algo con forma de credencial" });
    expect(containsSecret({ note: "nvapi-AbCdEfGhIjKlMnOpQrStUv" })).toBe(true);
    expect(containsSecret({ note: "Pensé que ya no ibas a volver. ¿Jugamos?" })).toBe(false);
  });
});
