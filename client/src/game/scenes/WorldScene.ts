import Phaser from 'phaser';
import {
  FX_KEYS,
  rectContains,
  TILE,
  zoneAt,
  type DoorDef,
  type Direction,
  type Profile,
  type SeatDef,
  type TeleportMessage,
  type ZoneDef,
} from '@study/shared';
import { app } from '../../app';
import { bus } from '../../bus';
import { StudyWorld } from '../../studyTogether/StudyWorld';
import { Character } from '../character/Character';
import { Pet } from '../character/Pet';
import { DEPTH, SCENES } from '../depths';
import { PlayerController } from '../player/PlayerController';
import { RemotePlayers } from '../remote/RemotePlayers';
import { Sky } from '../sky/Sky';
import { Lamps } from '../world/Lamps';
import { fitCamera, loadMap, type LoadedMap } from '../world/mapLoader';
import { Seats } from '../world/Seats';
import type { OverlayScene } from './OverlayScene';

export interface WorldInit {
  map: string;
  /** Spawn point id in the map; ignored when `at` is given. */
  spawn: string;
  /** Exact feet position, used when the server decides where the player appears. */
  at?: { x: number; y: number; facing: Direction };
}

type MoveKey = 'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
const MOVE_KEYS = 'W,A,S,D,UP,DOWN,LEFT,RIGHT';
const FADE_MS = 250;
/** Online, the player's position is sent to the server this often while walking. */
const MOVE_SEND_MS = 100;
/** Online, how long to wait for the server to open a door before trying again. */
const DOOR_REPLY_MS = 1500;

