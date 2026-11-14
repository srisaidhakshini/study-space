# Study Space guide

Reference for controls, sound, voice, accounts, multiplayer and deployment. Back to the [README](../README.md).

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

## Voice and video

Both run peer to peer over WebRTC; the game server only relays the signalling.

- **Voice** (top right, "Join voice"): talk with everyone in your room.
  "Mic on / Mic muted" toggles your microphone, "Leave voice" ends it. Muted
  and blocked players are never connected to you, and the People list shows who
  is in the call.
- **Video** ("Start camera"): share your camera with other players in the same room instance. Click a feed to expand the call to full screen. "Pause camera" turns off your picture while you stay connected. "Stop video" leaves the video call.
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

## Homes, shop and friends

Every account has a private room, reached from the **Home** button or from its
door on the residential street (west end of the town road). **Edit** lets you
place, move, rotate and remove furniture on the grid; the shop sells furniture,
wallpapers and floors for focus coins, which you only earn by finishing study
sessions. You can upgrade the room twice (14×8 for 600 coins, 18×10 for 1800),
set it to private, friends-only or open, and study at your home desk. Add
friends from the **Friends** button, then visit them from the list. Details in
[docs/HOMES.md](docs/HOMES.md).

## Multiplayer rules

- Named servers (Maple, Birch, Cedar, Willow) hold 50 players per instance; a
  new instance opens automatically when one fills.
- Friends join the same instance with the invite code shown by clicking the
  connection chip (top left).
- The server owns your position, seat and timer. Your client sends where it
  thinks you are; impossible moves are corrected.
- Chat reaches nearby players on the same map. It is disabled in silent zones
  (the library, study benches), but not while your focus timer runs. Emotes are
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

