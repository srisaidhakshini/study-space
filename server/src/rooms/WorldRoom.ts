import { Room, ServerError, type Client } from '@colyseus/core';
import {
  BUDDIES,
  C2S,
  DOOR_MARGIN,
  DRINK_ZONE_PREFIX,
  EMOTES,
  JOIN_ERROR,
  dayKeyAt,
  type SessionRecord,
  NAME_MAX_LENGTH,
  PATCH_RATE_MS,
  REPORT_REASON_MAX,
  S2C,
  SERVER_TICK_MS,
  SIT_RANGE,
  STUDY_TOGETHER,
  TILE,
  advanceTimer,
  feetBlocked,
  isNameAllowed,
  seatFeetPosition,
  startTimer,
  stopTimer,
  zoneAt,
  type Appearance,
  type ChatDeniedMessage,
  type CorrectMessage,
  type EmoteName,
  type NoticeMessage,
  type PlayAnimMessage,
  type SitResultMessage,
  type SpawnDef,
  type TeleportMessage,
  type TimerEventMessage,
  type WelcomeMessage,
} from '@study/shared';
import { verifyToken } from '../auth/token';
import { serverConfig } from '../config';
import { findUserById, touchLogin } from '../db/accounts';
import { AccountsUnavailableError } from '../db/client';
import type { User } from '../generated/prisma/client';
import { loadStatsMessage, recordServerSession } from '../db/stats';
import { addReport } from '../moderation/reports';
import { enqueue, retryOnce } from './persist';
import { Player, WorldState } from '../schema/PlayerState';
import { BuddyRoom } from '../studyTogether/BuddyRoom';
import { QuestionBoards } from '../studyTogether/QuestionBoards';
import { sharedTree } from '../studyTogether/tree';
import { getWorld, type ServerMap } from '../world/maps';
import { sendChat } from './chat';
import { HomesController } from './homes';
import { checkMove, parseMove } from './movement';
import { PlayerSession } from './session';
import { cleanText, isFiniteNumber, isPlainObject } from './text';
import { countRecords, deriveAnim, parseTimerConfig, rollDay, writeTimer } from './timers';
import { VIDEO_CHANNEL, VoiceHub } from './voice';

export interface RoomMeta {
  server: string;
  inviteCode: string;
}

/** Options the HTTP API passes when it opens an instance. */
export interface CreateOptions {
  server?: string;
  inviteCode?: string;
}

const EMOTE_COOLDOWN_MS = 1500;
const MAX_BLOCKED = 200;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** One instance of a named server. Every map lives in the same room; players carry a `map` field. */
export class WorldRoom extends Room<{ state: WorldState; metadata: RoomMeta }> {
  private readonly world = getWorld();
  private readonly sessions = new Map<string, PlayerSession>();
  private readonly buddies = new BuddyRoom(this.sessions);
  private readonly boards = new QuestionBoards(this.sessions, () => ({ server: this.serverName, roomId: this.roomId }));
  private lastTreeMinutes = -1;
  private readonly voice = new VoiceHub(this.sessions);
  /** Camera sharing for the room instance. */
  private readonly video = new VoiceHub(this.sessions, VIDEO_CHANNEL);
  /** `${map}:${seatId}` -> session id of whoever sits there. */
  private readonly seats = new Map<string, string>();
  private serverName = '';
  private inviteCode = '';
  /** Homes, the residential street, the shop and their rules. */
  private homes!: HomesController;

