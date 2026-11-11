# Player homes, the shop and friends

Every signed-in player has a home: a small room they decorate with furniture
bought with focus coins. Homes are reached from the residential street, or
from a friends list. Guests have no home but can visit homes that are open.

This is the server side. The shared rules live in `shared/src/furniture.ts`
(the catalog), `shared/src/home.ts` (layout rules) and
`shared/src/homeProtocol.ts` (messages). The server never re-implements a rule:
it calls the shared functions, so the client's live preview and the server's
verdict always agree.

## Data model (Postgres, `server/prisma/schema.prisma`)

| Table | Holds |
| --- | --- |
| `Home` | One per account: `number` (house number, from a database sequence), `tier`, `visibility` (PRIVATE / FRIENDS / OPEN), `wallpaper`, `floor`, `layout` (JSON list of `{itemId, x, y, rotation}`), `version` |
| `InventoryItem` | How many of a furniture item an account owns (placed and unplaced) |
| `OwnedSurface` | Wallpapers and floors bought (the defaults are always owned and not stored) |
| `Friendship` | A pending request or an accepted friendship; one row per pair |
| `CoinTransaction` | The existing append-only ledger. Spending is a negative row |

Coins only ever come from finished study sessions. They are only ever spent
by `shopBuy` and the room upgrade. Each purchase appends a negative ledger row
(`buy:<itemId>`, `surface:<id>` or `upgrade:<tier>`) and lowers `User.coins`
in the same transaction, so `User.coins` always equals the ledger sum. The
balance check is part of the UPDATE (`coins >= cost`), so two purchases at
once can never overspend.

A new home is created the first time its owner needs it (joining the server or
asking to go home): a house number, the starter furniture (granted once) and a
valid starter layout (`server/src/homes/starter.ts`).

## How it fits into the world room

Homes are **not** separate rooms. They are map instances inside the normal
world room:

- `home:<ownerId>` is a home; `street:<n>` is page `n` of the residential street.
- The manifest has base maps `home_1`, `home_2`, `home_3` (one per room size)
  and `street`. If the manifest does not list them yet, plain placeholders with
  the same doors and spawns stand in (`server/src/world/stubMaps.ts`).
- A home's collision grid and seats are computed from its layout
  (`homeCollision`, `homeSeats`); the street page shares the `street` map's
  objects. `HomesController.resolve(mapId)` returns the map for any id and is
  used everywhere the room needs a map (movement checks, doors, sitting, chat
  zones, emotes), so a home uses its own collision.
- Chat, timers, voice and video all keep working inside homes. Seat
  occupancy is keyed by map instance and seat id, so two homes can both have a
  seat called `3,4:0`.
- A home desk is an ordinary seat: sitting at it starts the normal timer,
  and the session pays coins to whoever sat there, owner or visitor.

## Messages (`C2S` / `S2C` in `shared/src/protocol.ts`)

| Message | Direction | Meaning |
| --- | --- | --- |
| `homeEnter {ownerId}` | client → server | Go to a home (your own id goes to your own home). Replies with `homeResult` op `enter` |
| `homeEdit {version, edit}` | client → server | Owner only, in their own home: `place`, `move`, `remove`, `surface`, `visibility`, `upgrade` |
| `shopBuy {itemId, quantity}` | client → server | Buy furniture (1 to 20) or a surface (once) |
| `homeInfo` | server → client | The home you are in. **Sent before the teleport** into it, and again on every change, to everyone inside, each with their own `mine` |
| `inventory` | server → client | Owned furniture, surfaces and coins. Sent on joining and after purchases and upgrades |
| `homeResult {op, ok, reason}` | server → client | The outcome of an edit, purchase or entry |
| `streetInfo` | server → client | The twelve houses of the street page you are on, whether you may enter each, and the last page that has a house |

Refusal reasons for an edit are the rule errors from `placeError` (`overlap`,
`out-of-room`, `not-on-wall`, `not-on-floor`, `bad-rotation`, `blocks-door`,
`blocks-room`, `unknown-item`) plus `stale`, `not-owned`, `too-many-items`,
`bad-index`, `not-owner`, `not-in-home`, `not-signed-in`, `already-max-tier`,
`not-enough-coins`, `invalid` and `unavailable` (database down). Entering can
also be refused with `private`, `friends-only` or `no-such-home`.

### Edits and versions

