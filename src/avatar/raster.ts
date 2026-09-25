/**
 * Browser side: compiled frames → PNG data URLs, scaled up with hard edges here so no
 * phone ever smooths them. The LCD era is drawn as a little screen: panel color, faint
 * "off" pixels and a gap between cells, like the 1996 keychain.
 */
import type { Pose } from "../engine/derived";
import { LCD, type Frame, type Sprite } from "./render";
import { POSES } from "./spec";

export interface AvatarImages {
  poses: Record<Pose, { frames: string[]; fps: number }>;
}

const TARGET = 192; // px per side of the produced image

function draw(sprite: Sprite, frame: Frame): string {
  const k = Math.floor(TARGET / sprite.size);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = sprite.size * k;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("este navegador no tiene canvas 2D");
  const lcd = sprite.era === "lcd";
  const gap = lcd ? Math.max(1, Math.floor(k / 8)) : 0;
  if (lcd) {
    ctx.fillStyle = LCD.panel;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (let y = 0; y < sprite.size; y++) {
    for (let x = 0; x < sprite.size; x++) {
      const color = sprite.colors[frame.px[y * sprite.size + x]!] ?? (lcd ? LCD.ghost : null);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * k, y * k, k - gap, k - gap);
    }
  }
  return canvas.toDataURL("image/png");
}

export function rasterize(sprite: Sprite): AvatarImages {
  const poses = {} as AvatarImages["poses"];
  for (const pose of POSES) poses[pose] = { frames: sprite.poses[pose].frames.map((f) => draw(sprite, f)), fps: sprite.poses[pose].fps };
  return { poses };
}