  onCreate(options: CreateOptions): void {
    this.maxClients = serverConfig.maxPlayers;
    this.maxMessagesPerSecond = 120;
    this.setPatchRate(PATCH_RATE_MS);
    this.setState(new WorldState());
    this.homes = new HomesController({
      sessions: this.sessions,
      world: this.world,
      stand: (s, now, notify) => this.stand(s, now, notify),
      teleport: (s, reason) => this.teleport(s, reason),
      spawnPoint: (map, spawn) => this.spawnPoint(map, spawn),
      pushStats: (s) => this.pushStats(s),
    });
    this.serverName = typeof options?.server === 'string' ? options.server : 'Unnamed';
    this.inviteCode = typeof options?.inviteCode === 'string' ? options.inviteCode : '';
    void this.setMetadata({ server: this.serverName, inviteCode: this.inviteCode });

    this.onMessage(C2S.move, (c, m) => this.onMove(c, m));
    this.onMessage(C2S.door, (c, m) => this.onDoor(c, m));
    this.onMessage(C2S.sit, (c, m) => this.onSit(c, m));
    this.onMessage(C2S.stand, (c) => this.withSession(c, (s) => this.stand(s, serverConfig.now(), true)));
    this.onMessage(C2S.timerStart, (c, m) => this.onTimerStart(c, m));
    this.onMessage(C2S.timerStop, (c) => this.withSession(c, (s) => this.endTimer(s, serverConfig.now())));
    this.onMessage(C2S.chat, (c, m) => this.onChat(c, m));
    this.onMessage(C2S.emote, (c, m) => this.onEmote(c, m));
    this.onMessage(C2S.report, (c, m) => this.onReport(c, m));
    this.onMessage(C2S.block, (c, m) => this.onBlock(c, m, true));
    this.onMessage(C2S.unblock, (c, m) => this.onBlock(c, m, false));
    this.onMessage(C2S.voiceJoin, (c) => this.withSession(c, (s) => this.voice.join(s)));
    this.onMessage(C2S.voiceLeave, (c) => this.voice.leave(c.sessionId));
    this.onMessage(C2S.voiceSignal, (c, m) => this.withSession(c, (s) => this.voice.signal(s, m, Date.now())));
    this.onMessage(C2S.videoJoin, (c) => this.withSession(c, (s) => this.video.join(s)));
    this.onMessage(C2S.videoLeave, (c) => this.video.leave(c.sessionId));
    this.onMessage(C2S.videoSignal, (c, m) => this.withSession(c, (s) => this.video.signal(s, m, Date.now())));
    this.onMessage(C2S.homeEnter, (c, m) => this.withSession(c, (s) => void this.homes.enter(s, m)));
    this.onMessage(C2S.homeEdit, (c, m) => this.withSession(c, (s) => this.homes.edit(s, m)));
    this.onMessage(C2S.shopBuy, (c, m) => this.withSession(c, (s) => this.homes.buy(s, m)));

    this.buddies.open();
    this.onMessage(BUDDIES.action, (c, m) => this.withSession(c, (s) => void this.buddies.action(s, m, serverConfig.now())));
    this.onMessage(STUDY_TOGETHER.boardAction, (c, m) => this.withSession(c, (s) => this.boards.handle(s, m, serverConfig.now())));

    this.clock.setInterval(() => this.tick(), SERVER_TICK_MS);
  }

  /**
   * Guests (no token) are let straight in. A token must be valid: a bad or
   * expired one is refused with a clear message rather than quietly becoming
   * a guest, so the player never plays a whole session that is not saved.
   */
  async onAuth(_client: Client, options: unknown): Promise<{ user: User | null }> {
    const token = isPlainObject(options) ? options.token : undefined;
    if (token === undefined || token === null || token === '') return { user: null };
    const userId = verifyToken(token, serverConfig.now());
    const expired = new ServerError(JOIN_ERROR.invalidToken, 'Your login has expired. Please sign in again.');
    if (!userId) throw expired;
    try {
      const user = await findUserById(userId);
      if (!user) throw expired;
      return { user };
    } catch (error) {
      if (error instanceof AccountsUnavailableError) {
        throw new ServerError(JOIN_ERROR.accountsUnavailable, 'Accounts are unavailable right now. You can still play as a guest.');
      }
      throw error;
    }
  }

  onJoin(client: Client, options: unknown): void {
    const opts = isPlainObject(options) ? options : {};
    const user = (client.auth as { user: User | null } | undefined)?.user ?? null;
    const firstPet = this.world.petIds[0] ?? '';
    let name = user ? user.name : cleanText(opts.name, NAME_MAX_LENGTH);
    if (name === '' || !isNameAllowed(name)) name = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
    // Account players always use their saved look; guests bring theirs.
    const looks = user ? user.appearanceJson : isPlainObject(opts.appearance) ? opts.appearance : null;
    const appearance = this.world.sanitizeAppearance(isPlainObject(looks) ? (looks as Partial<Appearance>) : null);
    const wantedPet = user ? user.pet : opts.pet;
    const pet = typeof wantedPet === 'string' && this.world.petIds.includes(wantedPet) ? wantedPet : firstPet;
    const tz = isFiniteNumber(opts.tzOffsetMin) ? clamp(Math.round(opts.tzOffsetMin), -840, 840) : 0;
    if (user) this.kickOlderConnections(user.id);

    const { map: mapId, spawn } = this.world.start;
    const spot = this.spawnPoint(this.world.maps.get(mapId)!, spawn);
    const player = new Player();
    player.id = client.sessionId;
    player.name = name;
    player.appearance = JSON.stringify(appearance);
    player.pet = pet;
    player.tz = tz;
    player.map = mapId;
    player.dir = spawn.facing;
    player.anim = 'idle';
    player.seatId = '';
    player.sessionsToday = 0;

    const session = new PlayerSession(client, player);
    session.userId = user?.id ?? null;
    session.dayKey = dayKeyAt(serverConfig.now(), tz);
    session.place(spot.x, spot.y, spawn.facing, mapId);
    writeTimer(player, session.timer);
    this.sessions.set(client.sessionId, session);
    this.state.players.set(client.sessionId, player);
    if (user) {
      // Today's count, coins and streak come from the database, in order with any saves.
      void retryOnce('note login', () => touchLogin(user.id, tz));
      enqueue(user.id, () => this.pushStats(session));
      enqueue(user.id, () => this.homes.onAccountJoin(session));
    }

    const welcome: WelcomeMessage = {
      id: client.sessionId,
      server: this.serverName,
      inviteCode: this.inviteCode,
      map: mapId,
      x: session.x,
      y: session.y,
      dir: spawn.facing,
    };
    client.send(S2C.welcome, welcome);
    client.send(STUDY_TOGETHER.tree, sharedTree().minutes);
    this.buddies.join(session);
  }

