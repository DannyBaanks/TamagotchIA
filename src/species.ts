/** Species = a Companion pack + a habitat. Art comes from Companion (MIT), see NOTICE.md. */
import type { Pose } from "./engine/derived";
import type { Animation } from "./persona/contract";
import { compile, type Sprite } from "./avatar/render";

export interface Species {
  id: string;
  label: string;
  blurb: string;
  sprite: (pose: Pose) => string;
  /** Static images get a CSS "breathing" so they still feel alive. */
  animated: boolean;
  habitat: "neon" | "warm";
  accent: string;
}

const base = import.meta.env?.BASE_URL ?? "./";

export const SPECIES: Species[] = [
  {
    id: "malbolge-cat",
    label: "Malbolgato",
    blurb: "Gato de circuitos. Brilla en la oscuridad y hace glitch cuando se emociona.",
    sprite: (pose) => `${base}packs/malbolge-cat/${pose}.gif`,
    animated: true,
    habitat: "neon",
    accent: "#c6ff3d",
  },
  {
    id: "tabby-shinji-cat",
    label: "Shinji",
    blurb: "Atigrado de uniforme marinero. Cariñoso, dormilón y un poco dramático.",
    sprite: (pose) => `${base}packs/tabby-shinji-cat/${pose}.png`,
    animated: false,
    habitat: "warm",
    accent: "#ff8a5c",
  },
  {
    id: "claw-crab",
    label: "Claw",
    blurb: "Cangrejo de circuitos. Pinzas grandes, antenas curiosas y muy buena memoria.",
    sprite: (pose) => clawSprite(pose),
    animated: false,
    habitat: "neon",
    accent: "#ce3434",
  },
];

/** Compiled once, on first use, so the catalog stays cheap to import. */
function clawSprite(pose: Pose): string {
  clawSprites ??= compiledSprites(CLAW_SPEC);
  return clawSprites[pose] ?? clawSprites.idle ?? "";
}

/**
 * Compile one criatura/1 spec into per-pose data URLs, so a species can be drawn by the
 * same compiler as everything else instead of shipping image files.
 */
function compiledSprites(spec: typeof CLAW_SPEC): Partial<Record<Pose, string>> {
  const sprite: Sprite = compile(spec as never);
  const out: Partial<Record<Pose, string>> = {};
  for (const [pose, frames] of Object.entries(sprite.poses)) {
    const frame = frames.frames[0];
    if (!frame) continue;
    out[pose as Pose] = `data:image/svg+xml;utf8,${encodeURIComponent(frameToSvg(sprite, frame.px))}`;
  }
  return out;
}

/** One frame as a crisp SVG: every pixel is a rect, so it scales without blurring. */
function frameToSvg(sprite: Sprite, px: Uint8Array): string {
  const parts: string[] = [];
  for (let y = 0; y < sprite.size; y++) {
    for (let x = 0; x < sprite.size; x++) {
      const index = px[y * sprite.size + x] ?? 0;
      const color = sprite.colors[index];
      if (!color) continue;
      parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sprite.size} ${sprite.size}" shape-rendering="crispEdges">${parts.join("")}</svg>`;
}

/**
 * Claw — the crab. Drawn entirely by the criatura/1 compiler (no third-party art), in the
 * coral + cian palette of the claw logo. Its shell, claws, legs and antennae come from the
 * "cangrejo" body in render.ts, so it animates in every pose like the other species.
 */
export const CLAW_SPEC = {
  spec: "criatura/1",
  era: "16bit",
  kind: "partes",
  body: "cangrejo",
  ears: "ninguna",
  eyes: "grandes",
  mouth: "sonrisa",
  tail: "ninguna",
  pattern: "pancita",
  accessory: "ninguno",
  color: "coral",
  accent: "cian",
  accessory_color: "blanco",
} as const;

let clawSprites: Partial<Record<Pose, string>> | null = null;

export function createCustomSpecies(pack: { id: string; name: string; dataUrl: string; isGif: boolean; habitat?: "neon" | "warm" }): Species {
  return {
    id: pack.id,
    label: pack.name,
    blurb: "Mascota personalizada con imagen/GIF importado.",
    sprite: () => pack.dataUrl,
    animated: pack.isGif,
    habitat: pack.habitat ?? "neon",
    accent: pack.habitat === "warm" ? "#ff8a5c" : "#c6ff3d",
  };
}

export function speciesById(id: string, customPack?: { id: string; name: string; dataUrl: string; isGif: boolean; habitat?: "neon" | "warm" } | null): Species {
  if (customPack && (id === customPack.id || id === "custom-creature")) {
    return createCustomSpecies(customPack);
  }
  return SPECIES.find((s) => s.id === id) ?? SPECIES[0]!;
}

/** The persona's animation mapped onto the six poses every pack has. */
export function poseForAnimation(animation: Animation): Pose {
  switch (animation) {
    case "happy":
    case "eating":
      return "success";
    case "playing":
      return "working";
    case "sleepy":
    case "sleeping":
      return "waiting";
    case "sick":
    case "sad":
      return "error";
    case "side_eye":
      return "thinking";
    default:
      return "idle";
  }
}