Every home has a `version` that goes up by one on each accepted edit. A client
edits against the version it is looking at; the write is a single
`UPDATE ... WHERE version = <expected>`. If the stored version has moved on
(another tab, or another room instance), the edit is refused as `stale` and the
client is sent the current room. An owner's edits are queued so they apply in the
order sent. The database is re-read on every home entry and edit; the in-memory
copy is only a cache for visitors.

An edit passes two sets of rules: the shared layout rules (bounds, overlap,
wall versus floor, rotations, the door entrance kept clear, every seat still
reachable from the door) and ownership (you cannot place more copies of an
item than you own, surfaces must be owned).

### Travel

- Street doors are `house-<slot>`, `west` and `east`. `house-<slot>` leads to
  the home with house number `houseNumber(page, slot)`; `west` on page 1 leads to
  the town (spawn `from-street`), otherwise to the previous page (`from-east`);
  `east` leads to the next page (`from-west`) only if that page has a house.
- A home's door is `exit`: it leads to the owner's street page, in front of
  their house (`from-house-<slot>`).
- The town's `to-street` door leads to page 1. These doors' stored targets in the
  map files are placeholders; the server decides them at run time.
- Access to a home: the owner always; **open** homes admit anyone, including
  guests; **friends** homes admit accepted friends; **private** homes admit only
  the owner.
- When a home becomes more private, or a friendship ends, visitors who no
  longer have access are moved out to the street with a notice. When a layout
  changes, everyone inside sees it, anyone sitting at a seat that no longer exists
  is stood up (ending their timer, like standing up normally), and anyone left
  inside a newly solid spot is moved to the entrance. After a room upgrade everyone
  inside is moved to the entrance of the bigger room.

## Friends (REST, bearer token)

| Request | Result |
| --- | --- |
| `GET /api/friends` | `{friends: [...]}` with `status` accepted / incoming / outgoing and each person's home visibility |
| `POST /api/friends/request {nameOrEmail}` | Sends a request. A name is matched ignoring case; if two people share a name the answer is 409 and the email must be used. Asking someone who already asked you makes you friends. 404 unknown, 400 yourself, 409 already friends or already asked, 429 too many |
| `POST /api/friends/respond {id, accept}` | Accepts or declines a request sent to you |
| `DELETE /api/friends/:id` | Removes a friend, or cancels or declines a request |

Friend changes are not pushed to clients; the client polls. When a friendship
is created or removed the server re-checks who is inside whose home and
re-sends the street.

## Adding furniture

Add one entry to `FURNITURE` in `shared/src/furniture.ts`. The server needs no
change: it validates, prices and persists any catalog item. The art
generator draws the picture (see `docs/ASSETS.md`). Removing an item from the
catalog makes stored copies of it invalid for new edits; the server drops
layout entries it cannot parse but keeps ones with an unknown `itemId`, which
the shared rules then report as `unknown-item`.

## Limits and known gaps

- **Several server processes.** Room instances in one process notice each
  other's changes through an in-process event bus (`server/src/homes/events.ts`)
  so a visitor sees the owner's edits and is shown out when access tightens, even
  across instances. Separate processes would need a shared channel such as Redis;
  until then edits are still safe (the version check protects the data) but a
  visitor in another process only sees them on their next entry. People in the same
  home on different instances do not see each other.
- **Position visibility.** A home is a map in the shared room's state, so a
  client that inspects the synced state can see which map every player is on, even
  for a private home. What is said inside stays inside (chat is per map), but
  positions are not hidden. Hiding them needs per-client state filtering.
- **Voice calls span the whole room**, not one map, so someone in a private home
  can be heard by others who joined the same voice call.
- **Accounts are not email-verified**, so a friend request or a name match only
  tells you the account holder chose that name or email.
- Starter and default items are not for sale (price 0), so they cannot be farmed.
  Owning more than 50 of one item is refused.
- House numbers come from a database sequence; a number that was reserved but
  never used (a failed creation) leaves an empty house on the street.
- The server and tests need Postgres. With the database down, the shop, editing
  and visiting answer `unavailable`; guests and the rest of the world keep working.

## Tests

`npm run test -w server` includes `src/homes.test.ts` (needs Postgres): first home
and starter furniture, purchases and the ledger, parallel purchases, every edit
and refusal, friends and access rules, the street and its doors, visitors sitting
and studying at someone else's desk, visitors shown out, upgrade, a server restart,
and the database going away mid-session.
