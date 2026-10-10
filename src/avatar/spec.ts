/**
 * criatura/1 — the look of a creature as data. Same idea as Munder's avatar-spec: a model
 * (or the player's own words) turns an intention into a spec; the compiler in render.ts
 * turns the spec into pixels. Nobody but the compiler paints, so a weak model can still
 * design a creature: it only has to pick words from closed lists.
 *
 * Two ways to write one:
 *  - "partes": pick a body, ears, eyes... from the catalogs below. Always the same sprite.
 *  - "pixeles": free drawing for models that can hold a grid. Checked cell by cell.
 *
 * Every rejection says which field, what it got and what it accepts, so the model can fix
 * its own answer in one more try (the INVALID_ENUM loop).
 */
import type { Pose } from "../engine/derived";

export const SPEC_ID = "criatura/1";
export const POSES: Pose[] = ["idle", "thinking", "working", "success", "error", "waiting"];

export interface Era {
  id: EraId;
  label: string;
  blurb: string;
  /** Pixels per side. */
  size: number;
  /** Colors a free drawing may use, not counting transparent. */
  maxColors: number;
}

export type EraId = "lcd" | "8bit" | "16bit";

export const ERAS: Record<EraId, Era> = {
  lcd: { id: "lcd", label: "Pantallita LCD", blurb: "Como el llavero de 1996: 16×16, un solo tono de tinta.", size: 16, maxColors: 1 },
  "8bit": { id: "8bit", label: "8 bits", blurb: "Estilo Game Boy: 16×16 y 4 tonos.", size: 16, maxColors: 4 },
  "16bit": { id: "16bit", label: "16 bits", blurb: "Estilo Super: 32×32, sombras y brillos, hasta 15 colores.", size: 32, maxColors: 15 },
};
export const ERA_IDS = Object.keys(ERAS) as EraId[];

// ------------------------------------------------------------------ closed catalogs
export const BODIES = ["redondo", "gota", "alto", "gato", "pajaro", "dino", "cangrejo"] as const;
export const EARS = ["ninguna", "gato", "conejo", "oso", "cuernos", "antena"] as const;
export const EYES = ["puntos", "grandes", "dormilones", "visor"] as const;
export const MOUTHS = ["sonrisa", "gato", "pico", "colmillos"] as const;
export const TAILS = ["ninguna", "gato", "esponjada", "dino", "rayo"] as const;
export const PATTERNS = ["ninguno", "manchas", "rayas", "pancita"] as const;
export const ACCESSORIES = ["ninguno", "moño", "sombrero", "corona", "lentes", "bufanda"] as const;

export const COLORS: Record<string, string> = {
  // coral and cian are the crab's own palette (measured from the claw logo)
  coral: "#ce3434", cian: "#00dec6",
  rojo: "#e8483f", naranja: "#f08a2c", amarillo: "#f5cf3a", lima: "#b4e33d", verde: "#4fb86a",
  celeste: "#5cc7e8", azul: "#3f6fd8", morado: "#8a5cd6", rosa: "#f28bb8", cafe: "#9a6a44",
  crema: "#f4e2c0", blanco: "#f4f4f0", gris: "#9aa0a8", negro: "#3a3a44",
};
export const COLOR_NAMES = Object.keys(COLORS);

export type Body = (typeof BODIES)[number];
export type Ears = (typeof EARS)[number];
export type Eyes = (typeof EYES)[number];
export type Mouth = (typeof MOUTHS)[number];
export type Tail = (typeof TAILS)[number];
export type Pattern = (typeof PATTERNS)[number];
export type Accessory = (typeof ACCESSORIES)[number];

export interface PartsSpec {
  spec: typeof SPEC_ID;
  era: EraId;
  kind: "partes";
  body: Body;
  ears: Ears;
  eyes: Eyes;
  mouth: Mouth;
  tail: Tail;
  pattern: Pattern;
  accessory: Accessory;
  color: string;
  accent: string;
  accessory_color: string;
}

/** A free drawing: one character per pixel, "." is transparent. Poses left out reuse idle. */
export interface PixelSpec {
  spec: typeof SPEC_ID;
  era: EraId;
  kind: "pixeles";
  palette: Record<string, string>;
  poses: Partial<Record<Pose, string[][]>>;
}

export type CreatureSpec = PartsSpec | PixelSpec;

