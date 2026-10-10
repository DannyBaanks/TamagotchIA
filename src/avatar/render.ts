/**
 * The compiler: criatura/1 spec → indexed pixel frames for every pose. Pure and
 * deterministic (no canvas, no randomness), so the same spec gives the same sprite on every
 * phone and a test can hash it. raster.ts turns the result into images.
 *
 * Drawing happens in "units" of a 16×16 grid; the 16-bit era has 2 pixels per unit, which
 * buys it shading, highlights and eye shine. Parts are first drawn with semantic inks
 * (body, accent, item...) and only mapped to colors at the end, per era — that mapping is
 * what makes an era look like its era.
 */
import type { Pose } from "../engine/derived";
import { COLORS, ERAS, POSES, type CreatureSpec, type EraId, type PartsSpec, type PixelSpec } from "./spec";

/** One frame: palette indexes, 0 = transparent. */
export interface Frame {
  px: Uint8Array;
}

export interface Sprite {
  era: EraId;
  size: number;
  /** colors[0] is transparent (null). */
  colors: Array<string | null>;
  poses: Record<Pose, { frames: Frame[]; fps: number }>;
}

// semantic inks
const T = 0, OUT = 1, BODY = 2, BODY_SH = 3, BODY_HI = 4, ACC = 5, ACC_SH = 6, PAT = 7,
  EYE = 8, EYE_HI = 9, BLUSH = 10, ITEM = 11, ITEM_SH = 12, BEAK = 13, TEAR = 14, STAR = 15;
const INK_COUNT = 16;
/** Inks that get an outline around them. Effects (tears, stars, z's) float free. */
const SOLID = new Set([BODY, BODY_SH, BODY_HI, ACC, ACC_SH, PAT, ITEM, ITEM_SH, BEAK]);
const BODYISH = new Set([BODY, BODY_SH, BODY_HI, PAT]);

class Canvas {
  readonly px: Uint8Array;
  constructor(readonly size: number, readonly u: number, public ox = 0, public oy = 0) {
    this.px = new Uint8Array(size * size);
  }
  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.size || y >= this.size ? T : this.px[y * this.size + x]!;
  }
  set(x: number, y: number, ink: number): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.px[y * this.size + x] = ink;
  }
  /** Every pixel whose center falls inside `inside(ux, uy)`, in units. */
  fill(ink: number, inside: (x: number, y: number) => boolean, only?: Set<number>): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const ux = (x + 0.5 - this.ox) / this.u;
        const uy = (y + 0.5 - this.oy) / this.u;
        if (!inside(ux, uy)) continue;
        if (only && !only.has(this.get(x, y))) continue;
        this.set(x, y, ink);
      }
    }
  }
  ellipse(ink: number, cx: number, cy: number, rx: number, ry: number, only?: Set<number>): void {
    this.fill(ink, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, only);
  }
  rect(ink: number, x0: number, y0: number, x1: number, y1: number, only?: Set<number>): void {
    this.fill(ink, (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1, only);
  }
  triangle(ink: number, a: [number, number], b: [number, number], c: [number, number]): void {
    const side = (p: [number, number], q: [number, number], x: number, y: number) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    this.fill(ink, (x, y) => {
      const d1 = side(a, b, x, y), d2 = side(b, c, x, y), d3 = side(c, a, x, y);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    });
  }
  /** A thick polyline, in units. */
  path(ink: number, points: Array<[number, number]>, width: number): void {
    const r2 = (width / 2) ** 2;
    this.fill(ink, (x, y) => {
      for (let i = 0; i + 1 < points.length; i++) {
        const [ax, ay] = points[i]!, [bx, by] = points[i + 1]!;
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        if ((x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r2) return true;
      }
      return false;
    });
  }
  /**
   * A tiny bitmap placed with its center on a unit point. Designed at 16×16; the 16-bit era
   * doubles it unless a sharper 32 version is given.
   */
  stamp(map: Record<string, number>, rows16: string[], ux: number, uy: number, rows32?: string[], flip = false): void {
    const rows = this.u === 2 && rows32 ? rows32 : rows16;
    const k = this.u === 2 && !rows32 ? 2 : 1;
    const w = rows[0]!.length * k, hgt = rows.length * k;
    const x0 = Math.round(ux * this.u + this.ox - w / 2), y0 = Math.round(uy * this.u + this.oy - hgt / 2);
    rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
      const ink = map[ch];
      if (ink === undefined) return;
      const col = flip ? row.length - 1 - rx : rx;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) this.set(x0 + col * k + dx, y0 + ry * k + dy, ink);
    }));
  }
}

