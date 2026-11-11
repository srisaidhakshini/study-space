# Assets and how to replace them

Everything the client loads is listed in one manifest:
`client/public/assets/assets.json`. The file is written by the generator
(`npm run assets`), so **do not edit it by hand** — put your changes in
`client/assets.overrides.json` instead. The generator deep-merges that file
over its own output on every run (objects are merged, arrays and values are
replaced).

Example: use a purchased body sheet and turn the automatic outline off.

```json
{
  "images": { "char_body": "custom/my_body.png" },
  "character": { "outline": null }
}
```

Paths are relative to `client/public/assets/`. Put your own files in a folder
the generator does not write to, such as `client/public/assets/custom/`.

To preview generated art without starting the game: `npm run preview -w tools`
(writes enlarged contact sheets to `tools/preview/`).

## Character layer sheets

Every character layer (body, eyes, each hair style, each top, …) is one PNG
with the **same layout**:

- Frame size **32 x 48** px. Sheet size **672 x 192** px (21 columns x 4 rows).
- Rows are directions, top to bottom: **down, left, right, up**.
- The character's feet rest on the line **y = 46** of the frame and are
  centred on **x = 16**. Keep 1 px of empty space on every side of the frame
  so the outline has room.
- Columns are animation frames:

| Columns | Animation | Notes |
| --- | --- | --- |
| 0–1 | `idle` | 2-frame breathing |
| 2–5 | `walk` | 4 frames |
| 6 | `sit` | seated, hands down |
| 7–9 | `study` | writing loop, played back and forth |
| 10 | `pageturn` | shown now and then during study |
| 11–12 | `sleep` | head down on the desk |
| 13–15 | `drink` | cup low, cup at mouth, sip |
| 16–17 | `wave` | 2 frames |
| 18–20 | `stretch` | arms rising |

The table lives in code at `shared/src/animations.ts`.

Layers are stacked in this order, back to front: hair back (optional), body,
shoes, bottom, top, eyes, hair, accessory.

### Recolouring

Generated sheets are drawn in **marker colours** that the client swaps for a
real colour ramp (light, mid, dark) when it composites a character:

| Ramp | Light | Mid | Dark |
| --- | --- | --- | --- |
| primary | `#f0f0f0` | `#b4b4b4` | `#787878` |
| secondary | `#f000f0` | `#b400b4` | `#780078` |

- Body: primary = skin tone. Eyes: primary = iris. Hair: primary = hair colour.
- Clothes and accessories: `palette.primary` / `palette.secondary` of the variant.
- Any other colour in a sheet is left exactly as drawn.

Pre-coloured art works too: leave `palette` out of a variant (or set a colour
option's `ramp` to `null`) and nothing is swapped.

### Adding a variant

Variants are plain data under `character` in the manifest. For example, to add
a hair style from your own sheet, override the whole `hairStyles` array with
the existing entries plus:

```json
{ "id": "braids", "name": "Braids", "sheet": "char_hair_braids", "backSheet": "char_hairback_braids" }
```

and register the images under `images`. `backSheet` is optional: it is drawn
behind the body, for long hair seen from the front.

## Pets

`pets/<id>.png`: frames **16 x 16**, 4 columns x 4 rows. Rows are directions
(down, left, right, up); columns 0–1 are `idle`, 2–3 are `walk`.

## Tilesets and maps

- Tiles are **16 x 16**, 16 columns per sheet, no margin or spacing.
- Maps are standard **Tiled JSON** (orthogonal, embedded tileset, uncompressed
  layers) and can be opened and edited in Tiled. Maps you edit by hand should
  be saved under a new name and registered through the overrides file,
  because `npm run assets` regenerates `maps/hub.json` and `maps/library.json`.

Layers, bottom to top (names must match):

| Layer | Purpose |
| --- | --- |
| `ground` | Floor. Always under characters. |
| `walls` | Walls and flat decor (rugs, flowers). Always under characters. |
| `furniture` | Each tile becomes a sprite that is depth-sorted against characters. |
| `above` | Always drawn over characters (awnings, arches). |
| `collision` | Any tile here blocks movement. Never drawn. |
| `objects` | Object layer, see below. |

Tall furniture: give the upper tiles the custom tile property `sortOffset`
(int) = how many tiles below them the base is, so the whole piece sorts as one.

### Objects

| Type | Shape | Name | Properties |
| --- | --- | --- | --- |
| `seat` | point inside the seat's tile | seat id | `facing` (down/left/right/up), `zoneId`, `kind` (chair/bench) |
| `door` | rectangle | door id | `targetMap` (map id), `targetSpawn` (spawn id) |
| `spawn` | point at the feet | spawn id | `facing` |
| `zone` | rectangle | zone id | `name`, `silent` (bool), `subject` (subject id or empty) |
| `lamp` | point at the lamp's base | any | `seatId` — the lamp lights while that seat has a focus session |

The schemas are in `shared/src/mapSchema.ts`.

### Adding a map

1. Draw it in Tiled with the layers above and an embedded 16 x 16 tileset.
2. Save the JSON under `client/public/assets/maps/` and the tileset image
   under `client/public/assets/tiles/`.
3. Register both in `client/assets.overrides.json`:

```json
{
  "spritesheets": { "tiles_dome": { "path": "tiles/dome.png", "frameWidth": 16, "frameHeight": 16 } },
  "maps": {
    "dome": {
      "path": "maps/dome.json",
      "name": "Glass Dome",
      "tilesets": { "dome": "tiles_dome" },
      "indoor": true,
      "ambientTint": "#d8ecff"
    }
  }
}
```

`tilesets` maps the tileset's name inside Tiled to a spritesheet key. Add a
`door` object in an existing map that targets the new map id, and a `spawn`
in the new map for it to arrive at.

## Effects

Small sprites under `fx/`: `shadow` (18x7), `dust` (4 frames of 8x8), `bubble`
(18x19), `subject_icons` (10x10 frames in the order of `shared/src/subjects.ts`,
then the break cup), `lamp` (16x16: off, on), `glow` (64x64, additive),
`marker` (9x6), `zzz` (7x7).
