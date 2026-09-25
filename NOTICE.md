# Third-party notice

## Creature art: Companion packs

| | |
|---|---|
| Source | Companion, https://github.com/DannyBaanks/Companion |
| License | MIT, Copyright (c) 2026 ISyCo contributors |
| Copied from | Companion commit `e7e8692`, taken with `git show HEAD:…` (committed files only) |
| Files | `public/packs/malbolge-cat/*.gif` (6 animated poses), `public/packs/tabby-shinji-cat/*.png` (6 static poses) |
| Hashes | `public/packs/SHA256SUMS` |

**Malbolgato was cleaned on 2026-09-25** (`tools/clean_pack_art.py`): the untouched originals are in `art/companion-original/malbolge-cat/` with their hashes; the published GIFs drop the 10 frames where a raised paw was drawn over the resting ones, and peel the blue/cyan cut-out halo. The same defects are still in Companion's own pack.

Shinji's animated GIFs exist in the author's Companion checkout but are **not committed** there, so they were not copied; TamagotchIA uses Shinji's committed PNGs and animates them with CSS.

## Font: Fredoka

`@fontsource/fredoka` 5.3.0, SIL Open Font License 1.1. It is bundled into the build so the app works offline.

## App icons

`public/icons/*.png` were generated for TamagotchIA from Malbolgato's first idle frame, so they carry the Companion art's license.