export interface SpecError {
  code: "INVALID_JSON" | "INVALID_ENUM" | "MISSING_FIELD" | "BAD_GRID" | "TOO_MANY_COLORS" | "BAD_COLOR";
  field: string;
  value?: unknown;
  available?: string[];
  message: string;
}

export type SpecResult = { ok: true; spec: CreatureSpec; warnings: string[] } | { ok: false; error: SpecError };

export const PARTS_DEFAULTS: Omit<PartsSpec, "era"> = {
  spec: SPEC_ID, kind: "partes", body: "redondo", ears: "gato", eyes: "grandes", mouth: "gato",
  tail: "gato", pattern: "pancita", accessory: "ninguno", color: "naranja", accent: "crema", accessory_color: "rojo",
};

const MAX_FRAMES = 4;
/** How far off a free drawing may be and still be fixed instead of rejected. */
const SLACK = 2;

function enumError(field: string, value: unknown, available: readonly string[]): SpecResult {
  return { ok: false, error: { code: "INVALID_ENUM", field, value, available: [...available], message: `«${String(value)}» no está en la lista de ${field}` } };
}

/** Lower-case, no accents: "Moño" and "mono" should not be two different answers. */
export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function pickEnum(field: string, value: unknown, list: readonly string[]): string | SpecResult {
  if (typeof value !== "string") return enumError(field, value, list);
  const hit = list.find((x) => fold(x) === fold(value));
  return hit ?? enumError(field, value, list);
}

