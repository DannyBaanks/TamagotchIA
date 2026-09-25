import { design, correction } from "../src/avatar/designer";
import { asText, compile, fingerprint } from "../src/avatar/render";
import { ACCESSORIES, BODIES, COLOR_NAMES, EARS, ERAS, EYES, MOUTHS, PATTERNS, POSES, TAILS, describe as words, parseSpec, type PartsSpec } from "../src/avatar/spec";
import { loadAvatar, saveAvatar, AVATAR_KEY } from "../src/avatar/store";
import type { ChatMessage, ChatModel } from "../src/persona/providers";

class ScriptedModel implements ChatModel {
  readonly name = "guion";
  readonly seen: ChatMessage[][] = [];
  constructor(private readonly answers: Array<string | Error>) {}
  async chat(messages: ChatMessage[]): Promise<string> {
    this.seen.push(messages.map((m) => ({ ...m })));
    const next = this.answers.shift();
    if (next === undefined) throw new Error("sin respuestas");
    if (next instanceof Error) throw next;
    return next;
  }
}

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

const cat: PartsSpec = {
  spec: "criatura/1", era: "16bit", kind: "partes", body: "gato", ears: "gato", eyes: "grandes", mouth: "gato", tail: "gato",
  pattern: "pancita", accessory: "moño", color: "naranja", accent: "crema", accessory_color: "rojo",
};

describe("spec", () => {
  it("accepts a full parts spec and fills missing fields with defaults", () => {
    expect(parseSpec(JSON.stringify(cat))).toMatchObject({ ok: true, spec: cat });
    const partial = parseSpec('{"body":"dino","color":"verde"}', "8bit");
    expect(partial).toMatchObject({ ok: true, spec: { era: "8bit", body: "dino", color: "verde", ears: "gato" } });
  });

  it("finds the JSON inside prose and code fences", () => {
    expect(parseSpec('Claro! ```json\n{"body":"pajaro"}\n``` listo').ok).toBe(true);
  });

  it("is case and accent tolerant but otherwise closed", () => {
    expect(parseSpec('{"accessory":"MONO","body":"Pájaro"}')).toMatchObject({ ok: true, spec: { accessory: "moño", body: "pajaro" } });
    const bad = parseSpec('{"ears":"alas"}');
    expect(bad).toMatchObject({ ok: false, error: { code: "INVALID_ENUM", field: "ears", value: "alas", available: [...EARS] } });
  });

  it("rejects free drawings with wrong sizes, unknown characters or too many colors", () => {
    const row = ".".repeat(16);
    const grid = Array.from({ length: 16 }, () => row);
    const ok = { era: "8bit", palette: { a: "#000000" }, poses: { idle: [grid] } };
    expect(parseSpec(ok)).toMatchObject({ ok: true, spec: { kind: "pixeles" } });
    expect(parseSpec({ ...ok, poses: { idle: [grid.slice(4)] } })).toMatchObject({ ok: false, error: { code: "BAD_GRID", field: "poses.idle[0]" } });
    expect(parseSpec({ ...ok, poses: { idle: [[...grid.slice(2), "a".repeat(20)]] } })).toMatchObject({ ok: false, error: { field: "poses.idle[0] fila 14" } });
    // near misses (a model's usual miscount) are fixed and reported
    const near = parseSpec({ ...ok, poses: { idle: [[...grid.slice(1).map((r, i) => (i === 3 ? r + "aa" : r))]] } });
    expect(near).toMatchObject({ ok: true, warnings: ["poses.idle[0]: 15 filas ajustadas a 16", "poses.idle[0] fila 3: 18 caracteres ajustados a 16"] });
    const typo = [...grid]; typo[3] = "......x.........";
    expect(parseSpec({ ...ok, poses: { idle: [typo] } })).toMatchObject({ ok: false, error: { code: "BAD_GRID", field: "poses.idle[0] fila 3 columna 6", value: "x" } });
    expect(parseSpec({ ...ok, palette: { a: "#000000", b: "#111111", c: "#222222", d: "#333333", e: "#444444" } })).toMatchObject({ ok: false, error: { code: "TOO_MANY_COLORS" } });
    expect(parseSpec({ ...ok, era: "lcd", palette: { a: "#000000", b: "#ffffff" } })).toMatchObject({ ok: false, error: { code: "TOO_MANY_COLORS" } });
    expect(parseSpec({ ...ok, poses: { success: [grid] } })).toMatchObject({ ok: false, error: { field: "poses.idle" } });
    expect(parseSpec({ ...ok, poses: { idle: [grid], bailar: [grid] } })).toMatchObject({ ok: false, error: { code: "INVALID_ENUM", field: "poses" } });
  });
});

describe("the player's words", () => {
  it("maps Spanish to the catalog, longest phrase first", () => {
    const d = words("un gatito naranja con orejas de conejo y moño rojo", "8bit");
    expect(d.spec).toMatchObject({ body: "gato", ears: "conejo", accessory: "moño", color: "naranja", accessory_color: "rojo" });
  });
  it("gives a color that follows an accessory or marking to it", () => {
    expect(words("oso café redondo con bufanda roja", "16bit").spec).toMatchObject({ color: "cafe", accessory_color: "rojo", accent: "crema" });
    expect(words("dino verde con manchas amarillas", "16bit").spec).toMatchObject({ body: "dino", tail: "dino", color: "verde", accent: "amarillo" });
  });
  it("never fails: nonsense gives the default creature with a warning", () => {
    const d = words("qwerty asdf", "lcd");
    expect(d.warnings.length).toBe(1);
    expect(parseSpec(d.spec).ok).toBe(true);
  });
});

