<p align="center">
  <img src="docs/banner.svg" alt="Study Space" width="100%">
</p>

<p align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/node-20%2B-3fae6c?style=flat-square">
  <img alt="Phaser 3" src="https://img.shields.io/badge/client-Phaser%203%20%2B%20Vite-5b4b8a?style=flat-square">
  <img alt="Colyseus" src="https://img.shields.io/badge/server-Colyseus-ffb703?style=flat-square">
  <img alt="Phase 7" src="https://img.shields.io/badge/status-phase%207%20polish-ff6b6b?style=flat-square">
</p>

A cozy pixel-art world for studying together. Grab a seat, start a focus timer
that floats above your avatar, and earn coins for every minute you finish.
Bring a friend to a Library Buddy Desk, or take a break at the café.

## Highlights

|  |  |
| --- | --- |
| 🗺️ **Nine maps** | Town, library, café, garden, riverside, sky island, glass dome and more |
| ⏱️ **Focus timer** | Server-owned sessions, streaks, 14-day stats and coins |
| 🏠 **Homes & shop** | Decorate a private room with furniture you earn |
| 🎙️ **Voice & video** | Peer-to-peer WebRTC calls with everyone in your room |
| 🌤️ **Living world** | Shared day/night clock, weather, synthesised ambience and lo-fi |
| 👥 **Multiplayer** | Four named servers, invite codes, friends, mute/block/report |

## Quick start

Requires Node.js 20+.

```bash
docker compose up -d db                 # Postgres 16 (skip for guest-only play)
cp server/.env.example server/.env
npm install
npm run db:migrate -w server            # once
npm run dev:all                         # server :2567, client :5173
```

Open http://localhost:5173 in two tabs to see two players. Without a database
guests play normally and accounts are switched off. Choose **Play solo
(offline)** to run without the server.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run assets` | Regenerate sprites, tilesets, maps and `assets.json` |
| `npm run check -w tools` | Verify every door, spawn and seat on all maps |
| `npm run test -w server` | Server tests (accounts need Postgres) |
| `npm run typecheck` | Type-check every package |
| `npm run build` | Production build into `client/dist/` |

## Docs

- [Guide](docs/GUIDE.md): controls, sound, voice/video, accounts, multiplayer rules, deployment
- [Phase 6 features](docs/PHASE6.md) · [Accounts](docs/ACCOUNTS.md) · [Homes](docs/HOMES.md) · [Assets](docs/ASSETS.md)
- Hosting guide: `deploy/oracle/README.md`

## Layout

```
shared/   protocol, timer and pathfinding shared by client and server
server/   Colyseus game server: rooms, validation, timers, chat, REST API
tools/    asset generator: characters, pets, tiles, maps
client/   Phaser 3 + Vite game and HTML interface
docs/     guides and the README banner
```
