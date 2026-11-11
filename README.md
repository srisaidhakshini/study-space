# Study Space

A cozy pixel-art world for studying together: walk around as a chibi
character, sit at a desk, and run a focus timer that floats above your head.

**Status: phases 1–4 of 7, plus voice and video** — multiplayer (Colyseus
server, synced movement, server-side timers, chat rules), nine places with
their own ambience and lo-fi music, a day/night cycle with weather, accounts
(Postgres via Prisma: look, history, streaks and focus coins), WebRTC voice
calls and study-desk video, and a one-host deployment path. Homes and the shop,
the shared tree growth, buddy desks and final polish come next.

## Run it

Requires Node.js 20 or newer.

```bash
docker compose up -d db                 # Postgres 16 (needs Docker; skip for guest-only play)
cp server/.env.example server/.env      # defaults match docker-compose.yml
npm install
npm run db:migrate -w server            # creates the tables (once)
npm run dev:all
```

That generates the art, starts the game server on port 2567 and the client on
http://localhost:5173. Open the page in two browser tabs to see two players.
The server works without the database: guests play normally and accounts are
switched off until Postgres is back. See [docs/ACCOUNTS.md](docs/ACCOUNTS.md).

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
| `npm run check:audio -w tools` | Check the generated sounds (loudness, clipping, loop seams) |
| `npm run test -w server` | Server tests: movement, chat, caps, invites, accounts, coins (accounts need Postgres) |
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

## Sound, day/night and weather

- Every place has its own ambience loop (birds in town, water at the
  riverside, murmur in the cafe, a hum under the dome, and so on) and most
  have quiet lo-fi music; the library has room tone only. All sound is
  synthesised by the asset generator, so there are no audio files to download.
- The sky follows a shared world clock: one game day lasts 48 real minutes, so
  every player sees the same dawn, dusk and night. Street lamps and lanterns
  glow after dark. Weather (clear, cloudy, rain) changes every 12 minutes.
  Rain falls outdoors and sounds muffled indoors.
- **Settings** (top right): master, music and ambience volume, mute (also the
  M key), rain on/off, and day/night on/off. Music dips while your focus timer
  runs. Settings are saved on your device. Browsers keep sound silent until
  your first click or key press.
- Preview any time of day in solo mode, e.g.
  `http://localhost:5173/?map=hub&hour=21.5&weather=rain`.
- If WebGL fails to start the game falls back to the Canvas renderer
  automatically (force it with `?renderer=canvas`).

## Voice and study-desk video

Both run peer to peer over WebRTC; the game server only relays the signalling.

- **Voice** (top right, "Join voice"): talk with everyone in your room.
  "Mic on / Mic muted" toggles your microphone, "Leave voice" ends it. Muted
  and blocked players are never connected to you, and the People list shows who
  is in the call.
- **Study-desk video** ("Start camera", shown while you are seated): share your
  camera with the other players seated at study desks on the same map. Standing
  up, changing map or leaving removes you automatically. "Pause camera" turns
  the picture off without leaving.
- Browsers ask permission for the microphone and camera the first time. Nothing
  is recorded or stored.
- Behind strict networks a TURN relay is needed. Set `TURN_HOST` and
  `TURN_SECRET` on the server (the browser gets short-lived credentials from
  `GET /api/ice`). Hosting guide, including the relay: `deploy/oracle/README.md`.

## Accounts, stats and coins

- **Guests** get a random name and nothing is saved on the server. This
  device's sessions still show on the stats page.
- **Sign up** (email + password) to keep your look and history on any device.
  Your guest history is imported once, for stats only.
- **Focus coins**: 1 coin per whole minute you study, recorded by the server
  when a session ends (early stops count the minutes done). Nothing else earns
  coins.
- **Streaks**: a day counts once it holds 10 focus minutes (your local day).
- The stats page (click the "today" chip) shows today, streaks, a 14-day
  chart, subjects, totals and recent sessions.
- Not built yet: email verification, password reset, social sign-in.

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

## Deploying on one host

For a single-host deployment, run `npm run build`, set `NODE_ENV=production`
and a random `AUTH_SECRET` of at least 32 characters, then run
`npm start -w server`. The server serves `client/dist` as well as the API and
WebSocket on `PORT` (default 2567). Use a host/reverse proxy that supports
long-lived WebSockets and a single server instance. `VITE_SERVER_URL` is only
needed when the frontend is hosted separately. A temporary Cloudflare Tunnel
to `http://localhost:2567` can share the running server; the laptop and tunnel
must stay running, and the URL changes when the tunnel restarts.

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