// ------------------------------------------------------------------ anatomy
interface Anatomy {
  parts: Array<[number, number, number, number]>; // body ellipses cx, cy, rx, ry
  head: { x: number; y: number; rx: number; ry: number };
  face: number; // eye line
  tail: [number, number]; // where a tail leaves the body
  tailDir: 1 | -1; // which side it grows to
  neck: number | null; // y of the scarf line, when there is a neck
}

function anatomy(body: PartsSpec["body"]): Anatomy {
  switch (body) {
    case "gota":
      return { parts: [[8, 11, 5.6, 3.6], [8, 8.6, 3.4, 3.2]], head: { x: 8, y: 9.4, rx: 5, ry: 4 }, face: 10, tail: [13, 12.5], tailDir: 1, neck: null };
    case "alto":
      return { parts: [[8, 9.6, 3.9, 5]], head: { x: 8, y: 7.8, rx: 3.9, ry: 3.3 }, face: 7.8, tail: [11.4, 12], tailDir: 1, neck: 10.4 };
    case "gato":
      return { parts: [[8, 7, 4.6, 3.5], [8, 11.9, 3.5, 2.7]], head: { x: 8, y: 7, rx: 4.6, ry: 3.5 }, face: 7.2, tail: [11, 12.8], tailDir: 1, neck: 10.2 };
    case "pajaro":
      return { parts: [[8, 9.8, 4.9, 4.8]], head: { x: 8, y: 8.6, rx: 4.9, ry: 3.6 }, face: 8.4, tail: [12.4, 11.6], tailDir: 1, neck: null };
    case "dino":
      return { parts: [[7.2, 11.6, 4.4, 3], [9, 6.8, 3.9, 3.2], [8.2, 9.3, 2.6, 2]], head: { x: 9, y: 6.8, rx: 3.9, ry: 3.2 }, face: 6.8, tail: [3.4, 12.8], tailDir: -1, neck: 9.6 };
    // A crab: one wide shell, the face low and wide, legs instead of a tail.
    case "cangrejo":
      return { parts: [[8, 10.7, 6.1, 3.4]], head: { x: 8, y: 10.4, rx: 6.1, ry: 3.5 }, face: 10.6, tail: [13.4, 12.6], tailDir: 1, neck: null };
    default:
      return { parts: [[8, 9.6, 5.2, 4.9]], head: { x: 8, y: 9, rx: 5.2, ry: 4.3 }, face: 9, tail: [12.8, 12], tailDir: 1, neck: null };
  }
}

// feature bitmaps (# = main ink of the map, o = shine, m = mouth line, w = white, p = beak)
const EYES16: Record<string, string[]> = { puntos: ["#"], grandes: ["#", "#"], dormilones: ["##"], closed: ["##"], happy: [".#.", "#.#"], sad: ["#.", ".#", "#."], up: ["#"] };
const EYES32: Record<string, string[]> = {
  puntos: ["##", "##"], grandes: ["o#", "##", "##"], dormilones: ["####", ".##."], closed: ["....", "####"],
  happy: ["..##..", ".#..#.", "#....#"], sad: ["#...", ".#..", "..#.", ".#..", "#..."], up: ["o#", "##"],
};
const MOUTH16: Record<string, string[]> = { sonrisa: ["m.m", ".m."], gato: ["m.m", ".m."], pico: ["ppp", ".p."], colmillos: ["mmm", "w.w"], frown: [".m.", "m.m"], small: ["m"], open: ["mmm", "mbm"] };
const MOUTH32: Record<string, string[]> = { sonrisa: ["m....m", ".mmmm."], gato: ["m..m..m", ".mm.mm."], frown: ["..mm..", ".m..m.", "m....m"], small: ["mm"] };
const Z16 = ["zzz", ".z.", "zzz"];
const Z32 = ["zzzz", "..z.", ".z..", "zzzz"];
const SPARK16 = [".s.", "sss", ".s."];
const SPARK32 = ["..s..", "..s..", "sssss", "..s..", "..s.."];

