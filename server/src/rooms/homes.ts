import {
  HOUSES_PER_STREET,
  S2C,
  feetBlocked,
  homeMapId,
  houseNumber,
  parseMapId,
  slotOf,
  streetMapId,
  streetPageOf,
  type DoorDef,
  type HomeInfoMessage,
  type HomeResultMessage,
  type NoticeMessage,
  type SpawnDef,
  type StreetHouse,
  type StreetInfoMessage,
  type TeleportMessage,
} from '@study/shared';
import { serverConfig } from '../config';
import { AccountsUnavailableError } from '../db/client';
import { areFriends, friendIdsOf } from '../db/friends';
import { buy, ensureHome, highestHouseNumber, homesInRange, loadHome, loadHomeByNumber, loadInventory, saveHome, upgrade, type HomeRecord } from '../db/homes';
import { evaluateEdit, layoutOf, parseEditMessage } from '../homes/edits';
import { homeBus } from '../homes/events';
import { streetDoorTarget } from '../homes/travel';
import { homeRuntimeMap, streetPageMap } from '../world/dynamicMaps';
import type { ServerMap, WorldData } from '../world/maps';
import { enqueue } from './persist';
import type { PlayerSession } from './session';
import { isFiniteNumber, isPlainObject } from './text';

/** What the controller needs from the room that owns it. */
export interface HomeHost {
  readonly sessions: ReadonlyMap<string, PlayerSession>;
  readonly world: WorldData;
  stand(s: PlayerSession, now: number, notify: boolean): void;
  teleport(s: PlayerSession, reason: TeleportMessage['reason']): void;
  spawnPoint(map: ServerMap, spawn: SpawnDef): { x: number; y: number };
  pushStats(s: PlayerSession): Promise<void>;
}

interface CachedHome {
  record: HomeRecord;
  map: ServerMap;
}

type Access = 'ok' | 'private' | 'friends-only';

/**
 * Homes and the residential street inside one world room: who may enter,
 * the trips between hub, street and homes, layout edits, purchases, and keeping
 * visitors in step when a home changes. Homes are not rooms: they are map
 * instances (`home:<ownerId>`) of the same room, so chat, timers, voice and
 * video all keep working inside them.
 */
export class HomesController {
  /** Homes that have visitors (or an owner) in this room instance, with their current map. */
  private readonly cache = new Map<string, CachedHome>();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(private readonly host: HomeHost) {
    this.unsubscribe.push(
      homeBus.on('layout', (ownerId) => void this.refreshHome(ownerId)),
      homeBus.on('access', (ownerId) => void this.enforceAccess(ownerId)),
      homeBus.on('street', (page) => this.refreshStreet(page)),
      homeBus.on('friendship', (a, b) => {
        void this.enforceAccess(a);
        void this.enforceAccess(b);
        this.refreshStreetsOf([a, b]);
      }),
    );
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.cache.clear();
  }

  // ---- maps ---------------------------------------------------------------------

  /** The map for any runtime map id, or undefined if it is not loaded here. */
  resolve(mapId: string): ServerMap | undefined {
    const parsed = parseMapId(mapId);
    if (parsed.kind === 'place') return this.host.world.maps.get(parsed.id);
    if (parsed.kind === 'street') return streetPageMap(this.host.world, parsed.page);
    return this.cache.get(parsed.ownerId)?.map;
  }

  private cacheHome(record: HomeRecord, rebuild = false): CachedHome {
    const existing = this.cache.get(record.ownerId);
    if (existing && !rebuild && existing.record.version === record.version && existing.record.tier === record.tier) {
      existing.record = record;
      return existing;
    }
    const entry: CachedHome = { record, map: homeRuntimeMap(this.host.world, record.ownerId, layoutOf(record)) };
    this.cache.set(record.ownerId, entry);
    return entry;
  }

  private membersOf(ownerId: string): PlayerSession[] {
    const id = homeMapId(ownerId);
    return [...this.host.sessions.values()].filter((s) => s.player.map === id);
  }

  /** Forgets a home's map once nobody is in it any more. */
  private release(mapId: string): void {
    const parsed = parseMapId(mapId);
    if (parsed.kind !== 'home') return;
    if (this.membersOf(parsed.ownerId).length === 0) this.cache.delete(parsed.ownerId);
  }

