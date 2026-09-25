#!/usr/bin/env python3
"""Replace Capacitor's placeholder art in android/ with TamagotchIA's.

Generates, from Malbolgato's first idle frame (Companion art, see NOTICE.md):
  - launcher icons (legacy square + round) and the adaptive-icon foreground
  - splash screens, keeping each existing splash.png's size
  - a white silhouette for the notification bar (Android draws small icons monochrome)

Run after `npx cap add android`:  python3 tools/android_art.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android/app/src/main/res"
BG = (27, 21, 48, 255)  # #1b1530, the neon habitat
DENSITY = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def cat() -> Image.Image:
    gif = Image.open(ROOT / "public/packs/malbolge-cat/idle.gif")
    gif.seek(0)
    im = gif.convert("RGBA")
    return im.crop(im.getbbox())


def fit(src: Image.Image, box: int) -> Image.Image:
    scale = box / max(src.size)
    return src.resize((max(1, round(src.width * scale)), max(1, round(src.height * scale))), Image.LANCZOS)


def centered(size: tuple[int, int], art: Image.Image, fill=BG) -> Image.Image:
    canvas = Image.new("RGBA", size, fill)
    canvas.alpha_composite(art, ((size[0] - art.width) // 2, (size[1] - art.height) // 2))
    return canvas


def rounded_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def main() -> None:
    c = cat()
    for name, d in DENSITY.items():
        mip = RES / f"mipmap-{name}"
        legacy = round(48 * d)
        icon = centered((legacy, legacy), fit(c, round(legacy * 0.8)))
        sq = icon.copy()
        sq.putalpha(rounded_mask(legacy, round(legacy * 0.2)))
        sq.save(mip / "ic_launcher.png")
        rnd = icon.copy()
        m = Image.new("L", (legacy, legacy), 0)
        ImageDraw.Draw(m).ellipse([0, 0, legacy - 1, legacy - 1], fill=255)
        rnd.putalpha(m)
        rnd.save(mip / "ic_launcher_round.png")
        # adaptive foreground: 108dp canvas, art inside the 66dp safe zone
        fg = round(108 * d)
        centered((fg, fg), fit(c, round(66 * d * 0.95)), fill=(0, 0, 0, 0)).save(mip / "ic_launcher_foreground.png")

        # notification small icon: white where the cat is, transparent elsewhere
        drw = RES / f"drawable-{name}"
        drw.mkdir(exist_ok=True)
        small = fit(c, round(24 * d * 0.9))
        alpha = small.getchannel("A").point(lambda a: 255 if a > 96 else 0)
        white = Image.new("RGBA", small.size, (255, 255, 255, 0))
        white.putalpha(alpha)
        centered((round(24 * d), round(24 * d)), white, fill=(0, 0, 0, 0)).save(drw / "ic_stat_tamagotchia.png")

    (RES / "values/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1B1530</color>\n</resources>\n'
    )

    for splash in RES.glob("drawable*/splash.png"):
        w, h = Image.open(splash).size
        centered((w, h), fit(c, round(min(w, h) * 0.38))).convert("RGB").save(splash)
    print("android art replaced")


if __name__ == "__main__":
    main()
