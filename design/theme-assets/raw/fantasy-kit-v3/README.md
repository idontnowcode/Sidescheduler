# Fantasy Kit v3 — generated assets

Source specification: `design/theme-assets/INDEX-fantasy-kit.md`, section **3차 — TARGET-v3**.

- Generation mode: built-in image generation
- Style reference: `screenshots/diablo-compact-target-style-v2.png`
- Final asset count: **48 PNG files**
- The source index summary says 33, but its listed rows originally totaled 35; the four later-added gemstone colors bring the set to 39. Every listed filename was generated.
- Final dimensions and 9-slice values: `manifest.json`
- Visual inspection sheet: `CONTACT-SHEET.jpg`

## Groups

- Header and window controls: 13
- Rail: 2
- Sidebar: 14
- Page list: 4
- Document tabs: 4
- Title and toolbar: 5
- Paper: 2
- Right panel and footer: 4

## Shared prompt

```text
Production UI skin asset for a compact gothic dark-fantasy note application.
Match the target UI's near-black cracked stone, blackened iron, and thin muted
oxidized-bronze trim. Calm, flat old-grimoire interface. Perfectly straight-on,
orthographic. No text, letters, numbers, watermark, perspective, outer shadow,
bright yellow gold, orange bloom, or oversized ornament.
```

Each file adds the corresponding per-asset prompt from `INDEX-fantasy-kit.md`.
Transparent icons and ornaments were alpha-cropped and centered; structural plates
were resized to the exact requested dimensions. `dot-cyan.png` and `dot-blue.png`
were regenerated after inspection because their first outputs contained multiple dots.
`rail-column.png` had its white studio field removed and now has a transparent exterior.

Four later-added notebook gemstone colors (`dot-purple`, `dot-pink`, `dot-lime`, `dot-yellow`) follow the same 64×64, 37px-diameter, dark-bronze-rim specification.

Two third-supplement assets (`window-corner`, `icon-folder-gold`) complete the window chrome and page-list header icon set.

The title emblem (`header-crest`) was redesigned as a sealed oxblood grimoire with dark-brass corners and a restrained red rune stone for legibility at 24–28px.

Concept D window controls add `window-controls-plate` and `window-close-accent`.

The later INDEX **3차 보충 4** revision supersedes the earlier SVG-only note. Four
thick, simplified antique-bronze PNG glyphs (`win-glyph-min`, `win-glyph-max`,
`win-glyph-restore`, `win-glyph-close`) are used at 15px when present, with the SVGs
kept as the automatic fallback. `window-corner-tall` combines the former small corner
frame and separate ruby into one 192×256 right-anchored ornament with a long tail.
