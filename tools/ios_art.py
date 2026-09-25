#!/usr/bin/env python3
"""Replace Capacitor's placeholder art in ios/ with TamagotchIA's.

- App icon: one 1024x1024 image, opaque (iOS rejects icons with an alpha channel).
- Splash: the three 2732x2732 images Capacitor ships, same size, our cat centered.

Run after `npx cap add ios`:  python3 tools/ios_art.py
"""
from pathlib import Path

from PIL import Image

from android_art import cat, centered, fit

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "ios/App/App/Assets.xcassets"


def main() -> None:
    c = cat()
    icon = centered((1024, 1024), fit(c, 800)).convert("RGB")  # no alpha, on purpose
    icon.save(ASSETS / "AppIcon.appiconset/AppIcon-512@2x.png")
    for splash in (ASSETS / "Splash.imageset").glob("splash-*.png"):
        w, h = Image.open(splash).size
        centered((w, h), fit(c, round(min(w, h) * 0.3))).convert("RGB").save(splash)
    print("ios art replaced")


if __name__ == "__main__":
    main()
