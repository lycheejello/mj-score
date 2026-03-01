# Mahjong Scorer

A mobile-first PWA for scoring 17-tile Taiwanese mahjong hands. Runs entirely in the browser with no build step or server required.

## Usage

Open `index.html` directly in a browser, or serve the folder with any static server:

```
npx serve .
# or
python -m http.server
```

Install as a PWA from Chrome/Safari for offline use and a home-screen icon.

## How to score a hand

1. **Select tiles** from the palette at the top. Tap a tile to select it (gold highlight), then tap a meld slot to place it. The progress counter shows how many of the required 17 tiles have been placed.

2. **Group melds** — the app auto-detects the meld type (順 sequence / 刻 pung / 槓 kang) from the tiles you place. Toggle 🙈/👁 on each meld to mark it concealed or exposed. A kang's 4th tile does not count toward the 17-tile total.

3. **Mark the winning tile** — tap any placed tile to star it (★). This is required before calculating.

4. **Select Won from** — choose 自摸 (self-draw) or the player who discarded the winning tile.

5. **Win Conditions** (collapsible panel) — set dealer status, win type, wildcards, instant-win bonuses, etc.

6. **Calculate →** — shows total fan and a full rule-by-rule breakdown.

Use **🎲 Sample** to load a preset hand and jump straight to calculating.

## Scoring rules

Rules are loaded at runtime from `data/scoring.csv`. Each row is one rule:

| Column | Description |
|--------|-------------|
| `id` | Unique key used in code |
| `category` | Display grouping |
| `chinese` | Chinese name |
| `pinyin` | Romanisation |
| `description_en` | English description |
| `fan` | Base fan value |
| `condition_type` | `auto` / `manual` / `count` |
| `notes` | Extra notes, e.g. `fan_per=2` |

**condition_type values:**
- `auto` — detected from the hand structure (tile pattern, suit composition, etc.)
- `manual` — set by the user via a toggle or select in the Win Conditions panel
- `count` — fan × a count (e.g. each kang, each flower)

To adjust or add rules, edit `data/scoring.csv`. Auto-detected rules also need a corresponding entry in the `detectors` map in `js/scoring.js`.

## File structure

```
index.html          — app shell and all screens
manifest.json       — PWA manifest
sw.js               — service worker (cache-first, offline support)
css/
  styles.css        — mobile-first styles
js/
  tiles.js          — tile definitions and lookup table
  csv-parser.js     — CSV → array of objects
  scoring.js        — scoring engine and rule detectors
  app.js            — UI, state, and event handling
data/
  scoring.csv       — configurable scoring table (60 rules)
```

## Tile IDs

| Suit | IDs |
|------|-----|
| Bamboo 竹 | `b1`–`b9` |
| Character 萬 | `m1`–`m9` |
| Circle 餅 | `p1`–`p9` |
| Winds/Dragons 字 | `z1` 東 `z2` 南 `z3` 西 `z4` 北 `z5` 中 `z6` 發 `z7` 白 |
| Flowers 花 | `f1`–`f8` |

## Notes

- This app is built for the 17-tile Taiwanese variant (5 melds × 3 tiles + 1 pair × 2 tiles).
- 十三幺 (Thirteen Orphans) is supported in the 17-tile form: 13 orphan tile types + a pair + any valid meld.
- Mutual exclusions (e.g. 清一色 supersedes 混一色) are enforced in `js/scoring.js`.
