import Phaser from 'phaser';
import {
  darkness,
  footprint,
  FX_KEYS,
  furnitureImageKey,
  gameHour,
  getFurniture,
  getSurface,
  homeCollision,
  homeMapSize,
  homeSeats,
  multiplyHex,
  skyTint,
  surfaceImageKey,
  TILE,
  WALL_ROWS,
  type CollisionGrid,
  type FurnitureItem,
  type HomeInfoMessage,
  type PlacedItem,
} from '@study/shared';
import { DEPTH } from '../depths';
import type { Seats } from '../world/Seats';

/** Manifest image drawn along the foot of the back wall. */
const BASEBOARD_KEY = 'home_baseboard';
const GLOW_TINT = 0xffd98a;
/** The sky behind a window by day; multiplied by the sky tint of the hour. */
const SKY_DAY = '#9fd0ea';
const SKY_REFRESH_MS = 1000;
const FLICKER = 0.05;

const PLACEHOLDER_COLORS = [0xc8975f, 0x8db36a, 0x7a9cc6, 0xc47a7a, 0xb49ad0, 0xd9b45a];

/** A stable pastel for an item that has no picture yet. */
function placeholderColor(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length]!;
}

/** True if the manifest art for this key was loaded. */
function hasTexture(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key);
}

/** The picture of an item as one game object, top-left at (x, y); a coloured box if its art is missing. */
export function createItemPicture(
  scene: Phaser.Scene,
  item: FurnitureItem,
  rotation: number,
  x: number,
  y: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
  const key = furnitureImageKey(item.id, rotation);
  if (hasTexture(scene, key)) return scene.add.image(x, y, key).setOrigin(0, 0);
  const { w, h } = footprint(item, rotation);
  return scene.add
    .rectangle(x, y, w * TILE, (h + item.lift) * TILE, placeholderColor(item.id))
    .setOrigin(0, 0)
    .setStrokeStyle(1, 0x2a1b2e);
}

/**
 * Draws the inside of a home from the layout the server sent: wallpaper,
 * floor, every piece of furniture with correct depth sorting, window skies
 * and lamp glows. Also keeps the walking grid and the seat list in step with
 * the furniture. The whole view is rebuilt on each change (at most 120 items).
 */