  onLeave(client: Client): void {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    this.stand(s, serverConfig.now(), false);
    this.voice.leave(client.sessionId);
    this.video.leave(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.homes.onLeave(s.player.map);
    this.buddies.leave(s);
  }

  onDispose(): Promise<void> {
    this.homes.dispose();
    return this.buddies.close();
  }

  // ---- accounts ----------------------------------------------------------

  /** One live connection per account per instance: the newest one wins. */
  private kickOlderConnections(userId: string): void {
    for (const old of this.sessions.values()) {
      if (old.userId !== userId) continue;
      const notice: NoticeMessage = { text: 'You signed in somewhere else, so this connection was closed.' };
      old.client.send(S2C.notice, notice);
      old.client.leave(JOIN_ERROR.signedInElsewhere, 'Signed in somewhere else');
    }
  }

  /** Sends the account's coins, today's totals and streak, and syncs the overhead session count. */
  private async pushStats(s: PlayerSession): Promise<void> {
    if (!s.userId) return;
    const userId = s.userId;
    const stats = await retryOnce('load stats', () => loadStatsMessage(userId, s.player.tz, serverConfig.now()));
    if (!stats || this.sessions.get(s.id) !== s) return;
    s.player.sessionsToday = stats.todaySessions;
    s.client.send(S2C.stats, stats);
  }

  /**
   * Saves finished sessions for an account player and pays their coins. This
   * is the only way coins are earned. Guests save nothing. The write is queued,
   * retried once, and never blocks or breaks the room if the database is down.
   */
  private persist(s: PlayerSession, records: readonly SessionRecord[]): void {
    const userId = s.userId;
    if (!userId) return;
    for (const record of records) {
      enqueue(userId, async () => {
        await retryOnce('save session', () => recordServerSession(userId, record));
        await this.pushStats(s);
      });
    }
  }

  // ---- helpers -----------------------------------------------------------

  private withSession(client: Client, fn: (s: PlayerSession) => void): void {
    const s = this.sessions.get(client.sessionId);
    if (s) fn(s);
  }

  /** The map a player is on: a shared place, a street page or a home. */
  private mapOf(s: PlayerSession): ServerMap {
    return this.homes.resolve(s.player.map) ?? this.world.maps.get(this.world.start.map)!;
  }

  /** A walkable spot at or near the spawn, so arrivals do not stack exactly. */
  private spawnPoint(map: ServerMap, spawn: SpawnDef): { x: number; y: number } {
    for (let i = 0; i < 10; i++) {
      const x = spawn.x + (i === 0 ? 0 : (Math.random() - 0.5) * 24);
      const y = spawn.y + (i === 0 ? 0 : (Math.random() - 0.5) * 12);
      if (!feetBlocked(map.collision, x, y)) return { x, y };
    }
    return { x: spawn.x, y: spawn.y };
  }

  private teleport(s: PlayerSession, reason: TeleportMessage['reason']): void {
    s.moving = false;
    s.player.anim = 'idle';
    const message: TeleportMessage = { map: s.player.map, x: s.x, y: s.y, dir: s.player.dir as TeleportMessage['dir'], reason };
    s.client.send(S2C.teleport, message);
  }

  private touch(s: PlayerSession): void {
    s.restSince = serverConfig.now();
  }

  // ---- movement, doors, seats ---------------------------------------------

  private onMove(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      const move = parseMove(raw);
      if (!move) return;
      const now = serverConfig.now();
      const verdict = checkMove(s, this.mapOf(s), move, now);
      if (verdict === 'ignore') return;
      if (verdict === 'reject') {
        const fix: CorrectMessage = { seq: move.seq, x: s.x, y: s.y };
        client.send(S2C.correct, fix);
        return;
      }
      s.x = move.x;
      s.y = move.y;
      s.player.x = move.x;
      s.player.y = move.y;
      s.player.dir = move.dir;
      s.moving = move.moving;
      s.lastMoveAt = now;
      s.player.anim = move.moving ? 'walk' : 'idle';
      this.touch(s);
    });
  }

  private onDoor(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      if (s.seatKey !== null || !isPlainObject(raw) || typeof raw.doorId !== 'string') return;
      const door = this.mapOf(s).doors.get(raw.doorId);
      if (!door) return;
      const r = door.rect;
      const inside =
        s.x >= r.x - DOOR_MARGIN && s.x <= r.x + r.width + DOOR_MARGIN && s.y >= r.y - DOOR_MARGIN && s.y <= r.y + r.height + DOOR_MARGIN;
      if (!inside) return;
      // Street and home doors, and the town's way to the street, are decided by the homes controller.
      if (this.homes.handleDoor(s, door)) return;
      const target = this.world.maps.get(door.targetMap);
      const spawn = target?.spawns.get(door.targetSpawn);
      if (!target || !spawn) return;
      const spot = this.spawnPoint(target, spawn);
      s.place(spot.x, spot.y, spawn.facing, target.id);
      this.teleport(s, 'door');
    });
  }

  private onSit(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      if (!isPlainObject(raw) || typeof raw.seatId !== 'string') return;
      const seatId = raw.seatId;
      const reply = (result: Omit<SitResultMessage, 'seatId'>): void => client.send(S2C.sitResult, { seatId, ...result });
      if (s.seatKey !== null) return reply({ ok: false, reason: 'seated' });
      const seat = this.mapOf(s).seats.get(seatId);
      if (!seat) return reply({ ok: false, reason: 'unknown' });
      const key = `${s.player.map}:${seat.id}`;
      if (this.seats.has(key)) return reply({ ok: false, reason: 'taken' });
      const near = Math.hypot(s.x - (seat.tx * TILE + TILE / 2), s.y - 3 - (seat.ty * TILE + TILE / 2));
      if (near > SIT_RANGE) return reply({ ok: false, reason: 'far' });

      const now = serverConfig.now();
      s.standPos = { x: s.x, y: s.y, dir: s.player.dir as 'down' };
      const feet = seatFeetPosition(seat);
      s.place(feet.x, feet.y, seat.facing);
      s.seatKey = key;
      s.moving = false;
      s.restSince = now;
      this.seats.set(key, s.id);
      s.player.seatId = seat.id;
      s.player.anim = seat.kind === 'bed' ? 'sleep' : 'sit';
      reply({ ok: true, x: feet.x, y: feet.y, dir: seat.facing });
    });
  }

  /** Gets the player up: ends any timer, frees the seat and, if asked, tells the client where they went. */
  private stand(s: PlayerSession, now: number, notify: boolean): void {
    if (s.seatKey === null) return;
    this.endTimer(s, now);
    this.seats.delete(s.seatKey);
    s.seatKey = null;
    s.player.seatId = '';
    const back = s.standPos;
    s.standPos = null;
    if (!back) return;
    s.place(back.x, back.y, back.dir);
    s.moving = false;
    s.player.anim = 'idle';
    if (notify) this.teleport(s, 'stand');
  }

  // ---- timers ----------------------------------------------------------------

  private onTimerStart(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      const config = parseTimerConfig(raw);
      if (!config || s.seatKey === null || s.timer.phase !== 'idle') return;
      if (this.mapOf(s).seats.get(s.player.seatId)?.kind === 'bed') return;
      const now = serverConfig.now();
      s.timer = startTimer(config, now);
      writeTimer(s.player, s.timer);
      s.player.anim = deriveAnim(s, now);
      const event: TimerEventMessage = { event: 'focusStart' };
      s.client.send(S2C.timerEvent, event);
    });
  }

  private contributeToTree(s: PlayerSession, records: readonly SessionRecord[]): void {
    if (s.player.map === 'garden' && records.length > 0) {
      sharedTree().add(records.reduce((sum, record) => sum + record.minutes, 0));
    }
  }

  /** Ends the running timer now, crediting the whole minutes of focus done. */
  private endTimer(s: PlayerSession, now: number): void {
    if (s.timer.phase === 'idle') return;
    this.buddies.tick(now);
    this.advance(s, now);
    const { state, record } = stopTimer(s.timer, now);
    s.timer = state;
    writeTimer(s.player, s.timer);
    s.restSince = now;
    if (record) {
      countRecords(s, [record], now);
      s.client.send(S2C.session, { record });
      this.contributeToTree(s, [record]);
      this.persist(s, [record]);
    }
    s.player.anim = deriveAnim(s, now);
  }

  /** Crosses any phase boundaries that have passed and reports them to the owner. */
  private advance(s: PlayerSession, now: number): void {
    if (s.timer.phase === 'idle') return;
    const step = advanceTimer(s.timer, now);
    if (step.state === s.timer) return;
    s.timer = step.state;
    writeTimer(s.player, s.timer);
    countRecords(s, step.records, now);
    for (const record of step.records) s.client.send(S2C.session, { record });
    this.contributeToTree(s, step.records);
    this.persist(s, step.records);
    for (const event of step.events) {
      s.client.send(S2C.timerEvent, { event });
      if (event === 'breakStart') {
        const stretch: PlayAnimMessage = { id: s.id, anim: 'stretch' };
        this.broadcast(S2C.playAnim, stretch);
      }
    }
    if (s.timer.phase === 'idle') s.restSince = now;
  }

  private tick(): void {
    const now = serverConfig.now();
    this.buddies.tick(now);
    const treeMinutes = sharedTree().minutes;
    if (treeMinutes !== this.lastTreeMinutes) {
      this.lastTreeMinutes = treeMinutes;
      this.broadcast(STUDY_TOGETHER.tree, treeMinutes);
    }
    for (const s of this.sessions.values()) {
      rollDay(s, now);
      this.advance(s, now);
      const anim = s.seatKey && this.mapOf(s).seats.get(s.player.seatId)?.kind === 'bed' ? 'sleep' : deriveAnim(s, now);
      if (s.player.anim !== anim) s.player.anim = anim;
    }
  }

  // ---- social ---------------------------------------------------------------------

  private onChat(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      this.touch(s);
      const text = isPlainObject(raw) ? raw.text : undefined;
      const reason = sendChat(s, text, this.sessions, (id) => this.homes.resolve(id), serverConfig.now());
      if (reason) {
        const denied: ChatDeniedMessage = { reason };
        client.send(S2C.chatDenied, denied);
      }
    });
  }

  private onEmote(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      const now = serverConfig.now();
      if (!isPlainObject(raw) || !EMOTES.includes(raw.name as EmoteName)) return;
      const name = raw.name as EmoteName;
      if (now - s.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
      if (name === 'drink') {
        // Drinks are ordered standing in the cafe, never while seated.
        const zone = zoneAt(this.mapOf(s).objects.zones, s.x, s.y);
        if (s.player.seatId !== '' || !zone?.id.startsWith(DRINK_ZONE_PREFIX)) return;
      }
      s.lastEmoteAt = now;
      this.touch(s);
      const anim: PlayAnimMessage = { id: s.id, anim: name };
      this.broadcast(S2C.playAnim, anim);
    });
  }

  private onReport(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      if (!isPlainObject(raw) || typeof raw.targetId !== 'string') return;
      const target = this.sessions.get(raw.targetId);
      const notice = (text: string): void => {
        const message: NoticeMessage = { text };
        client.send(S2C.notice, message);
      };
      if (!target || target === s) return notice('Player not found.');
      addReport({
        at: serverConfig.now(),
        server: this.serverName,
        roomId: this.roomId,
        reporterId: s.id,
        reporterName: s.player.name,
        targetId: target.id,
        targetName: target.player.name,
        reason: cleanText(raw.reason, REPORT_REASON_MAX),
      });
      notice('Report sent. Thank you.');
    });
  }

  private onBlock(client: Client, raw: unknown, block: boolean): void {
    this.withSession(client, (s) => {
      if (!isPlainObject(raw) || typeof raw.targetId !== 'string' || raw.targetId === s.id) return;
      if (!block) s.blocked.delete(raw.targetId);
      else if (s.blocked.size < MAX_BLOCKED) s.blocked.add(raw.targetId);
      this.buddies.publishRoster();
      this.boards.send(s);
      const target = this.sessions.get(raw.targetId);
      if (target) this.boards.send(target);
    });
  }
}
