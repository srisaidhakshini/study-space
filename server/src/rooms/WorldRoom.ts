import { Room, type Client } from '@colyseus/core';
import {
  C2S,
  DOOR_MARGIN,
  DRINK_ZONE_PREFIX,
  EMOTES,
  NAME_MAX_LENGTH,
  PATCH_RATE_MS,
  REPORT_REASON_MAX,
  S2C,
  SERVER_TICK_MS,
  SIT_RANGE,
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
import { serverConfig } from '../config';
import { addReport } from '../moderation/reports';
import { Player, WorldState } from '../schema/PlayerState';
import { getWorld, type ServerMap } from '../world/maps';
import { sendChat } from './chat';
import { checkMove, parseMove } from './movement';
import { PlayerSession } from './session';
import { cleanText, isFiniteNumber, isPlainObject } from './text';
import { countRecords, deriveAnim, parseTimerConfig, rollDay, writeTimer } from './timers';
import { VoiceHub } from './voice';

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
  private readonly voice = new VoiceHub(this.sessions);
  /** `${map}:${seatId}` -> session id of whoever sits there. */
  private readonly seats = new Map<string, string>();
  private serverName = '';
  private inviteCode = '';

  onCreate(options: CreateOptions): void {
    this.maxClients = serverConfig.maxPlayers;
    this.maxMessagesPerSecond = 120;
    this.setPatchRate(PATCH_RATE_MS);
    this.setState(new WorldState());
    this.serverName = typeof options?.server === 'string' ? options.server : 'Unnamed';
    this.inviteCode = typeof options?.inviteCode === 'string' ? options.inviteCode : '';
    void this.setMetadata({ server: this.serverName, inviteCode: this.inviteCode });

    this.onMessage(C2S.move, (c, m) => this.onMove(c, m));
    this.onMessage(C2S.door, (c, m) => this.onDoor(c, m));
    this.onMessage(C2S.sit, (c, m) => this.onSit(c, m));
    this.onMessage(C2S.stand, (c) => this.withSession(c, (s) => this.stand(s, Date.now(), true)));
    this.onMessage(C2S.timerStart, (c, m) => this.onTimerStart(c, m));
    this.onMessage(C2S.timerStop, (c) => this.withSession(c, (s) => this.endTimer(s, Date.now())));
    this.onMessage(C2S.chat, (c, m) => this.onChat(c, m));
    this.onMessage(C2S.emote, (c, m) => this.onEmote(c, m));
    this.onMessage(C2S.report, (c, m) => this.onReport(c, m));
    this.onMessage(C2S.block, (c, m) => this.onBlock(c, m, true));
    this.onMessage(C2S.unblock, (c, m) => this.onBlock(c, m, false));
    this.onMessage(C2S.voiceJoin, (c) => this.withSession(c, (s) => this.voice.join(s)));
    this.onMessage(C2S.voiceLeave, (c) => this.voice.leave(c.sessionId));
    this.onMessage(C2S.voiceSignal, (c, m) => this.withSession(c, (s) => this.voice.signal(s, m, Date.now())));

    this.clock.setInterval(() => this.tick(), SERVER_TICK_MS);
  }

  onJoin(client: Client, options: unknown): void {
    const opts = isPlainObject(options) ? options : {};
    let name = cleanText(opts.name, NAME_MAX_LENGTH);
    if (name === '' || !isNameAllowed(name)) name = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
    const appearance = this.world.sanitizeAppearance(isPlainObject(opts.appearance) ? (opts.appearance as Partial<Appearance>) : null);
    const pet = typeof opts.pet === 'string' && this.world.petIds.includes(opts.pet) ? opts.pet : (this.world.petIds[0] ?? '');
    const tz = isFiniteNumber(opts.tzOffsetMin) ? clamp(Math.round(opts.tzOffsetMin), -840, 840) : 0;

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
    session.place(spot.x, spot.y, spawn.facing, mapId);
    writeTimer(player, session.timer);
    this.sessions.set(client.sessionId, session);
    this.state.players.set(client.sessionId, player);

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
  }

  onLeave(client: Client): void {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    this.stand(s, Date.now(), false);
    this.voice.leave(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  // ---- helpers -----------------------------------------------------------

  private withSession(client: Client, fn: (s: PlayerSession) => void): void {
    const s = this.sessions.get(client.sessionId);
    if (s) fn(s);
  }

  private mapOf(s: PlayerSession): ServerMap {
    return this.world.maps.get(s.player.map)!;
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
    s.restSince = Date.now();
  }

  // ---- movement, doors, seats ---------------------------------------------

  private onMove(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      const move = parseMove(raw);
      if (!move) return;
      const now = Date.now();
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

      const now = Date.now();
      s.standPos = { x: s.x, y: s.y, dir: s.player.dir as 'down' };
      const feet = seatFeetPosition(seat);
      s.place(feet.x, feet.y, seat.facing);
      s.seatKey = key;
      s.moving = false;
      s.restSince = now;
      this.seats.set(key, s.id);
      s.player.seatId = seat.id;
      s.player.anim = 'sit';
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
      const now = Date.now();
      s.timer = startTimer(config, now);
      writeTimer(s.player, s.timer);
      s.player.anim = deriveAnim(s, now);
      const event: TimerEventMessage = { event: 'focusStart' };
      s.client.send(S2C.timerEvent, event);
    });
  }

  /** Ends the running timer now, crediting the whole minutes of focus done. */
  private endTimer(s: PlayerSession, now: number): void {
    if (s.timer.phase === 'idle') return;
    this.advance(s, now);
    const { state, record } = stopTimer(s.timer, now);
    s.timer = state;
    writeTimer(s.player, s.timer);
    s.restSince = now;
    if (record) {
      countRecords(s, [record], now);
      s.client.send(S2C.session, { record });
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
    const now = Date.now();
    for (const s of this.sessions.values()) {
      rollDay(s, now);
      this.advance(s, now);
      const anim = deriveAnim(s, now);
      if (s.player.anim !== anim) s.player.anim = anim;
    }
  }

  // ---- social ---------------------------------------------------------------------

  private onChat(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      this.touch(s);
      const text = isPlainObject(raw) ? raw.text : undefined;
      const reason = sendChat(s, text, this.sessions, this.world, Date.now());
      if (reason) {
        const denied: ChatDeniedMessage = { reason };
        client.send(S2C.chatDenied, denied);
      }
    });
  }

  private onEmote(client: Client, raw: unknown): void {
    this.withSession(client, (s) => {
      const now = Date.now();
      if (!isPlainObject(raw) || !EMOTES.includes(raw.name as EmoteName)) return;
      const name = raw.name as EmoteName;
      if (now - s.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
      if (name === 'drink') {
        // Drinks are ordered standing in the cafe, never while seated.
        const zone = zoneAt(this.world.maps.get(s.player.map)?.objects.zones ?? [], s.x, s.y);
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
        at: Date.now(),
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
    });
  }
}