  /** Call when a player leaves the room. */
  onLeave(mapId: string): void {
    this.release(mapId);
  }

  // ---- messages out ---------------------------------------------------------------

  private alive(s: PlayerSession): boolean {
    return this.host.sessions.get(s.id) === s;
  }

  private result(s: PlayerSession, op: string, ok: boolean, reason?: HomeResultMessage['reason']): void {
    const message: HomeResultMessage = { op, ok, ...(reason === undefined ? {} : { reason }) };
    s.client.send(S2C.homeResult, message);
  }

  private notice(s: PlayerSession, text: string): void {
    const message: NoticeMessage = { text };
    s.client.send(S2C.notice, message);
  }

  private homeInfo(record: HomeRecord, mine: boolean): HomeInfoMessage {
    return {
      ownerId: record.ownerId,
      ownerName: record.ownerName,
      number: record.number,
      tier: record.tier,
      visibility: record.visibility,
      wallpaper: record.wallpaper,
      floor: record.floor,
      items: record.layout,
      version: record.version,
      mine,
    };
  }

  private sendHomeInfo(s: PlayerSession, record: HomeRecord): void {
    s.client.send(S2C.homeInfo, this.homeInfo(record, s.userId === record.ownerId));
  }

  /** Runs a database-backed task; turns "database down" into a clear result and any other failure into a logged refusal. */
  private async guarded(s: PlayerSession, op: string, task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error) {
      if (error instanceof AccountsUnavailableError) this.result(s, op, false, 'unavailable');
      else {
        console.error('[homes]', error);
        this.result(s, op, false, 'invalid');
      }
    }
  }

  // ---- access -----------------------------------------------------------------------

  /** Whether `userId` (null for a guest) may be inside this home. */
  private async access(userId: string | null, record: HomeRecord): Promise<Access> {
    if (userId !== null && userId === record.ownerId) return 'ok';
    if (record.visibility === 'open') return 'ok';
    if (record.visibility === 'private') return 'private';
    if (userId === null) return 'friends-only';
    return (await areFriends(userId, record.ownerId)) ? 'ok' : 'friends-only';
  }

  // ---- trips ----------------------------------------------------------------------------

  /** Moves a player to a spawn of a map, telling their client. */
  private moveTo(s: PlayerSession, map: ServerMap, spawnId: string, reason: TeleportMessage['reason'] = 'door'): void {
    const spawn = map.spawns.get(spawnId) ?? map.spawns.get('entrance') ?? [...map.spawns.values()][0];
    if (!spawn) return;
    const from = s.player.map;
    const spot = this.host.spawnPoint(map, spawn);
    s.place(spot.x, spot.y, spawn.facing, map.id);
    this.host.teleport(s, reason);
    if (from !== map.id) this.release(from);
  }

  /** Puts a player on a street page. */
  private toStreet(s: PlayerSession, page: number, spawnId: string, reason: TeleportMessage['reason'] = 'door'): void {
    this.moveTo(s, streetPageMap(this.host.world, page), spawnId, reason);
    void this.sendStreet(s);
  }

  /** `homeEnter`: travel to a home by its owner's id. */
  async enter(s: PlayerSession, raw: unknown): Promise<void> {
    const ownerId = isPlainObject(raw) && typeof raw.ownerId === 'string' ? raw.ownerId : '';
    if (ownerId === '' || ownerId.length > 64) return this.result(s, 'enter', false, 'no-such-home');
    await this.travelToHome(s, ownerId);
  }

  private async travelToHome(s: PlayerSession, ownerId: string): Promise<void> {
    if (s.busy) return;
    s.busy = true;
    try {
      await this.guarded(s, 'enter', async () => {
        const own = s.userId !== null && s.userId === ownerId;
        let record: HomeRecord | null;
        if (own) {
          const made = await ensureHome(ownerId);
          record = made.home;
          if (made.created) homeBus.emit('street', streetPageOf(record.number));
        } else {
          record = await loadHome(ownerId);
        }
        if (!record) return this.result(s, 'enter', false, 'no-such-home');
        const access = await this.access(s.userId, record);
        if (access !== 'ok') return this.result(s, 'enter', false, access);
        if (!this.alive(s)) return;

        if (s.seatKey !== null) this.host.stand(s, serverConfig.now(), false);
        const entry = this.cacheHome(record);
        // The client needs the layout before the map loads, so this goes out first.
        this.sendHomeInfo(s, entry.record);
        this.moveTo(s, entry.map, 'entrance');
        this.result(s, 'enter', true);
      });
    } finally {
      s.busy = false;
    }
  }

  /**
   * Handles doors whose target the server decides. Returns true when it took
   * over (even to refuse), false when the door is an ordinary fixed one.
   */
  handleDoor(s: PlayerSession, door: DoorDef): boolean {
    const here = parseMapId(s.player.map);
    if (here.kind === 'place') {
      if (door.targetMap !== 'street') return false;
      this.toStreet(s, 1, door.targetSpawn || 'from-west');
      return true;
    }
    if (s.busy) return true;
    s.busy = true;
    const done = (): void => {
      s.busy = false;
    };
    if (here.kind === 'street') {
      void this.guarded(s, 'enter', () => this.streetDoor(s, here.page, door)).finally(done);
    } else if (door.id === 'exit') {
      void this.guarded(s, 'enter', () => this.leaveHome(s, here.ownerId)).finally(done);
    } else {
      done();
    }
    return true;
  }

  private async streetDoor(s: PlayerSession, page: number, door: DoorDef): Promise<void> {
    const target = streetDoorTarget(page, door.id, streetPageOf(Math.max(1, await highestHouseNumber())));
    if (!this.alive(s)) return;
    switch (target.kind) {
      case 'house': {
        const home = await loadHomeByNumber(target.number);
        if (!home) return this.result(s, 'enter', false, 'no-such-home');
        const access = await this.access(s.userId, home);
        if (access !== 'ok') return this.result(s, 'enter', false, access);
        if (!this.alive(s)) return;
        const entry = this.cacheHome(home);
        this.sendHomeInfo(s, entry.record);
        this.moveTo(s, entry.map, 'entrance');
        this.result(s, 'enter', true);
        return;
      }
      case 'hub': {
        const hub = this.host.world.maps.get('hub') ?? this.host.world.maps.get(this.host.world.start.map);
        if (hub) this.moveTo(s, hub, hub.spawns.has('from-street') ? 'from-street' : this.host.world.start.spawn.id);
        return;
      }
      case 'street':
        this.toStreet(s, target.page, target.spawn);
        return;
      case 'end':
        this.notice(s, 'That is the end of the street.');
        return;
      default:
        return;
    }
  }

  private async leaveHome(s: PlayerSession, ownerId: string): Promise<void> {
    const number = this.cache.get(ownerId)?.record.number ?? (await loadHome(ownerId))?.number;
    if (!this.alive(s)) return;
    if (number === undefined) return this.toStreet(s, 1, 'entrance');
    this.toStreet(s, streetPageOf(number), `from-house-${slotOf(number)}`);
  }

  // ---- the street ----------------------------------------------------------------------------

  private async streetInfoFor(userId: string | null, page: number): Promise<StreetInfoMessage> {
    const first = houseNumber(page, 1);
    const last = houseNumber(page, HOUSES_PER_STREET);
    const [homes, highest, friends] = await Promise.all([
      homesInRange(first, last),
      highestHouseNumber(),
      userId ? friendIdsOf(userId) : Promise.resolve(new Set<string>()),
    ]);
    const byNumber = new Map(homes.map((h) => [h.number, h]));
    const houses: StreetHouse[] = [];
    for (let slot = 1; slot <= HOUSES_PER_STREET; slot++) {
      const home = byNumber.get(houseNumber(page, slot));
      if (!home) {
        houses.push({ slot, ownerId: null, ownerName: null, visibility: null, canEnter: false });
        continue;
      }
      const canEnter = home.ownerId === userId || home.visibility === 'open' || (home.visibility === 'friends' && friends.has(home.ownerId));
      houses.push({ slot, ownerId: home.ownerId, ownerName: home.ownerName, visibility: home.visibility, canEnter });
    }
    return { page, lastPage: streetPageOf(Math.max(1, highest)), houses };
  }

  /** Sends the houses of the street page the player is on. */
  async sendStreet(s: PlayerSession): Promise<void> {
    const here = parseMapId(s.player.map);
    if (here.kind !== 'street') return;
    try {
      const info = await this.streetInfoFor(s.userId, here.page);
      if (this.alive(s) && s.player.map === streetMapId(here.page)) s.client.send(S2C.streetInfo, info);
    } catch (error) {
      if (!(error instanceof AccountsUnavailableError)) console.error('[homes]', error);
    }
  }

  private refreshStreet(page: number): void {
    const id = streetMapId(page);
    for (const s of this.host.sessions.values()) if (s.player.map === id) void this.sendStreet(s);
  }

  private refreshStreetsOf(userIds: string[]): void {
    for (const s of this.host.sessions.values()) {
      if (s.userId && userIds.includes(s.userId) && parseMapId(s.player.map).kind === 'street') void this.sendStreet(s);
    }
  }

  // ---- keeping visitors in step -------------------------------------------------------------------

  /** Moves visitors out when the home is no longer open to them (it went private, or a friendship ended). */
  private async enforceAccess(ownerId: string): Promise<void> {
    const visitors = this.membersOf(ownerId).filter((m) => m.userId !== ownerId);
    if (visitors.length === 0) return;
    let record: HomeRecord | null;
    try {
      record = await loadHome(ownerId);
    } catch {
      return;
    }
    for (const visitor of visitors) {
      if (!this.alive(visitor) || visitor.player.map !== homeMapId(ownerId)) continue;
      let access: Access = 'private';
      try {
        if (record) access = await this.access(visitor.userId, record);
      } catch {
        continue;
      }
      if (access === 'ok') continue;
      if (visitor.seatKey !== null) this.host.stand(visitor, serverConfig.now(), false);
      this.notice(visitor, access === 'friends-only' ? 'That home is now friends-only, so you were shown out.' : 'The owner made that home private, so you were shown out.');
      if (record) this.toStreet(visitor, streetPageOf(record.number), `from-house-${slotOf(record.number)}`);
      else this.toStreet(visitor, 1, 'entrance');
    }
  }

  /** Reloads a home that changed (here or in another room instance) and shows it to everyone inside. */
  private async refreshHome(ownerId: string): Promise<void> {
    const members = this.membersOf(ownerId);
    if (members.length === 0 && !this.cache.has(ownerId)) return;
    let fresh: HomeRecord | null;
    try {
      fresh = await loadHome(ownerId);
    } catch {
      return;
    }
    if (!fresh) return;
    const cached = this.cache.get(ownerId);
    if (cached && cached.record.version === fresh.version && cached.record.tier === fresh.tier) return;
    const tierChanged = cached !== undefined && cached.record.tier !== fresh.tier;
    this.applyToMembers(this.cacheHome(fresh, true), tierChanged);
  }

  private toEntrance(s: PlayerSession, map: ServerMap): void {
    const spawn = map.spawns.get('entrance') ?? [...map.spawns.values()][0];
    if (!spawn) return;
    const spot = this.host.spawnPoint(map, spawn);
    s.place(spot.x, spot.y, spawn.facing);
    this.host.teleport(s, 'spawn');
  }

  /** Shows a changed home to everyone in it and fixes anyone the change left in a bad spot. */
  private applyToMembers(entry: CachedHome, tierChanged: boolean): void {
    const now = serverConfig.now();
    for (const m of this.membersOf(entry.record.ownerId)) {
      this.sendHomeInfo(m, entry.record);
      // A seat that no longer exists: stand up (ending any timer), like leaving it.
      if (m.seatKey !== null && !entry.map.seats.has(m.player.seatId)) this.host.stand(m, now, true);
      if (m.seatKey === null && (tierChanged || feetBlocked(entry.map.collision, m.x, m.y))) this.toEntrance(m, entry.map);
    }
  }

  // ---- edits and the shop ------------------------------------------------------------------------------

  /** `homeEdit` from the owner, in their own home. */
  edit(s: PlayerSession, raw: unknown): void {
    const parsed = parseEditMessage(raw);
    const op = parsed?.edit.op ?? 'edit';
    if (!s.userId) return this.result(s, op, false, 'not-signed-in');
    if (!parsed) return this.result(s, op, false, 'invalid');
    const here = parseMapId(s.player.map);
    if (here.kind !== 'home') return this.result(s, op, false, 'not-in-home');
    if (here.ownerId !== s.userId) return this.result(s, op, false, 'not-owner');
    const userId = s.userId;
    void enqueue(userId, () => this.guarded(s, op, () => this.runEdit(s, userId, parsed)));
  }

  private async runEdit(s: PlayerSession, userId: string, parsed: NonNullable<ReturnType<typeof parseEditMessage>>): Promise<void> {
    const op = parsed.edit.op;
    const { home } = await ensureHome(userId);
    if (parsed.version !== home.version) {
      // The client edited an old picture of the room: show the current one and refuse.
      this.refreshFromRecord(home);
      this.result(s, op, false, 'stale');
      return;
    }
    const inventory = await loadInventory(userId);
    const outcome = evaluateEdit(home, inventory, parsed.edit);
    if (!outcome.ok) return this.result(s, op, false, outcome.reason);

    let saved: HomeRecord | null;
    if (outcome.kind === 'upgrade') {
      const upgraded = await upgrade(userId, home.id, home.version, outcome.nextTier, outcome.price);
      if (!upgraded.ok) {
        if (upgraded.reason === 'stale') this.refreshFromRecord((await loadHome(userId)) ?? home);
        return this.result(s, op, false, upgraded.reason);
      }
      saved = upgraded.home;
      if (this.alive(s)) {
        s.client.send(S2C.inventory, upgraded.inventory);
        void this.host.pushStats(s);
      }
    } else {
      saved = await saveHome(home.id, home.version, outcome.patch);
      if (!saved) {
        this.refreshFromRecord((await loadHome(userId)) ?? home);
        return this.result(s, op, false, 'stale');
      }
    }

    this.result(s, op, true);
    const tierChanged = saved.tier !== home.tier;
    this.applyToMembers(this.cacheHome(saved, true), tierChanged);
    homeBus.emit('layout', userId);
    if (saved.visibility !== home.visibility) {
      homeBus.emit('access', userId);
      homeBus.emit('street', streetPageOf(saved.number));
    }
  }

  /** The stored home differs from what clients were shown: update the cache and everyone inside. */
  private refreshFromRecord(record: HomeRecord): void {
    const cached = this.cache.get(record.ownerId);
    if (cached && cached.record.version === record.version && cached.record.tier === record.tier) {
      for (const m of this.membersOf(record.ownerId)) this.sendHomeInfo(m, record);
      return;
    }
    if (this.membersOf(record.ownerId).length === 0 && !cached) return;
    this.applyToMembers(this.cacheHome(record, true), cached !== undefined && cached.record.tier !== record.tier);
  }

  /** `shopBuy`: spend coins on furniture or a surface. */
  buy(s: PlayerSession, raw: unknown): void {
    if (!s.userId) return this.result(s, 'buy', false, 'not-signed-in');
    if (!isPlainObject(raw) || typeof raw.itemId !== 'string' || !isFiniteNumber(raw.quantity)) return this.result(s, 'buy', false, 'invalid');
    const itemId = raw.itemId;
    const quantity = raw.quantity;
    const userId = s.userId;
    void enqueue(userId, () =>
      this.guarded(s, 'buy', async () => {
        const bought = await buy(userId, itemId, quantity);
        if (!bought.ok) return this.result(s, 'buy', false, bought.reason);
        if (!this.alive(s)) return;
        s.client.send(S2C.inventory, bought.inventory);
        this.result(s, 'buy', true);
        await this.host.pushStats(s);
      }),
    );
  }

  /** On joining as an account: make sure the home exists and send the inventory. */
  async onAccountJoin(s: PlayerSession): Promise<void> {
    if (!s.userId) return;
    try {
      const made = await ensureHome(s.userId);
      if (made.created) homeBus.emit('street', streetPageOf(made.home.number));
      const inventory = await loadInventory(s.userId);
      if (this.alive(s)) s.client.send(S2C.inventory, inventory);
    } catch (error) {
      if (!(error instanceof AccountsUnavailableError)) console.error('[homes]', error);
    }
  }
}
