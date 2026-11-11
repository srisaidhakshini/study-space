import type { PlacedItem, Visibility } from './home';

/**
 * Messages and REST types for homes, the shop and friends. The message names
 * are in `C2S` / `S2C` (protocol.ts).
 *
 * Flow rules every implementation relies on:
 * - A home is a map instance with id `home:<ownerId>`; a street page is `street:<n>`.
 *   Both live inside the normal world room, so chat, timers, voice and video work unchanged.
 * - The server sends `homeInfo` BEFORE the `teleport` that puts a player into a home,
 *   so the client already knows the tier and layout when the map loads.
 * - The server sends `streetInfo` when a player arrives on a street page.
 * - The layout is persisted as the plain list `{itemId, x, y, rotation}` (PlacedItem).
 * - Only accounts own homes. Guests may visit open homes but never edit or buy.
 * - Coins are only ever spent here: every purchase appends a negative CoinTransaction
 *   (reason `buy:<itemId>`, `surface:<id>` or `upgrade:<tier>`) and lowers User.coins in the
 *   same database transaction, so User.coins always equals the ledger sum.
 */

// ---- Client -> server ---------------------------------------------------------

export interface HomeEnterMessage {
  /** Account id of the home's owner. Your own id goes to your own home. */
  ownerId: string;
}

/** What a homeEdit does. Item indices refer to `HomeInfoMessage.items` at the given `version`. */
export type HomeEditOp =
  | { op: 'place'; itemId: string; x: number; y: number; rotation: number }
  | { op: 'move'; index: number; x: number; y: number; rotation: number }
  | { op: 'remove'; index: number }
  | { op: 'surface'; kind: 'wallpaper' | 'floor'; id: string }
  | { op: 'visibility'; visibility: Visibility }
  | { op: 'upgrade' };

export interface HomeEditMessage {
  /** The layout version the client edited against; a stale edit is refused with reason 'stale'. */
  version: number;
  edit: HomeEditOp;
}

export interface ShopBuyMessage {
  /** A furniture id, or a surface id (wallpaper or floor). */
  itemId: string;
  quantity: number;
}

// ---- Server -> client -----------------------------------------------------------

export interface HomeInfoMessage {
  ownerId: string;
  ownerName: string;
  /** House number: which door of which street page leads here. */
  number: number;
  tier: number;
  visibility: Visibility;
  wallpaper: string;
  floor: string;
  items: PlacedItem[];
  /** Increments on every accepted edit. */
  version: number;
  /** True when you are the owner (the edit tools are available). */
  mine: boolean;
}

export interface InventoryMessage {
  /** Owned quantity per furniture id (placed and unplaced alike). */
  owned: Record<string, number>;
  /** Wallpapers and floors you own (ids). The default ones are always owned. */
  surfaces: string[];
  coins: number;
}

export type HomeFailure =
  | 'not-signed-in'
  | 'not-owner'
  | 'not-in-home'
  | 'stale'
  | 'unknown-item'
  | 'bad-rotation'
  | 'out-of-room'
  | 'not-on-wall'
  | 'not-on-floor'
  | 'overlap'
  | 'blocks-door'
  | 'blocks-room'
  | 'not-owned'
  | 'not-enough-coins'
  | 'too-many-items'
  | 'bad-index'
  | 'already-max-tier'
  | 'invalid'
  | 'unavailable';

export interface HomeResultMessage {
  /** 'place' | 'move' | 'remove' | 'surface' | 'visibility' | 'upgrade' | 'buy' | 'enter' */
  op: string;
  ok: boolean;
  reason?: HomeFailure | 'private' | 'friends-only' | 'no-such-home';
}

export interface StreetHouse {
  /** 1..HOUSES_PER_STREET: the door `house-<slot>` of this street map. */
  slot: number;
  /** Null when no one has that house number yet. */
  ownerId: string | null;
  ownerName: string | null;
  visibility: Visibility | null;
  /** Whether YOU may enter (owner, friend of a friends-only home, or anyone for an open home). */
  canEnter: boolean;
}

export interface StreetInfoMessage {
  page: number;
  /** Highest street page that has at least one house, so the client can show the next-street door. */
  lastPage: number;
  houses: StreetHouse[];
}

// ---- REST: friends (account bearer token required) ----------------------------------

export type FriendStatus = 'accepted' | 'incoming' | 'outgoing';

export interface FriendEntry {
  /** The other person's account id. */
  id: string;
  name: string;
  status: FriendStatus;
  /** Their home's visibility, or null if they have none yet. Lets the UI offer a visit. */
  homeVisibility: Visibility | null;
}

/** GET /api/friends */
export interface FriendsResponse {
  friends: FriendEntry[];
}
/** POST /api/friends/request — by display name (case-insensitive) or email. */
export interface FriendRequestBody {
  nameOrEmail: string;
}
/** POST /api/friends/respond */
export interface FriendRespondBody {
  /** The requester's account id. */
  id: string;
  accept: boolean;
}
/** DELETE /api/friends/:id removes a friend or cancels a request. */