/** A model wraps JSON in prose or ``` fences more often than not; take the first object. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no hay ningún objeto { … }");
  return JSON.parse(text.slice(start, end + 1));
}

export function parseSpec(input: string | unknown, fallbackEra: EraId = "8bit"): SpecResult {
  let raw: unknown;
  try {
    raw = typeof input === "string" ? extractJson(input) : input;
  } catch (e) {
    return { ok: false, error: { code: "INVALID_JSON", field: "(todo)", message: `no es JSON: ${e instanceof Error ? e.message : String(e)}` } };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: { code: "INVALID_JSON", field: "(todo)", message: "se esperaba un objeto" } };
  const o = raw as Record<string, unknown>;
  const warnings: string[] = [];
  const era = o.era === undefined ? fallbackEra : pickEnum("era", o.era, ERA_IDS);
  if (typeof era !== "string") return era;
  if (o.spec !== undefined && o.spec !== SPEC_ID) warnings.push(`spec «${String(o.spec)}» ignorado; se usa ${SPEC_ID}`);
  const kind = o.kind ?? (o.palette || o.poses ? "pixeles" : "partes");
  if (kind === "pixeles") return parsePixels(o, era as EraId, warnings);
  if (kind !== "partes") return enumError("kind", kind, ["partes", "pixeles"]);

  const out: Record<string, string> = {};
  const fields: Array<[keyof PartsSpec, readonly string[]]> = [
    ["body", BODIES], ["ears", EARS], ["eyes", EYES], ["mouth", MOUTHS], ["tail", TAILS], ["pattern", PATTERNS],
    ["accessory", ACCESSORIES], ["color", COLOR_NAMES], ["accent", COLOR_NAMES], ["accessory_color", COLOR_NAMES],
  ];
  for (const [field, list] of fields) {
    if (o[field] === undefined) {
      out[field] = PARTS_DEFAULTS[field as keyof typeof PARTS_DEFAULTS] as string;
      continue;
    }
    const v = pickEnum(field, o[field], list);
    if (typeof v !== "string") return v;
    out[field] = v;
  }
  const known = new Set(["spec", "era", "kind", ...fields.map(([f]) => f)]);
  for (const k of Object.keys(o)) if (!known.has(k)) warnings.push(`campo «${k}» no existe; ignorado`);
  return { ok: true, spec: { spec: SPEC_ID, era: era as EraId, kind: "partes", ...out } as PartsSpec, warnings };
}

function parsePixels(o: Record<string, unknown>, era: EraId, warnings: string[]): SpecResult {
  const { size, maxColors } = ERAS[era];
  const bad = (code: SpecError["code"], field: string, message: string, value?: unknown): SpecResult =>
    ({ ok: false, error: { code, field, message, ...(value !== undefined ? { value } : {}) } });
  if (!o.palette || typeof o.palette !== "object") return bad("MISSING_FIELD", "palette", 'falta "palette": {"a": "#rrggbb", …}');
  const palette: Record<string, string> = {};
  for (const [ch, color] of Object.entries(o.palette as Record<string, unknown>)) {
    if ([...ch].length !== 1 || ch === ".") return bad("BAD_COLOR", `palette.${ch}`, 'cada clave es UN carácter y no puede ser "." (ese es transparente)', ch);
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return bad("BAD_COLOR", `palette.${ch}`, "cada color es #rrggbb", color);
    palette[ch] = color.toLowerCase();
  }
  const count = Object.keys(palette).length;
  if (count === 0) return bad("MISSING_FIELD", "palette", "la paleta está vacía");
  if (count > maxColors) return { ok: false, error: { code: "TOO_MANY_COLORS", field: "palette", value: count, message: `${ERAS[era].label} admite ${maxColors} color(es) además de "."; hay ${count}` } };
  if (!o.poses || typeof o.poses !== "object") return bad("MISSING_FIELD", "poses", 'falta "poses": {"idle": [[fila, …]], …}');
  const poses: Partial<Record<Pose, string[][]>> = {};
  for (const [name, framesRaw] of Object.entries(o.poses as Record<string, unknown>)) {
    if (!(POSES as string[]).includes(name)) return enumError("poses", name, POSES);
    // one frame may come as a bare list of rows
    const frames = Array.isArray(framesRaw) && framesRaw.every((r) => typeof r === "string") ? [framesRaw] : framesRaw;
    if (!Array.isArray(frames) || frames.length === 0) return bad("BAD_GRID", `poses.${name}`, "cada pose es una lista de cuadros; cada cuadro, una lista de filas");
    if (frames.length > MAX_FRAMES) warnings.push(`poses.${name}: solo se usan los primeros ${MAX_FRAMES} cuadros`);
    const kept: string[][] = [];
    for (const [f, rows] of frames.slice(0, MAX_FRAMES).entries()) {
      const where = `poses.${name}[${f}]`;
      if (!Array.isArray(rows) || Math.abs(rows.length - size) > SLACK) return bad("BAD_GRID", where, `se esperaban ${size} filas, hay ${Array.isArray(rows) ? rows.length : 0}`);
      // models miscount by a pixel or two all the time (measured: 18 and 15 for 16); a
      // near miss is padded with "." or trimmed and reported, a real miss is rejected
      if (rows.length !== size) warnings.push(`${where}: ${rows.length} filas ajustadas a ${size}`);
      const fixed: string[] = [];
      for (const [y, row] of rows.slice(0, size).entries()) {
        if (typeof row !== "string") return bad("BAD_GRID", `${where} fila ${y}`, "cada fila es un texto");
        let cells = [...row];
        if (Math.abs(cells.length - size) > SLACK) return bad("BAD_GRID", `${where} fila ${y}`, `se esperaban ${size} caracteres, hay ${cells.length}`, row);
        if (cells.length !== size) {
          warnings.push(`${where} fila ${y}: ${cells.length} caracteres ajustados a ${size}`);
          cells = [...cells, ...".".repeat(size)].slice(0, size);
        }
        fixed.push(cells.join(""));
        const x = cells.findIndex((c) => c !== "." && !(c in palette));
        if (x >= 0) return bad("BAD_GRID", `${where} fila ${y} columna ${x}`, `«${cells[x]}» no está en la paleta (usa ".", ${Object.keys(palette).map((k) => `"${k}"`).join(", ")})`, cells[x]);
      }
      while (fixed.length < size) fixed.push(".".repeat(size));
      kept.push(fixed);
    }
    poses[name as Pose] = kept;
  }
  if (!poses.idle) return bad("MISSING_FIELD", "poses.idle", 'hace falta al menos "idle"; las demás poses usan idle si faltan');
  return { ok: true, spec: { spec: SPEC_ID, era, kind: "pixeles", palette, poses }, warnings };
}

// ------------------------------------------------------------------ the player's own words
/** Spanish words → catalog ids. Longest phrase wins, so "orejas de conejo" beats "conejo". */
const WORDS: Array<[string, keyof PartsSpec, string]> = [
  ["gato", "body", "gato"], ["gatito", "body", "gato"], ["michi", "body", "gato"], ["felino", "body", "gato"],
  ["pajaro", "body", "pajaro"], ["pajarito", "body", "pajaro"], ["pollito", "body", "pajaro"], ["ave", "body", "pajaro"], ["buho", "body", "pajaro"],
  ["dino", "body", "dino"], ["dinosaurio", "body", "dino"], ["dragon", "body", "dino"], ["dragoncito", "body", "dino"], ["dinosaurito", "body", "dino"], ["lagartija", "body", "dino"],
  ["redondo", "body", "redondo"], ["bolita", "body", "redondo"], ["gordito", "body", "redondo"],
  ["gota", "body", "gota"], ["slime", "body", "gota"], ["blob", "body", "gota"], ["gelatina", "body", "gota"], ["fantasma", "body", "gota"], ["fantasmita", "body", "gota"], ["slimecito", "body", "gota"],
  ["alto", "body", "alto"], ["flaco", "body", "alto"], ["frijol", "body", "alto"],
  ["conejo", "ears", "conejo"], ["conejito", "ears", "conejo"], ["orejas de conejo", "ears", "conejo"], ["orejas largas", "ears", "conejo"],
  ["oso", "ears", "oso"], ["osito", "ears", "oso"], ["osita", "ears", "oso"], ["orejas de oso", "ears", "oso"], ["orejas redondas", "ears", "oso"],
  ["orejas de gato", "ears", "gato"], ["orejas puntiagudas", "ears", "gato"],
  ["cuernos", "ears", "cuernos"], ["cuernitos", "ears", "cuernos"], ["diablito", "ears", "cuernos"],
  ["antena", "ears", "antena"], ["antenas", "ears", "antena"], ["alien", "ears", "antena"], ["robot", "eyes", "visor"],
  ["sin orejas", "ears", "ninguna"],
  ["ojos grandes", "eyes", "grandes"], ["ojotes", "eyes", "grandes"], ["tierno", "eyes", "grandes"],
  ["ojos chiquitos", "eyes", "puntos"], ["ojitos", "eyes", "puntos"],
  ["dormilon", "eyes", "dormilones"], ["flojo", "eyes", "dormilones"], ["aburrido", "eyes", "dormilones"],
  ["visor", "eyes", "visor"], ["lentes de sol", "eyes", "visor"],
  ["pico", "mouth", "pico"], ["colmillos", "mouth", "colmillos"], ["vampiro", "mouth", "colmillos"], ["feroz", "mouth", "colmillos"],
  ["sonriente", "mouth", "sonrisa"], ["sonrisa", "mouth", "sonrisa"], ["boquita de gato", "mouth", "gato"],
  ["cola esponjada", "tail", "esponjada"], ["colita esponjada", "tail", "esponjada"], ["zorro", "tail", "esponjada"], ["ardilla", "tail", "esponjada"],
  ["cola de dino", "tail", "dino"], ["cola de rayo", "tail", "rayo"], ["electrico", "tail", "rayo"], ["rayo", "tail", "rayo"],
  ["cola de gato", "tail", "gato"], ["sin cola", "tail", "ninguna"],
  ["manchas", "pattern", "manchas"], ["manchitas", "pattern", "manchas"], ["vaca", "pattern", "manchas"], ["dalmata", "pattern", "manchas"],
  ["rayas", "pattern", "rayas"], ["rayado", "pattern", "rayas"], ["atigrado", "pattern", "rayas"], ["tigre", "pattern", "rayas"],
  ["pancita", "pattern", "pancita"], ["panza", "pattern", "pancita"], ["liso", "pattern", "ninguno"],
  ["moño", "accessory", "moño"], ["mono", "accessory", "moño"], ["listón", "accessory", "moño"], ["liston", "accessory", "moño"],
  ["sombrero", "accessory", "sombrero"], ["gorro", "accessory", "sombrero"], ["mago", "accessory", "sombrero"],
  ["corona", "accessory", "corona"], ["rey", "accessory", "corona"], ["reina", "accessory", "corona"], ["princesa", "accessory", "corona"],
  ["lentes", "accessory", "lentes"], ["gafas", "accessory", "lentes"], ["nerd", "accessory", "lentes"],
  ["bufanda", "accessory", "bufanda"], ["invierno", "accessory", "bufanda"],
];

