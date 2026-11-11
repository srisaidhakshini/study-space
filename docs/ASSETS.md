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

## Audio

All sound is synthesised by `tools/src/audio` when you run `npm run assets`, so
the project needs no audio files. Each sound is written to
`client/public/assets/audio/<key>.wav` and listed in the manifest under
`audio` (key -> path). Format: **mono, 16-bit PCM, 22050 Hz WAV**, made to loop.

| Key | Used in | Length |
| --- | --- | --- |
| `amb_town` | Town Square (wind, distant birds) | 14 s |
| `amb_library` | Library (room tone, a slow clock, page rustles) | 14 s |
| `amb_cafe` | Cafe (voice murmur, cup clinks, espresso hiss) | 14 s |
| `amb_kitchen` | Common Room (fridge hum, kettle, cupboard tick) | 14 s |
| `amb_garden` | Garden (birdsong, breeze, crickets, a bee) | 14 s |
| `amb_river` | Riverside (flowing water, bubbles) | 14 s |
| `amb_portal` | Portal Room (shimmering pad and chimes) | 14 s |
| `amb_sky` | Sky Island (high wind, chimes, windmill creak) | 14 s |
| `amb_dome` | Glass Dome (deep rumble, bubbles, a far whale call) | 14 s |
| `amb_rain` | Mixed over every place while it rains (not tied to a map) | 14 s |
| `music_lofi_day` | Town, Common Room, Garden, Riverside, Sky Island | 40 s (12 bars, 72 BPM) |
| `music_lofi_night` | Portal Room, Glass Dome | 45 s (12 bars, 64 BPM) |
| `music_lofi_cafe` | Cafe | 48 s (16 bars, 80 BPM) |

Every loop is built so its end flows into its start: ambience modulators have
whole cycles, filters and reverbs run over a doubled copy so their tails wrap,
and music is a whole number of bars. The library has no music on purpose.

### Which place plays what

Each map entry in the manifest can name an `ambience` and a `music` key.
The defaults live in `tools/src/audio/areaSounds.ts` (`AREA_SOUNDS`); add a
line there for a new map. To change one place without code, override it in
`client/assets.overrides.json`:

```json
{ "maps": { "cafe": { "music": "my_cafe_track" } },
  "audio": { "my_cafe_track": "custom/cafe_track.wav" } }
```

### Replacing a sound

Put your own WAV (any rate the browser can decode; mono or stereo; it must
loop cleanly at its ends) under `client/public/assets/custom/` and point the
key at it in `client/assets.overrides.json`, for example
`{ "audio": { "amb_town": "custom/my_town.wav" } }`. Keep the same keys so
maps keep finding their sound. Aim for roughly -24 dB RMS for ambience and
-21 dB for music so the volume sliders stay balanced.

### Checking the audio

`npm run check:audio -w tools` renders every sound without a speaker and
checks: no clipping, no DC offset, a click-free loop seam, sane length and
level. It prints a table and writes a spectrogram of each sound to
`tools/preview/audio_<key>.png` (waveform on top; time left to right, pitch
low to high upward, brighter is louder).

## Furniture and homes

Player homes are built from three base rooms (`home_1`..`home_3`, one per tier),
a catalog of furniture and surfaces, and the residential street. The catalog
lives in `shared/src/furniture.ts` and is the single source of truth: the art
generator draws exactly those items, the server validates against them and
the client shop lists them.

### Furniture images

Every item has one PNG per **view**, `client/public/assets/furniture/furn_<id>_<view>.png`,
registered in the manifest `images` under `furniture_image_key(id, view)`
(`furn_<id>_<view>`). A view is a rotation: `rotations` in the catalog says how
many views exist (1 = fixed, 2 = views 0 and 1, 4 = all four). Wall items only
have view 0.

- **Size:** `(fw * 16) x ((fh + lift) * 16)` pixels, where `(fw, fh)` is the
  footprint at that rotation. Views 0 and 2 keep the catalog `w x h`, views 1
  and 3 swap them. `lift` extra tile rows of picture sit **above** the footprint
  (tall shelves, wardrobes, plants, lamps).
- **Anchor:** the footprint is the bottom `fw x fh` tiles of the image. The
  object's base must touch the bottom row of the picture (the checker enforces
  this), so it sits exactly on its footprint when drawn with its bottom edge at
  the footprint's bottom edge.
- **Transparent background**, dark ink outline (rugs are flat and have none, so
  characters walking over them stay readable).
- **Rotation 0 faces down** (the front is visible). Rotations are quarter turns
  clockwise: 1 faces left, 2 faces up (back visible), 3 faces right. Draw each
  view by rendering the rotated layout, not by rotating pixels: a chair at
  `seats[0]` moves to where `rotateCell` puts it.