interface Look {
  squash: number; // px the head sinks (breathing)
  hop: number; // px the whole creature lifts
  eyes: string; // key into EYES16/32
  lookX: number; lookY: number;
  mouth: string | null; // null = the spec's mouth
  blush: boolean;
  tailFlip: boolean;
  fx: Array<{ kind: "z" | "spark" | "tear" | "dot"; x: number; y: number }>;
}

/** The pose table: which frames each pose has and what changes between them. */
function looks(pose: Pose, spec: PartsSpec, a: Anatomy): { frames: Look[]; fps: number } {
  const base: Look = { squash: 0, hop: 0, eyes: spec.eyes, lookX: 0, lookY: 0, mouth: null, blush: false, tailFlip: false, fx: [] };
  const top = a.head.y - a.head.ry;
  const L = (over: Partial<Look>): Look => ({ ...base, ...over });
  const zx = Math.min(13.8, a.head.x + a.head.rx + 0.6);
  switch (pose) {
    case "idle":
      return { fps: 3, frames: [L({}), L({ squash: 1 }), L({}), L({ eyes: "closed" })] };
    case "thinking":
      return { fps: 2, frames: [
        L({ eyes: "up", lookX: 0.6, lookY: -0.6, mouth: "small", fx: [{ kind: "dot", x: a.head.x + 3.2, y: top - 0.2 }] }),
        L({ eyes: "up", lookX: 0.6, lookY: -0.6, mouth: "small", fx: [{ kind: "dot", x: a.head.x + 3.2, y: top - 0.2 }, { kind: "dot", x: a.head.x + 4.6, y: top - 1.2 }] }),
      ] };
    case "working":
      return { fps: 6, frames: [L({ squash: 1, blush: true }), L({ hop: 1, blush: true, tailFlip: true }), L({ hop: 2, blush: true, tailFlip: true }), L({ hop: 1, blush: true })] };
    case "success":
      return { fps: 4, frames: [
        L({ eyes: "happy", mouth: "open", blush: true, hop: 1, fx: [{ kind: "spark", x: 2, y: 3 }, { kind: "spark", x: 14, y: 6 }] }),
        L({ eyes: "happy", mouth: "open", blush: true, squash: 1, fx: [{ kind: "spark", x: 14, y: 2.5 }, { kind: "spark", x: 2.2, y: 7 }] }),
      ] };
    case "error":
      return { fps: 2, frames: [
        L({ eyes: "sad", mouth: "frown", squash: 1, fx: [{ kind: "tear", x: a.head.x - 2.6, y: a.face + 1.6 }] }),
        L({ eyes: "sad", mouth: "frown", squash: 1, fx: [{ kind: "tear", x: a.head.x - 2.6, y: a.face + 3 }] }),
      ] };
    case "waiting":
      return { fps: 1.5, frames: [
        L({ eyes: "closed", mouth: "small", fx: [{ kind: "z", x: zx, y: Math.max(1.5, top - 0.6) }] }),
        L({ eyes: "closed", mouth: "small", squash: 1, fx: [{ kind: "z", x: zx + 0.8, y: Math.max(1.5, top - 0.6) - 1 }] }),
      ] };
  }
}