export class HomeView {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private glows: { image: Phaser.GameObjects.Image; phase: number }[] = [];
  private skies: Phaser.GameObjects.Rectangle[] = [];
  private skyClock = SKY_REFRESH_MS;
  private clock = 0;
  private lastInfo: HomeInfoMessage | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly grid: CollisionGrid,
    private readonly seats: Seats,
  ) {}

  /** The layout currently drawn. */
  get info(): HomeInfoMessage | null {
    return this.lastInfo;
  }

  /** Redraws everything for this layout and updates collision and seats. */
  apply(info: HomeInfoMessage): void {
    this.clear();
    this.lastInfo = info;
    this.drawSurfaces(info);
    for (const placed of info.items) this.drawItem(placed);
    this.syncWorld(info);
    this.skyClock = SKY_REFRESH_MS;
  }

  /** Lamp flicker and the window sky; cheap enough to run every frame. */
  update(deltaMs: number): void {
    this.clock += deltaMs;
    const night = darkness(gameHour(Date.now()));
    const level = 0.32 + 0.6 * night;
    const seconds = this.clock / 1000;
    for (const glow of this.glows) {
      const flicker = 1 + FLICKER * Math.sin(seconds * 2.1 + glow.phase) * Math.sin(seconds * 0.8 + glow.phase * 0.5);
      glow.image.setAlpha(Math.min(1, level * flicker));
    }
    this.skyClock += deltaMs;
    if (this.skyClock >= SKY_REFRESH_MS && this.skies.length > 0) {
      this.skyClock = 0;
      const color = Phaser.Display.Color.HexStringToColor(multiplyHex(SKY_DAY, skyTint(gameHour(Date.now())))).color;
      for (const sky of this.skies) sky.setFillStyle(color);
    }
  }

  destroy(): void {
    this.clear();
    this.lastInfo = null;
  }

  private clear(): void {
    for (const object of this.objects) object.destroy();
    this.objects = [];
    this.glows = [];
    this.skies = [];
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private drawSurfaces(info: HomeInfoMessage): void {
    const tier = homeSizeOf(info);
    const widthPx = tier.floorW * TILE;
    this.surface(surfaceImageKey(info.wallpaper), info.wallpaper, TILE, 0, widthPx, WALL_ROWS * TILE, DEPTH.wallSurface);
    this.surface(surfaceImageKey(info.floor), info.floor, TILE, WALL_ROWS * TILE, widthPx, tier.floorH * TILE, DEPTH.floorSurface);
    if (hasTexture(this.scene, BASEBOARD_KEY)) {
      const height = this.scene.textures.get(BASEBOARD_KEY).getSourceImage().height;
      this.track(
        this.scene.add.tileSprite(TILE, WALL_ROWS * TILE - height, widthPx, height, BASEBOARD_KEY).setOrigin(0, 0).setDepth(DEPTH.baseboard),
      );
    }
  }

  /** A tiled picture over a rectangle; a flat colour from the catalog when the art is missing. */
  private surface(key: string, id: string, x: number, y: number, w: number, h: number, depth: number): void {
    if (hasTexture(this.scene, key)) {
      this.track(this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0, 0).setDepth(depth));
      return;
    }
    const color = Phaser.Display.Color.HexStringToColor(getSurface(id)?.color ?? '#c8975f').color;
    this.track(this.scene.add.rectangle(x, y, w, h, color).setOrigin(0, 0).setDepth(depth));
  }

  private drawItem(placed: PlacedItem): void {
    const item = getFurniture(placed.itemId);
    if (!item) return;
    const { w, h } = footprint(item, placed.rotation);
    const left = (placed.x + 1) * TILE;

    if (item.placement === 'wall') {
      const top = placed.y * TILE;
      if (item.category === 'window') {
        const sky = this.track(this.scene.add.rectangle(left + 2, top + 2, w * TILE - 4, h * TILE - 4, 0x9fd0ea).setOrigin(0, 0).setDepth(DEPTH.wallItem - 0.5));
        this.skies.push(sky);
      }
      this.track(createItemPicture(this.scene, item, placed.rotation, left, top).setDepth(DEPTH.wallItem));
    } else if (item.placement === 'rug') {
      this.track(createItemPicture(this.scene, item, placed.rotation, left, placed.y * TILE).setDepth(DEPTH.rug));
    } else {
      this.drawFloorItem(item, placed, left, w, h);
    }

    if (item.glow) this.addGlow(item, placed, left, w, h);
  }

  /**
   * Floor furniture is cut into one strip per footprint row, each sorted by
   * its own row, the way tile furniture is. That puts a seated character in
   * front of the desk top but behind the chair back.
   */
  private drawFloorItem(item: FurnitureItem, placed: PlacedItem, left: number, w: number, h: number): void {
    const top = (placed.y - item.lift) * TILE;
    const key = furnitureImageKey(item.id, placed.rotation);
    if (h === 1 || !hasTexture(this.scene, key)) {
      this.track(createItemPicture(this.scene, item, placed.rotation, left, top).setDepth((placed.y + h) * TILE));
      return;
    }
    for (let row = 0; row < h; row++) {
      const cropY = row === 0 ? 0 : (item.lift + row) * TILE;
      const cropH = row === 0 ? (item.lift + 1) * TILE : TILE;
      this.track(
        this.scene.add
          .image(left, top, key)
          .setOrigin(0, 0)
          .setCrop(0, cropY, w * TILE, cropH)
          .setDepth((placed.y + row + 1) * TILE),
      );
    }
  }

  private addGlow(item: FurnitureItem, placed: PlacedItem, left: number, w: number, h: number): void {
    const wall = item.placement === 'wall';
    const top = wall ? placed.y * TILE : (placed.y - item.lift) * TILE;
    const height = wall ? h * TILE : (h + item.lift) * TILE;
    const image = this.track(
      this.scene.add
        .image(left + (w * TILE) / 2, top + Math.min(10, height * 0.4), FX_KEYS.glow)
        .setTint(GLOW_TINT)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale((item.glow ?? 48) / 32)
        .setDepth(DEPTH.glow)
        .setAlpha(0.4),
    );
    this.glows.push({ image, phase: placed.x * 1.3 + placed.y * 0.7 });
  }

  /** Walking grid and seats follow the furniture. */
  private syncWorld(info: HomeInfoMessage): void {
    const next = homeCollision(info);
    if (next.blocked.length === this.grid.blocked.length) this.grid.blocked.set(next.blocked);
    this.seats.replace(homeSeats(info));
  }
}

/** Floor size in tiles for the layout's tier, from the shared map size. */
function homeSizeOf(info: HomeInfoMessage): { floorW: number; floorH: number } {
  const { tilesW, tilesH } = homeMapSize(info.tier);
  return { floorW: tilesW - 2, floorH: tilesH - WALL_ROWS - 1 };
}