describe("compiler", () => {
  it("is deterministic: same spec, same pixels", () => {
    expect(fingerprint(compile(cat))).toBe(fingerprint(compile(JSON.parse(JSON.stringify(cat)) as PartsSpec)));
    expect(fingerprint(compile(cat))).not.toBe(fingerprint(compile({ ...cat, accessory: "corona" })));
  });

  it("draws every combination inside the era's limits, with every pose animated", () => {
    let n = 0;
    for (const era of ["lcd", "8bit", "16bit"] as const)
      for (const body of BODIES) for (const ears of EARS) for (const tail of TAILS) {
        // rotate the rest so every value appears without a full cartesian product
        const spec: PartsSpec = { ...cat, era, body, ears, tail, eyes: EYES[n % EYES.length]!, mouth: MOUTHS[n % MOUTHS.length]!,
          pattern: PATTERNS[n % PATTERNS.length]!, accessory: ACCESSORIES[n % ACCESSORIES.length]!, color: COLOR_NAMES[n % COLOR_NAMES.length]!,
          accent: COLOR_NAMES[(n * 5 + 3) % COLOR_NAMES.length]!, accessory_color: COLOR_NAMES[(n * 3 + 1) % COLOR_NAMES.length]! };
        n++;
        const s = compile(spec);
        expect(s.size).toBe(ERAS[era].size);
        expect(s.colors.length - 1).toBeLessThanOrEqual(ERAS[era].maxColors);
        for (const pose of POSES) {
          const { frames, fps } = s.poses[pose];
          expect(frames.length).toBeGreaterThanOrEqual(2);
          expect(fps).toBeGreaterThan(0);
          for (const f of frames) {
            expect(f.px.length).toBe(s.size * s.size);
            expect(f.px.some((v) => v !== 0)).toBe(true);
          }
        }
      }
    expect(n).toBe(3 * BODIES.length * EARS.length * TAILS.length);
  });

  it("keeps the creature standing on the bottom rows", () => {
    const rows = asText(compile({ ...cat, era: "8bit" }), "idle");
    expect(rows[14]).toMatch(/1/);
    expect(rows[0]).toMatch(/^\.+$/);
  });

  it("compiles a free drawing as given, reusing idle for missing poses", () => {
    const grid = Array.from({ length: 16 }, (_, y) => (y === 15 ? "aaaaaaaaaaaaaaaa" : "................"));
    const r = parseSpec({ era: "8bit", palette: { a: "#123456" }, poses: { idle: [grid] } });
    if (!r.ok) throw new Error(r.error.message);
    const s = compile(r.spec);
    expect(s.colors).toEqual([null, "#123456"]);
    expect(asText(s, "waiting")[15]).toBe("1".repeat(16));
  });
});

describe("designer", () => {
  const req = { description: "un pajarito celeste con corona", era: "16bit" as const, mode: "partes" as const, name: "Mochi" };

  it("uses the model's spec when the compiler accepts it", async () => {
    const m = new ScriptedModel([JSON.stringify({ ...cat, body: "pajaro", era: "lcd" })]);
    const d = await design(m, req, 1000);
    expect(d).toMatchObject({ source: "model", problem: null, spec: { body: "pajaro", era: "16bit" } });
    expect(m.seen[0]![0]!.content).toContain("body: redondo | gota");
  });

  it("gives the model one correction with the allowed values", async () => {
    const m = new ScriptedModel(['{"body":"pajaro","ears":"alas"}', '{"body":"pajaro","ears":"ninguna"}']);
    const d = await design(m, req, 1000);
    expect(d).toMatchObject({ source: "model", spec: { ears: "ninguna" } });
    expect(d.attempts.map((a) => a.ok)).toEqual([false, true]);
    const fix = m.seen[1]!.at(-1)!.content;
    expect(fix).toContain("INVALID_ENUM at ears");
    expect(fix).toContain("ninguna, gato, conejo");
  });

  it("falls back to the player's words after two bad answers or a network error", async () => {
    const twice = await design(new ScriptedModel(["no sé dibujar", '{"body":"nube"}']), req, 1000);
    expect(twice).toMatchObject({ source: "words", spec: { body: "pajaro", accessory: "corona", color: "celeste" } });
    expect(twice.problem).toContain("body");
    const offline = await design(new ScriptedModel([new TypeError("Failed to fetch")]), req, 1000);
    expect(offline).toMatchObject({ source: "words" });
    expect(offline.problem).toContain("CORS");
    expect(offline.attempts.length).toBe(1);
  });

  it("without a model it is just the words", async () => {
    expect(await design(null, req, 1000)).toMatchObject({ source: "words", attempts: [] });
  });

  it("correction text names code, field and allowed values", () => {
    expect(correction({ code: "INVALID_ENUM", field: "tail", value: "x", available: ["a", "b"], message: "m" })).toContain("Allowed values for tail: a, b");
  });
});

describe("storage", () => {
  it("round-trips and re-validates what it loads", () => {
    const s = memStore();
    saveAvatar(s, { spec: cat, author: "palabras", prompt: "gato", savedAt: 1 });
    expect(loadAvatar(s)?.spec).toEqual(cat);
    s.setItem(AVATAR_KEY, JSON.stringify({ spec: { ...cat, body: "hackeado" } }));
    expect(loadAvatar(s)).toBeNull();
    saveAvatar(s, null);
    expect(s.m.has(AVATAR_KEY)).toBe(false);
  });
});