function drawParts(spec: PartsSpec, look: Look): Uint8Array {
  const { size } = ERAS[spec.era];
  const u = size / 16;
  const a = anatomy(spec.body);
  // leave room for a tail on its side; whole pixels, so symmetric parts stay symmetric
  const shift = spec.tail !== "ninguna" ? -a.tailDir : 0;
  const c = new Canvas(size, u, shift * u, -look.hop * (u === 2 ? 2 : 1));
  const s = look.squash / u; // squash is in px; convert to units
  const hx = a.head.x, hy = a.head.y + s, hrx = a.head.rx, hry = a.head.ry;
  const top = hy - hry;

  // tail first, behind the body
  const [tx, ty] = a.tail;
  const d = a.tailDir, flip = look.tailFlip ? -1 : 1;
  const P = (dx: number, dy: number): [number, number] => [tx + d * dx, ty + dy];
  if (spec.tail === "gato") c.path(BODY, [P(-0.6, 0), P(1.3, -0.6 * flip), P(2, -2.2), P(1.5, -3.6)], 1.25);
  if (spec.tail === "esponjada") { c.ellipse(BODY, tx + d * 1.3, ty - 1.9, 1.5, 2.3); c.ellipse(ACC, tx + d * 1.5, ty - 3.4, 1, 0.9); }
  if (spec.tail === "dino") c.triangle(BODY, P(-1.2, -1.4), P(-1.2, 1.3), P(2.4, 0.6 * flip));
  if (spec.tail === "rayo") c.path(ITEM, [P(-0.6, 0), P(1.2, -1), P(0.6, -1.9), P(2.2, -3.2)], 1.1);

  // the crab wears claws and little legs, not ears
  if (spec.body === "cangrejo") {
    const lift = look.hop;
    // two big claws on the sides, the signature of the logo
    for (const side of [-1, 1]) {
      const cx2 = hx + side * (hrx + 1.5);
      const cy2 = hy - 1.1 - lift * 0.6;
      c.ellipse(BODY, cx2, cy2, 1.7, 1.35);
      if (u === 2) c.ellipse(ACC, cx2 + side * 0.25, cy2 - 0.35, 0.85, 0.6);
      // the pincer: a notch cut out of the claw
      c.ellipse(T, cx2 + side * 0.75, cy2 - 1.15, 0.75, 0.6);
    }
    // four small legs under the shell
    for (const side of [-1, 1]) for (const step of [0, 1]) {
      const lx = hx + side * (3.1 + step * 1.5);
      c.path(BODY, [[lx, hy + 1.6], [lx + side * 0.5, hy + 3.1]], 0.55);
    }
    // the two antennae above the eyes
    for (const side of [-1, 1]) {
      c.path(BODY, [[hx + side * 1.6, top + 1.1], [hx + side * 2.5, top - 1.5]], 0.5);
      c.ellipse(ACC, hx + side * 2.5, top - 2, 0.72, 0.72);
    }
  }

  // ears, behind the head
  const earTop = top + 0.6;
  if (spec.body === "cangrejo") { /* its claws already sit where ears would go */ }
  else if (spec.ears === "gato") {
    for (const side of [-1, 1]) {
      const ex = hx + side * hrx * 0.62;
      c.triangle(BODY, [ex - 1.4, earTop + 1.2], [ex + 1.4, earTop + 1.2], [ex + side * 0.5, earTop - 2]);
      if (u === 2) c.triangle(ACC, [ex - 0.6, earTop + 0.9], [ex + 0.6, earTop + 0.9], [ex + side * 0.35, earTop - 0.9]);
    }
  }
  else if (spec.ears === "conejo") {
    const ry = Math.max(1.2, Math.min(2.6, (top + 0.2) / 2));
    for (const side of [-1, 1]) {
      const ex = hx + side * hrx * 0.42;
      c.ellipse(BODY, ex, top - ry + 1, 0.95, ry);
      if (u === 2) c.ellipse(ACC, ex, top - ry + 1.2, 0.4, ry - 0.8);
    }
  }
  else if (spec.ears === "oso") for (const side of [-1, 1]) {
    c.ellipse(BODY, hx + side * hrx * 0.78, top + 0.9, 1.45, 1.45);
    if (u === 2) c.ellipse(ACC, hx + side * hrx * 0.78, top + 0.9, 0.6, 0.6);
  }
  else if (spec.ears === "cuernos") for (const side of [-1, 1]) {
    const ex = hx + side * hrx * 0.48;
    c.triangle(ACC, [ex - 0.8, top + 0.9], [ex + 0.8, top + 0.9], [ex + side * 0.6, top - 1.8]);
  }
  else if (spec.ears === "antena") { c.path(BODY, [[hx, top + 0.5], [hx + 0.4, top - 1.4]], 0.7); c.ellipse(ACC, hx + 0.4, top - 1.9, 0.9, 0.9); }

  // the body, squashed from the top when breathing
  for (const [cx, cy, rx, ry] of a.parts) {
    const k = cy < 9 ? 1 : 0.5; // the upper parts sink more than the feet
    c.ellipse(BODY, cx, cy + s * k, rx, ry - s * (1 - k) * 0.5);
  }
  if (spec.body === "pajaro") c.ellipse(ACC, hx - 3.4, hy + 2.6, 1.2, 1.8, BODYISH); // wing

  // markings, only on the body
  const [bx, by, brx, bry] = a.parts.length > 1 && spec.body !== "dino" ? a.parts[1]! : a.parts[0]!;
  if (spec.pattern === "pancita") {
    // below the mouth, whatever the body: a belly over the face reads as a mask
    const bTop = Math.max(by - bry * 0.2, a.face + 2.7) + s * 0.5, bBottom = by + bry - 0.4;
    if (bBottom - bTop > 0.8) c.ellipse(ACC, bx, (bTop + bBottom) / 2, brx * 0.58, (bBottom - bTop) / 2, BODYISH);
  }
  if (spec.pattern === "manchas") for (const [dx, dy, r] of [[-2.6, 1.6, 1], [2.2, 2.2, 0.8], [2.8, -2.4, 0.9]] as const) c.ellipse(PAT, hx + dx, hy + dy, r, r, BODYISH);
  if (spec.pattern === "rayas") for (const dx of [-1.6, 0, 1.6]) c.rect(PAT, hx + dx - 0.35, top, hx + dx + 0.35, top + 1.5, BODYISH);

  // shading: the lower rim darker; in 16-bit also a lit upper-left rim
  const solid = (x: number, y: number) => { const v = c.get(x, y); return v !== T && v !== OUT; };
  const shade = new Uint8Array(size * size);
  const midX = (hx + shift) * u;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (c.get(x, y) !== BODY) continue;
    if (!solid(x, y + u) || (!solid(x + u, y) && y > hy * u)) shade[y * size + x] = BODY_SH;
    else if (u === 2 && (!solid(x, y - 2) || (!solid(x - 2, y) && x < midX))) shade[y * size + x] = BODY_HI;
  }
  shade.forEach((ink, i) => { if (ink) c.px[i] = ink; });
  if (u === 2) for (let i = 0; i < c.px.length; i++) {
    const x = i % size, y = (i - x) / size;
    if (c.px[i] === ACC && !solid(x, y + 2)) c.px[i] = ACC_SH;
  }

  // accessories that sit on the head
  const item = { i: ITEM, I: ITEM_SH };
  if (spec.accessory === "bufanda") {
    const ny = (a.neck ?? a.face + 2.6) + s;
    c.rect(ITEM, 0, ny - 0.6, 16, ny + 0.6, BODYISH);
    c.rect(ITEM, hx + 1.2, ny, hx + 2.2, ny + 2.4);
    c.rect(ITEM_SH, hx + 1.2, ny + 1.8, hx + 2.2, ny + 2.4);
  }
  if (spec.accessory === "sombrero") {
    c.rect(ITEM, hx - 3.3, top + 0.2, hx + 3.3, top + 1);
    c.rect(ITEM, hx - 2, top - 2.4, hx + 2, top + 0.4);
    c.rect(ITEM_SH, hx - 2, top - 0.6, hx + 2, top);
  }
  if (spec.accessory === "corona") c.stamp(item, ["i.i.i", "iiiii"], hx, top - 0.2, ["i...i...i", "ii.iii.ii", "iiiiiiiii", "iIiIiIiIi"]);
  if (spec.accessory === "moño") c.stamp(item, ["i.i", "iIi", "i.i"], hx + hrx * 0.62, top + 0.9, ["ii...ii", "iiiIiii", "iiiIiii", "ii...ii"]);

  // outline everything solid (not the effects)
  const outline: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (c.get(x, y) !== T) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => SOLID.has(c.get(x + dx!, y + dy!)))) outline.push(y * size + x);
  }
  for (const i of outline) c.px[i] = OUT;

  // the face goes on top of everything
  const ey = a.face + s + look.lookY, spread = Math.max(1.8, hrx * 0.42);
  const eyeMap = { "#": EYE, o: EYE_HI };
  if (spec.accessory === "lentes") for (const side of [-1, 1]) c.stamp({ i: ITEM }, ["iii", "i.i", "iii"], hx + side * spread + look.lookX, ey, ["iiiiii", "i....i", "i....i", "i....i", "iiiiii"]);
  if (look.eyes === "visor" || (spec.eyes === "visor" && look.eyes === "up")) {
    c.rect(EYE, hx - spread - 1, ey - 0.5, hx + spread + 1, ey + 0.45);
    if (u === 2) c.rect(EYE_HI, hx - spread, ey - 0.5, hx - spread + 0.9, ey - 0.1);
  } else {
    const key = look.eyes === "visor" ? "puntos" : look.eyes;
    for (const side of [-1, 1]) c.stamp(eyeMap, EYES16[key] ?? EYES16.puntos!, hx + side * spread + look.lookX, ey, EYES32[key], key === "sad" && side === 1);
  }
  if (look.blush) for (const side of [-1, 1]) c.stamp({ b: BLUSH }, ["b"], hx + side * (spread + 1.3), ey + 1.4, ["bb"]);
  const mouthKey = look.mouth === "open" && spec.mouth === "pico" ? "pico" : look.mouth ?? spec.mouth;
  const mouthMap = { m: OUT, w: EYE_HI, p: BEAK, b: BLUSH };
  c.stamp(mouthMap, MOUTH16[mouthKey] ?? MOUTH16.sonrisa!, hx + look.lookX * 0.5, ey + (spec.mouth === "pico" ? 1.6 : 1.9), MOUTH32[mouthKey]);

  // effects float over the scene and ignore the hop
  c.oy = 0;
  for (const f of look.fx) {
    if (f.kind === "z") c.stamp({ z: OUT }, Z16, f.x, f.y, Z32);
    if (f.kind === "spark") c.stamp({ s: STAR }, SPARK16, f.x, f.y, SPARK32);
    if (f.kind === "tear") c.stamp({ t: TEAR }, ["t", "t"], f.x, f.y, [".t.", "ttt", "ttt"]);
    if (f.kind === "dot") c.stamp({ d: OUT }, ["d"], f.x, f.y, ["dd", "dd"]);
  }
  return c.px;
}

