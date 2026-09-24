/** Species = a Companion pack + a habitat. Art comes from Companion (MIT), see NOTICE.md. */
import type { Pose } from "./engine/derived";
import type { Animation } from "./persona/contract";

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
];

export function speciesById(id: string): Species {
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
