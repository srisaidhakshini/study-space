# Study Space

A cozy pixel-art world for studying together: walk around as a chibi
character, sit at a desk, and run a focus timer that floats above your head.

**Status: phase 2 of 7** — multiplayer works (Colyseus server, synced
movement, server-side timers, server list, chat rules), and the world now has
nine places. Accounts and the database (phase 3), homes, the shared tree
growth, buddy desks and polish come in later phases.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run dev:all
```

That generates the art, starts the game server on port 2567 and the client on
http://localhost:5173. Open the page in two browser tabs to see two players.

Or run the pieces yourself:

```bash
npm run server      # game server, ws://localhost:2567
npm run dev         # client only (regenerates art first)
```

The client works without the server: choose **Play solo (offline)** on the
server list. To point a built client at another server set `VITE_SERVER_URL`
(see `client/.env.example`).

| Command | What it does |
| --- | --- |
| `npm run assets` | Regenerate sprites, tilesets, maps and `assets.json` |
| `npm run preview -w tools` | Write enlarged art and map images to `tools/preview/` |
| `npm run check -w tools` | Check every door, spawn and seat across all maps |
| `npm run test -w server` | Server smoke tests (movement, chat, caps, invites) |
| `npm run typecheck` | Type-check every package |
| `npm run build` | Production build into `client/dist/` |

Testing one map directly (solo only): `http://localhost:5173/?map=cafe`.
Map ids: `hub`, `library`, `cafe`, `kitchen`, `garden`, `riverside`,
`portal`, `skyisland`, `dome`.

## The world

| Place | How to get there | What it is for |
| --- | --- | --- |
| Town Square | You start here | The hub; doors to everything |
| Library | Big building, north | Silent study desks in four subject corners |
| Cafe | East building | Chat allowed, tables and a counter: **Order a drink** |
| Common Room | West building | Kitchen, sofa and TV for breaks |
| Garden | Gate in the north-east | Study benches and the shared tree |
| Riverside | East road, off the edge of town | Bridge, pier, benches by the water |
| Portal Room | South-east building | Two portals to other worlds |
| Sky Island | Left portal | Floating study deck above the clouds |
| Glass Dome | Right portal | Underwater study pods |

## Controls

| Action | Keyboard | Mouse / touch |
| --- | --- | --- |
| Walk | WASD or arrow keys | Click / tap the ground (pathfinds) |
| Sit | E or Space near a seat | Click a seat, or the "Sit here" button |
| Stand up | E or Space | "Stand up" button |
| Start a timer | — | "Start timer" (only while seated) |
| Chat | Type in the chat box | Chat box (off in silent zones and during focus) |

Walking away while a session runs does not stand you up by accident; use
E/Space or the button. Standing up early ends the session and records only the
whole minutes you studied.

## Multiplayer rules

- Named servers (Maple, Birch, Cedar, Willow) hold 50 players per instance; a
  new instance opens automatically when one fills.
- Friends join the same instance with the invite code shown by clicking the
  connection chip (top left).
- The server owns your position, seat and timer. Your client sends where it
  thinks you are; impossible moves are corrected.
- Chat reaches nearby players on the same map. It is disabled in silent zones
  (the library, study benches) and while your own focus timer runs. Emotes are
  always allowed. You can mute, block and report from the People panel.

## Layout

```
shared/   types and pure logic shared by client and server (protocol, timer, pathfinding)
server/   Colyseus game server: rooms, validation, timers, chat, REST API
tools/    asset generator: characters, pets, tiles, maps (tools/src/areas), assets.json
client/   Phaser 3 + Vite game and HTML interface
docs/     ASSETS.md — exact frame layouts, and how to swap in your own art
```

See [docs/ASSETS.md](docs/ASSETS.md) to replace any sheet or add a map
without changing code.