// ------------------------------------------------------------------ palettes per era
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}
const INK_DARK = "#10101a";

export const LCD = { panel: "#a7b58c", ink: "#1f2a1c", ghost: "#9aa983" };

/** ink → color for the era. Returns one entry per ink id. */
function inkColors(spec: PartsSpec): Array<string | null> {
  const body = COLORS[spec.color]!, acc = COLORS[spec.accent]!, item = COLORS[spec.accessory_color]!;
  const out = new Array<string | null>(INK_COUNT).fill(null);
  if (spec.era === "lcd") {
    for (const ink of [OUT, EYE, PAT, ITEM, ITEM_SH, TEAR, STAR, BEAK]) out[ink] = LCD.ink;
    return out; // body, accent and highlights stay the color of the screen
  }
  if (spec.era === "8bit") {
    const ramp = [mix(body, INK_DARK, 0.78), mix(body, INK_DARK, 0.42), body, mix(body, "#ffffff", 0.55)];
    const map: Array<[number, number]> = [[OUT, 0], [EYE, 0], [ITEM_SH, 0], [BODY_SH, 1], [ACC_SH, 1], [PAT, 1], [ITEM, 1], [BLUSH, 1],
      [BODY, 2], [BODY_HI, 2], [BEAK, 1], [ACC, 3], [EYE_HI, 3], [TEAR, 3], [STAR, 3]];
    for (const [ink, shade] of map) out[ink] = ramp[shade]!;
    return out;
  }
  Object.assign(out, {
    [OUT]: mix(body, INK_DARK, 0.68), [BODY]: body, [BODY_SH]: mix(body, INK_DARK, 0.26), [BODY_HI]: mix(body, "#ffffff", 0.35),
    [ACC]: acc, [ACC_SH]: mix(acc, INK_DARK, 0.2), [PAT]: mix(acc, INK_DARK, 0.2), [EYE]: "#231b2e", [EYE_HI]: "#ffffff",
    [BLUSH]: "#ff8fa3", [ITEM]: item, [ITEM_SH]: mix(item, INK_DARK, 0.32), [BEAK]: "#f5b53a", [TEAR]: "#7cc8ff", [STAR]: "#fff27a",
  });
  return out;
}