- **Seats** are part of the picture: the chair, sofa cushion or beanbag must be
  drawn on the seat cell given in the catalog.
- The depth order of the world is decided by the client (it sorts items by the
  bottom edge of their footprint), so a tall item never needs extra padding.

Surfaces are seamless 16x16 tiles: `furniture/surf_<id>.png` under the key
`surf_<id>` (six wallpapers and six floors). `home_baseboard` is a 16x16
skirting strip (transparent above) the client draws along the bottom of the
back wall.

### Base rooms

Maps `home_1`, `home_2` and `home_3` (HUD name "Home", indoor, warm tint) are
plain Tiled maps with the usual layers. Coordinates are described in
`shared/src/home.ts`:

- Tile columns 0 and W-1 are side walls, rows 0..2 are the back wall, the floor
  fills the rest, and the last row is the bottom wall with a **doorway at tile
  columns 1..2** (room columns 0..1). Room column `x` is map tile `x + 1`.
- Floor sizes: tier 1 is 10x6, tier 2 is 14x8, tier 3 is 18x10 tiles. Upgrading
  only adds floor to the right and bottom, so saved positions never move.
- The `collision` layer equals `homeCollision(emptyLayout)` exactly; the
  generator throws if it ever differs.
- Objects: spawn `entrance` (just inside the door, facing up), door `exit` on
  the doorway (its target is a placeholder: the server sends you to your
  house's door on the right street page), zone `home`. There are **no seats and
  no furniture** in the base maps: seats come from the owner's layout.
- The ground and wall layers hold the default oak floor and cream wallpaper.
  The client repaints those two rectangles from the chosen surfaces and draws
  the baseboard, so the Tiled layers are the fallback and editor view.

### Residential street

Map `street` ("Residential Street", outdoor, 60x31 tiles): a road with a
promenade, six houses on the north side and six on the south side.

- Doors `house-1`..`house-12` (north row left to right, then south row left to
  right) have **empty targets**: the server resolves them from the street page
  (house number = `(page - 1) * 12 + slot`). Spawns `from-house-1`..`from-house-12`
  stand just in front of each door.
- The wall above every door is left plain for the name plate the client draws
  (3 tiles wide, the top wall row of the house).
- Gates `west` and `east` at the ends of the road (targets also dynamic: on
  page 1 the west gate leads to the hub's `from-street`). Spawns `entrance` and
  `from-west` at the west end, `from-east` at the east end.
- Eight bench seats (zone `street`) in two small parks; lamp posts between the
  houses (generated lights); zone `street`.
- The hub gains a gate on the west end of its road: door `to-street` (target
  `street` / `from-west`) and spawn `from-street`.

### Checks and previews

- `npm run check:furniture -w tools` (after `npm run assets`): every item and
  view exists at exactly the right size, is not empty, touches its footprint's
  bottom row, tall items really rise above their footprint, and every surface
  tiles without a visible seam.
- `npm run preview:furniture -w tools` writes `tools/preview/furniture.png` (all
  items, all views, backdrop in a neutral colour) and `surfaces.png` (each
  surface tiled 6x6). `npx tsx tools/src/furniture/zoom.ts desk_basic sofa`
  writes a 6x close-up to `tools/preview/zoom.png`.
- `npm run check -w tools` treats the doors `exit`, `west`, `east` and
  `house-N` as dynamic; every other door must resolve to an existing map and
  spawn, and every seat, door and spawn must be reachable.

### Adding a furniture item

1. Add an entry to `FURNITURE` in `shared/src/furniture.ts`: id, name,
   category, placement (`floor`, `rug` or `wall`), footprint `w x h`, `lift`,
   `rotations`, price, seats (rotation-0 cells inside the footprint) and, for
   lights, a `glow` radius.
2. Add a painter in `tools/src/furniture/items.ts` (`PAINTERS['<id>']`). It
   receives the canvas and a `ViewCtx`; use `ctx.rect(x0, y0, x1, y1, up)` for the
   pixel area of rotation-0 cells in the current view and `ctx.facing(...)` to
   turn a facing. Reusable parts are in `painters.ts` (desks, chairs, beds,
   sofas, shelves, cabinets, rugs, plants) and `kit.ts` (the oblique box).
3. Run `npm run assets` and `npm run check:furniture -w tools`, then look at
   `npm run preview:furniture -w tools`.

To use bought art instead, override the image keys (`furn_<id>_<view>`) in
`client/assets.overrides.json` with PNGs of the sizes above.
