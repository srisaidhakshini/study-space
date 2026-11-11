# Accounts, stats and coins

Players can play as a **guest** (random name, nothing saved) or sign up with an
email and password to keep their look, study history, streaks and focus coins.
Accounts live in Postgres, accessed through Prisma.

## Run order

```bash
docker compose up -d db                 # Postgres 16 on localhost:5432
cp server/.env.example server/.env      # defaults match docker-compose.yml
npm install                             # also generates the Prisma client
npm run db:migrate -w server            # creates the tables
npm run server                          # or: npm run dev:all
```

The server starts without the database: guests play normally, `/health`
reports `"db": "down"`, and every account endpoint answers
`503 {"error":"Accounts are unavailable right now"}` until Postgres is back.
No restart is needed when it returns.

| Command | What it does |
| --- | --- |
| `npm run db:migrate -w server` | Create or update tables in development (`prisma migrate dev`) |
| `npm run db:deploy -w server` | Apply the checked-in migrations (production) |
| `npm run db:generate -w server` | Regenerate the Prisma client (runs on `npm install`) |
| `npm run db:studio -w server` | Browse the data |
| `npm run test:db -w server` | Account tests (needs Postgres) and DB-down tests |

## Configuration (`server/.env`)

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Secret that signs login tokens |

With `NODE_ENV=production` the server refuses to start unless `AUTH_SECRET` is
set to something other than the development default and is at least 32
characters. Generate one with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
Changing it signs everyone out.

## Data model

- **User**: email (stored lowercased, unique), scrypt password hash, name, saved
  look (`appearanceJson`), pet, `coins`, last-seen UTC offset.
- **StudySession**: one finished focus block (`startedAt`, `endedAt`,
  `minutes`, `completed`, `subject`, `mode`, `source`). `(userId, startedAt)` is
  unique, so a retry or re-import can never count twice. `source` is `server`
  (recorded by the room's timer) or `import` (a guest device's history).
- **CoinTransaction**: append-only ledger of coin changes.

**Invariant:** `User.coins` always equals the sum of that user's ledger. A
session, its ledger row and the balance change are written in a single
transaction.

## Coins and streaks

- Coins are earned only by study time: **1 coin per whole minute of focus**,
  paid when the *server's* timer records the session (finished or ended
  early). Nothing a client sends can create coins. Imported history pays none.
- A day counts towards the **streak** once it holds at least 10 focus minutes
  (`STREAK_MIN_MINUTES` in `shared/src/accounts.ts`). The current streak
  survives until the end of the day after the last qualifying day.
- "Days" are the player's own local days, using their UTC offset. A session
  belongs to the day it ended.

## API

All bodies are JSON. Protected endpoints need `Authorization: Bearer <token>`;
the token comes from register or login and is valid for 30 days. Errors are
`{ "error": "..." }` with 400 (bad input), 401 (not signed in or wrong login),
409 (email taken), 429 (rate limited), 503 (database down).

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | `{email, password, name, appearance?, pet?}` → `{token, account}` (201) |
| `POST /api/auth/login` | `{email, password}` → `{token, account}` |
| `GET /api/me` | `{account}` |
| `PUT /api/profile` | `{name?, appearance?, pet?}` → `{account}` |
| `GET /api/stats?tz=<minutes east of UTC>` | Today, 14 zero-filled days, streaks, totals, coins, top subjects, recent sessions |
| `POST /api/sessions/import` | `{sessions: SessionRecord[]}` → `{imported}`; up to 500, duplicates skipped, no coins |
| `GET /health` | `{ok: true, db: 'up' \| 'down'}` |

Types are in `shared/src/accounts.ts`.

### Joining a room as an account

Pass the token in the join options (`JoinOptions.token`). The server then
ignores the name, look and pet the client sends and uses the saved profile. A
token that is invalid or expired is **refused** (code `4401`) instead of
quietly becoming a guest; if the database is down the refusal is `4503` and
the client can offer to play as a guest. If the same account joins again, the
older connection is closed with code `4409` and a notice.

After joining and after every saved session the server sends a `stats`
message: `{coins, todayMinutes, todaySessions, streak}`.

## Security notes

- Passwords are hashed with Node's built-in `scrypt` (random 16-byte salt per
  user, N=16384, r=8, p=1) and compared in constant time. No native modules.
- Tokens are `base64url(payload).base64url(HMAC-SHA256)` with the payload
  `{sub, exp}`; the signature is verified in constant time and `exp` is
  enforced.
- Wrong email and wrong password give the same answer, and an unknown email
  still costs one hash check, so neither response nor timing reveals which
  emails have accounts. (Registering an email that is taken does say so.)
- Login and register are limited to 10 attempts per IP + email and 100 per IP
  every 10 minutes (in memory: one server process; use a shared store if you
  run several).
- Tokens are bearer tokens: serve the API over HTTPS in production, since a
  stolen token works until it expires. There is no token revocation yet other
  than rotating `AUTH_SECRET`.

## Tests

`npm run test:db -w server` checks registration, login, wrong credentials,
tampered and expired tokens, the rate limit, profile saving, token joins,
signing in twice, the real timer path (saved exactly once, right coins, ledger
equals balance), stats and streak maths across midnight and time zones,
import validation and dedupe, and that guests write nothing. A second test
points the server at a closed port to prove guests still play and accounts
answer 503. Tests use throwaway `@example.test` accounts and delete them. To
finish a 25-minute session instantly they move the server's clock with
`createServer({ testClock })`, which throws when `NODE_ENV=production`.

## Not done yet

- **Email verification**: addresses are not confirmed, so anyone can register
  any address.
- **Password reset** and **changing email or password**.
- **OAuth / social sign-in.**
- **Account deletion** and data export.
- Rate limits and the "one connection per account" rule are per server
  process / room instance, not shared across several servers.