/** Collapse inks that landed on the same color into one palette. */
function indexed(inks: Array<string | null>, frames: Uint8Array[]): { colors: Array<string | null>; frames: Frame[] } {
  const colors: Array<string | null> = [null];
  const remap = inks.map((c) => {
    if (c === null) return 0;
    const at = colors.indexOf(c);
    if (at >= 0) return at;
    colors.push(c);
    return colors.length - 1;
  });
  return { colors, frames: frames.map((f) => ({ px: f.map((ink) => remap[ink] ?? 0) })) };
}

function compileParts(spec: PartsSpec): Sprite {
  const a = anatomy(spec.body);
  const inks = inkColors(spec);
  const all: Uint8Array[] = [];
  const counts: Array<[Pose, number, number]> = [];
  for (const pose of POSES) {
    const { frames, fps } = looks(pose, spec, a);
    counts.push([pose, frames.length, fps]);
    for (const look of frames) all.push(drawParts(spec, look));
  }
  const { colors, frames } = indexed(inks, all);
  const poses = {} as Sprite["poses"];
  let at = 0;
  for (const [pose, n, fps] of counts) {
    poses[pose] = { frames: frames.slice(at, at + n), fps };
    at += n;
  }
  return { era: spec.era, size: ERAS[spec.era].size, colors, poses };
}