function isTyping(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/** One map of the world: the hub, the library, and later every other area. */
export class WorldScene extends Phaser.Scene {
  private target: WorldInit = { map: '', spawn: '' };
  private map!: LoadedMap;
  private seats!: Seats;
  private studyWorld!: StudyWorld;
  private lamps!: Lamps;
  /** Day, night, weather and street lamps; outdoor maps only. */
  private sky: Sky | null = null;
  private player!: Character;
  private controller!: PlayerController;
  private pet: Pet | null = null;
  private petId = '';
  private marker!: Phaser.GameObjects.Image;
  private keys!: Record<MoveKey, Phaser.Input.Keyboard.Key>;
  private overlay!: OverlayScene;
  private locked = false;
  private travelling = false;
  private zone: ZoneDef | null = null;
  private seatWasNear = false;
  private remotes!: RemotePlayers;
  private moveSeq = 0;
  private sinceMoveSent = 0;
  private sentMoving = false;
  private doorBlockedUntil = 0;
  private cleanup: (() => void)[] = [];

  constructor() {
    super(SCENES.world);
  }

  init(data: WorldInit): void {
    this.target = { map: data.map, spawn: data.spawn, at: data.at };
  }

  create(): void {
    const profile = app.profile.get();
    if (!profile) throw new Error('The world was started before a profile exists');

    this.travelling = false;
    this.seatWasNear = false;
    this.map = loadMap(this, this.target.map);
    this.seats = new Seats(this.map.objects.seats);
    this.lamps = new Lamps(this, this.map.objects.lamps);

    const spawn =
      this.target.at ??
      this.map.objects.spawns.find((s) => s.id === this.target.spawn) ??
      this.map.objects.spawns[0] ?? { x: this.map.widthPx / 2, y: this.map.heightPx / 2, facing: 'down' as const };
    this.player = new Character(this, profile.appearance, profile.name);
    this.player.setPosition(spawn.x, spawn.y);
    this.player.setFacing(spawn.facing);
    this.controller = new PlayerController(this.player, this.map.grid, this.seats);
    this.setPet(profile.pet);

    this.marker = this.add.image(0, 0, FX_KEYS.marker).setOrigin(0.5, 1).setDepth(DEPTH.marker).setVisible(false);

    if (!this.scene.isActive(SCENES.overlay)) this.scene.launch(SCENES.overlay);
    this.overlay = this.scene.get(SCENES.overlay) as OverlayScene;
    this.overlay.track(this.player);
    this.studyWorld = new StudyWorld(this, this.map, this.seats);
    this.remotes = new RemotePlayers(this, this.overlay, this.seats, this.map.id);
    if (!this.map.entry.indoor) {
      this.sky = new Sky(this, this.map.widthPx, this.map.heightPx, this.map.objects.lights, () => this.overlay);
    }

    this.setupCamera();
    this.setupInput();
    this.cleanup = [
      bus.on('ui:sit', () => this.whenFree(() => this.controller.sitNearest())),
      bus.on('ui:stand', () => this.controller.stand()),
      bus.on('ui:emote', ({ name }) => {
        if (name === 'wave') this.controller.wave();
        else if (name === 'drink') this.controller.drink();
      }),
      bus.on('ui:lock', ({ locked }) => {
        this.locked = locked;
      }),
      app.profile.changed.subscribe((next) => this.applyProfile(next)),
      app.net.teleports.subscribe((message) => this.teleported(message)),
      app.net.corrections.subscribe((message) => this.controller.applyCorrection(message.x, message.y)),
      app.net.sitResults.subscribe((result) => this.controller.applySitResult(result)),
      bus.on('chat:line', (line) => {
        const source = line.self ? this.player : this.remotes.sourceFor(line.fromId);
        if (source) this.overlay.say(source, line.text);
      }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());

    this.zone = zoneAt(this.map.objects.zones, this.player.x, this.player.y);
    this.emitLocation();
    bus.emit('seat:near', { available: false });
    this.sentMoving = false;
    this.sinceMoveSent = MOVE_SEND_MS;
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    const active = !this.locked && !this.travelling && !isTyping();
    let axisX = 0;
    let axisY = 0;
    if (active) {
      const k = this.keys;
      axisX = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      axisY = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    }

    if (!this.travelling) this.controller.update(dt, axisX, axisY);
    this.player.update(dt);
    this.pet?.update(dt, this.player.x, this.player.y);
    this.remotes.update(dt);
    if (!this.travelling) this.studyWorld.update(dt);
    this.sky?.update(dt);
    this.sendMove(dt);

    const focusSeat = app.timer.state.phase === 'focus' ? app.timer.seatId : null;
    this.lamps.update((seatId) => seatId === focusSeat || this.remotes.isFocusingAt(seatId));
    this.updateMarker();
    if (!this.travelling && !this.controller.seated) {
      this.checkZone();
      this.checkDoors();
    }
  }

  /** Online: tells the server where we walked. The server validates and may correct us. */
  private sendMove(dt: number): void {
    if (!app.net.online || this.travelling || this.controller.seated) return;
    this.sinceMoveSent += dt;
    const moving = this.player.currentAction === 'walk';
    if (moving ? this.sinceMoveSent < MOVE_SEND_MS : !this.sentMoving) return;
    this.sinceMoveSent = 0;
    this.sentMoving = moving;
    app.net.sendMove({
      seq: ++this.moveSeq,
      x: this.player.x,
      y: this.player.y,
      dir: this.player.facing,
      moving,
    });
  }

  /** The server moved us: through a door, off a seat, or back to a valid spot. */
  private teleported(message: TeleportMessage): void {
    if (message.reason === 'stand' || message.map === this.map.id) {
      this.controller.applyStand(message.x, message.y);
      this.player.setFacing(message.dir);
      return;
    }
    this.go({ map: message.map, spawn: '', at: { x: message.x, y: message.y, facing: message.dir } });
  }

  private setupCamera(): void {
    const camera = this.cameras.main;
    const fit = (): void => fitCamera(camera, this.scale.width, this.scale.height, this.map);
    fit();
    camera.setRoundPixels(true);
    camera.startFollow(this.player, true, 0.2, 0.2);
    camera.centerOn(this.player.x, this.player.y);
    camera.fadeIn(FADE_MS, 42, 27, 46);
    this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.cleanup.push(() => this.scale.off(Phaser.Scale.Events.RESIZE, fit));
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    // No key capture: the same keys must still type into HTML inputs.
    this.keys = keyboard.addKeys(MOVE_KEYS, false) as Record<MoveKey, Phaser.Input.Keyboard.Key>;
    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (isTyping()) return;
      this.controller.noteInput();
      if (event.repeat) return;
      if (event.code === 'KeyE' || event.code === 'Space') this.whenFree(() => this.controller.interact());
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.controller.noteInput();
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.whenFree(() => this.controller.moveTo(point.x, point.y));
    });
  }

  /** Runs an input action unless a menu is open or the scene is changing. */
  private whenFree(action: () => void): void {
    if (!this.locked && !this.travelling) action();
  }

  private setPet(petId: string): void {
    if (this.pet && petId === this.petId) return;
    this.pet?.destroy();
    this.pet = null;
    this.petId = petId;
    const sheet = app.manifest.pets.find((p) => p.id === petId)?.sheet;
    if (sheet && this.textures.exists(sheet)) this.pet = new Pet(this, sheet, this.player.x, this.player.y);
  }

  private applyProfile(profile: Profile): void {
    this.player.name = profile.name;
    this.player.setAppearance(profile.appearance);
    this.setPet(profile.pet);
  }

  private updateMarker(): void {
    const seat: SeatDef | null = this.travelling ? null : this.controller.seatInReach();
    if (seat) {
      const bob = Math.round(Math.sin(this.time.now / 180) * 1.5);
      this.marker.setPosition(seat.tx * TILE + TILE / 2, seat.ty * TILE - 3 + bob).setVisible(true);
    } else {
      this.marker.setVisible(false);
    }
    const near = seat !== null;
    if (near !== this.seatWasNear) {
      this.seatWasNear = near;
      bus.emit('seat:near', { available: near });
    }
  }

  private emitLocation(): void {
    bus.emit('location', { mapId: this.map.id, mapName: this.map.entry.name, zone: this.zone });
  }

  private checkZone(): void {
    const zone = zoneAt(this.map.objects.zones, this.player.x, this.player.y);
    if (zone?.id === this.zone?.id) return;
    this.zone = zone;
    this.emitLocation();
  }

  private checkDoors(): void {
    const { x, y } = this.player;
    const door = this.map.objects.doors.find((d) => rectContains(d.rect, x, y));
    if (door) this.travel(door);
  }

  private travel(door: DoorDef): void {
    if (!app.manifest.maps[door.targetMap]) {
      console.warn(`Door "${door.id}" leads to unknown map "${door.targetMap}"`);
      return;
    }
    if (app.net.online) {
      // The server decides: it answers with a teleport that carries us through.
      const now = this.time.now;
      if (now < this.doorBlockedUntil) return;
      this.doorBlockedUntil = now + DOOR_REPLY_MS;
      app.net.sendDoor(door.id);
      return;
    }
    this.go({ map: door.targetMap, spawn: door.targetSpawn });
  }

  /** Fades out and loads another map (or the same one at a new position). */
  private go(next: WorldInit): void {
    this.travelling = true;
    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart(next));
    camera.fadeOut(FADE_MS, 42, 27, 46);
  }

  private shutdown(): void {
    for (const off of this.cleanup) off();
    this.cleanup = [];
    this.controller.dispose();
    this.remotes.destroy();
    this.sky?.destroy();
    this.sky = null;
    this.studyWorld.destroy();
    this.overlay.clear();
    this.pet = null;
    this.petId = '';
    this.locked = false;
  }
}