const COLOR_WORDS: Record<string, string> = {
  rojo: "rojo", roja: "rojo", naranja: "naranja", anaranjado: "naranja", anaranjada: "naranja", amarillo: "amarillo", amarilla: "amarillo", dorado: "amarillo", dorada: "amarillo", oro: "amarillo",
  lima: "lima", verde: "verde", celeste: "celeste", cian: "celeste", azul: "azul", morado: "morado", morada: "morado", violeta: "morado",
  rosa: "rosa", rosado: "rosa", rosada: "rosa", cafe: "cafe", marron: "cafe", chocolate: "cafe", crema: "crema", beige: "crema",
  blanco: "blanco", blanca: "blanco", gris: "gris", plateado: "gris", negro: "negro", negra: "negro",
};

/**
 * Whatever the player typed → a spec. Total: unknown words become warnings, never errors,
 * so this is also the safety net when a model fails twice.
 */
export function describe(text: string, era: EraId): { spec: PartsSpec; warnings: string[]; matched: string[] } {
  const t = ` ${fold(text).replace(/[^a-zñ0-9]+/g, " ")} `;
  const spec: PartsSpec = { ...PARTS_DEFAULTS, era };
  const set = new Set<string>();
  const matched: string[] = [];
  let taken = t;
  for (const [phrase, field, value] of [...WORDS].sort((a, b) => b[0].length - a[0].length)) {
    const p = ` ${fold(phrase)} `;
    if (!taken.includes(p)) continue;
    taken = taken.replace(p, " ");
    matched.push(phrase);
    if (set.has(field)) continue; // the first (longest) hit for a field wins
    set.add(field);
    (spec as unknown as Record<string, string>)[field] = value;
    if (field === "body" && value === "pajaro" && !set.has("mouth")) { spec.mouth = "pico"; spec.ears = set.has("ears") ? spec.ears : "ninguna"; spec.tail = set.has("tail") ? spec.tail : "ninguna"; }
    if (field === "body" && value === "dino" && !set.has("tail")) spec.tail = "dino";
    if (field === "body" && value === "gota") { if (!set.has("ears")) spec.ears = "ninguna"; if (!set.has("tail")) spec.tail = "ninguna"; }
  }
  // a color right after an accessory or a marking belongs to it ("bufanda roja", "manchas
  // blancas"); the rest go in order: body, accent, accessory
  const said = new Map<string, string>();
  const loose: string[] = [];
  const words = t.trim().split(" ");
  words.forEach((word, i) => {
    // plurals: "amarillas", "azules"
    const c = COLOR_WORDS[word] ?? COLOR_WORDS[word.replace(/s$/, "")] ?? COLOR_WORDS[word.replace(/es$/, "")];
    if (!c) return;
    const before = ` ${words.slice(Math.max(0, i - 3), i).join(" ")} `;
    const owner = [...WORDS].sort((a, b) => b[0].length - a[0].length)
      .find(([phrase, field]) => (field === "accessory" || field === "pattern") && before.includes(` ${fold(phrase)} `));
    const slot = owner?.[1] === "accessory" ? "accessory_color" : owner?.[1] === "pattern" ? "accent" : null;
    if (slot && !said.has(slot)) said.set(slot, c);
    else if (!loose.includes(c)) loose.push(c);
  });
  const colors = [...said.values(), ...loose];
  const free = (["color", "accent", "accessory_color"] as const).filter((k) => !said.has(k));
  for (const [slot, c] of said) (spec as unknown as Record<string, string>)[slot] = c;
  loose.slice(0, free.length).forEach((c, i) => { (spec as unknown as Record<string, string>)[free[i]!] = c; });
  const warnings = matched.length === 0 && colors.length === 0 ? ["no reconocí ninguna palabra; es la criatura por defecto"] : [];
  return { spec, warnings, matched: [...matched, ...colors] };
}

/** The catalog as a model reads it. */
export function catalogText(): string {
  return [
    `body: ${BODIES.join(" | ")}`, `ears: ${EARS.join(" | ")}`, `eyes: ${EYES.join(" | ")}`, `mouth: ${MOUTHS.join(" | ")}`,
    `tail: ${TAILS.join(" | ")}`, `pattern: ${PATTERNS.join(" | ")}`, `accessory: ${ACCESSORIES.join(" | ")}`,
    `color, accent, accessory_color: ${COLOR_NAMES.join(" | ")}`,
  ].join("\n");
}