function compilePixels(spec: PixelSpec): Sprite {
  const size = ERAS[spec.era].size;
  const keys = Object.keys(spec.palette);
  const colors: Array<string | null> = [null, ...keys.map((k) => (spec.era === "lcd" ? LCD.ink : spec.palette[k]!))];
  const toFrame = (rows: string[]): Frame => {
    const px = new Uint8Array(size * size);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { px[y * size + x] = ch === "." ? 0 : keys.indexOf(ch) + 1; }));
    return { px };
  };
  const poses = {} as Sprite["poses"];
  for (const pose of POSES) {
    const rows = spec.poses[pose] ?? spec.poses.idle!;
    poses[pose] = { frames: rows.map(toFrame), fps: rows.length > 1 ? 3 : 1 };
  }
  return { era: spec.era, size, colors, poses };
}

export function compile(spec: CreatureSpec): Sprite {
  return spec.kind === "pixeles" ? compilePixels(spec) : compileParts(spec);
}

/** A short fingerprint of the pixels, to show "same spec, same sprite". FNV-1a over every frame. */
export function fingerprint(sprite: Sprite): string {
  let h = 0x811c9dc5;
  const feed = (n: number) => { h ^= n; h = Math.imul(h, 0x01000193) >>> 0; };
  for (const c of sprite.colors) for (const ch of c ?? "-") feed(ch.charCodeAt(0));
  for (const pose of POSES) for (const f of sprite.poses[pose].frames) for (const v of f.px) feed(v);
  return h.toString(16).padStart(8, "0");
}

/** The frames as text, "." for transparent — for tests, the guide and a model's self-check. */
export function asText(sprite: Sprite, pose: Pose, frame = 0): string[] {
  const f = sprite.poses[pose].frames[frame];
  if (!f) return [];
  const glyph = ".123456789abcdefghij";
  const rows: string[] = [];
  for (let y = 0; y < sprite.size; y++) rows.push(Array.from(f.px.subarray(y * sprite.size, (y + 1) * sprite.size), (v) => glyph[v] ?? "?").join(""));
  return rows;
}
