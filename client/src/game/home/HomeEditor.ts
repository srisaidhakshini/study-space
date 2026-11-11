import Phaser from 'phaser';
import {
  footprint,
  furnitureImageKey,
  getFurniture,
  homeMapSize,
  itemCells,
  maxRotation,
  placeError,
  TILE,
  WALL_ROWS,
  type FurnitureItem,
  type HomeInfoMessage,
  type PlacedItem,
} from '@study/shared';
import { app } from '../../app';
import { DEPTH } from '../depths';
import { createItemPicture } from './HomeView';

const GOOD = 0x7bd88f;
const BAD = 0xe05a5a;
const SELECT = 0xf0c552;
const GHOST_ALPHA = 0.55;
const FLASH_MS = 220;

/** A furniture picture is either an image (tintable) or a placeholder box. */
type Picture = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

interface Candidate {
  placed: PlacedItem;
  item: FurnitureItem;
  /** Index of the item being moved, or -1 for a new one. */
  ignore: number;
  valid: boolean;
}

/**
 * Owner-only edit mode for a home: a faint grid, a ghost of the item under
 * the pointer (green where it fits, red where it does not), and click or tap
 * to place, select, move and remove. All rules come from the shared layout
 * code, so what looks valid here is what the server accepts. Rotating,
 * choosing the item to place and buying live in the interface panels and
 * reach this class through `app.homes.tool`.
 */
export class HomeEditor {
  private on = false;
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly hoverBox: Phaser.GameObjects.Rectangle;
  private readonly outline: Phaser.GameObjects.Rectangle;
  private readonly selection: Phaser.GameObjects.Rectangle;
  private ghost: Picture | null = null;
  private ghostKey = '';
  private hover: { x: number; y: number } | null = null;
  private gridMode: 'floor' | 'wall' | '' = '';
  private flashUntil = 0;
  private readonly keyHandler = (event: KeyboardEvent): void => this.onKey(event);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly isTyping: () => boolean,
  ) {
    this.grid = scene.add.graphics().setDepth(DEPTH.editor).setVisible(false);
    this.hoverBox = scene.add.rectangle(0, 0, TILE, TILE, 0xffffff, 0.2).setOrigin(0, 0).setDepth(DEPTH.editor + 1).setVisible(false);
    this.outline = scene.add.rectangle(0, 0, TILE, TILE).setOrigin(0, 0).setStrokeStyle(1, GOOD).setDepth(DEPTH.editor + 2).setVisible(false);
    this.selection = scene.add.rectangle(0, 0, TILE, TILE).setOrigin(0, 0).setStrokeStyle(2, SELECT).setDepth(DEPTH.editor + 3).setVisible(false);
    scene.input.keyboard?.on('keydown', this.keyHandler);
  }

  /** True while the grid is up and the pointer belongs to the editor instead of walking. */
  get active(): boolean {
    return this.on;
  }

  /** Call whenever `app.homes` changes: turns edit mode on or off and refreshes what is shown. */
  sync(): void {
    const homes = app.homes;
    const want = homes.editing && homes.info?.mine === true;
    if (want !== this.on) {
      this.on = want;
      this.grid.setVisible(want);
      if (!want) this.hide();
    }
    if (!this.on) return;
    this.drawGrid();
    this.refreshSelection();
    this.refreshGhost();
  }

  /** Moves the hover cell to where the pointer is. Returns nothing; used by the scene's pointermove. */
  pointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.on) return;
    this.hover = this.cellAt(pointer);
    this.refreshGhost();
  }

  /** A click or tap in edit mode. Returns true when the editor handled it (so the player does not walk). */
  pointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (!this.on) return false;
    const info = app.homes.info;
    if (!info) return true;
    this.hover = this.cellAt(pointer);
    const cell = this.hover;
    const tool = app.homes.tool;

    if (tool?.kind === 'place') {
      const candidate = this.candidate();
      if (!candidate?.valid) return this.flash();
      app.homes.edit({ op: 'place', itemId: tool.itemId, x: candidate.placed.x, y: candidate.placed.y, rotation: candidate.placed.rotation });
      const owned = app.homes.inventory?.owned[tool.itemId] ?? 0;
      const placedCount = info.items.filter((i) => i.itemId === tool.itemId).length;
      if (owned - placedCount - 1 <= 0) app.homes.setTool(null);
      return true;
    }

    if (tool?.kind === 'select') {
      const candidate = this.candidate();
      const current = info.items[tool.index];
      if (candidate?.valid && current && (candidate.placed.x !== current.x || candidate.placed.y !== current.y)) {
        app.homes.edit({ op: 'move', index: tool.index, x: candidate.placed.x, y: candidate.placed.y, rotation: candidate.placed.rotation });
        return true;
      }
      const other = cell ? this.itemAt(info, cell.x, cell.y) : -1;
      if (other >= 0 && other !== tool.index) {
        app.homes.setTool({ kind: 'select', index: other });
        return true;
      }
      return other === tool.index ? true : this.flash();
    }

    const hit = cell ? this.itemAt(info, cell.x, cell.y) : -1;
    if (hit >= 0) app.homes.setTool({ kind: 'select', index: hit });
    return true;
  }

  /** Pulses the selection outline and shows the red flash after a refused placement. */
  update(): void {
    if (!this.on) return;
    if (this.selection.visible) this.selection.setAlpha(0.65 + 0.35 * Math.sin(this.scene.time.now / 140));
    if (this.ghost && this.flashUntil > 0 && this.scene.time.now > this.flashUntil) {
      this.flashUntil = 0;
      this.refreshGhost();
    }
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.ghost?.destroy();
    this.ghost = null;
    this.grid.destroy();
    this.hoverBox.destroy();
    this.outline.destroy();
    this.selection.destroy();
  }

  // ---- Keyboard --------------------------------------------------------------------

  private onKey(event: KeyboardEvent): void {
    if (!this.on || this.isTyping() || event.repeat) return;
    const info = app.homes.info;
    const tool = app.homes.tool;
    if (!info) return;
    if (event.code === 'Escape') {
      app.homes.setTool(null);
    } else if (event.code === 'KeyR') {
      this.rotate(info);
    } else if ((event.code === 'Delete' || event.code === 'Backspace') && tool?.kind === 'select') {
      if (info.items[tool.index]) app.homes.edit({ op: 'remove', index: tool.index });
      app.homes.setTool(null);
    }
  }

  private rotate(info: HomeInfoMessage): void {
    const tool = app.homes.tool;
    if (tool?.kind === 'place') {
      const item = getFurniture(tool.itemId);
      if (!item) return;
      const max = maxRotation(item);
      app.homes.setTool({ kind: 'place', itemId: tool.itemId, rotation: tool.rotation >= max ? 0 : tool.rotation + 1 });
      return;
    }
    if (tool?.kind !== 'select') return;
    const current = info.items[tool.index];
    const item = current ? getFurniture(current.itemId) : undefined;
    if (!current || !item || maxRotation(item) === 0) return;
    const rotation = current.rotation >= maxRotation(item) ? 0 : current.rotation + 1;
    // Keep the item's centre roughly where it was, then fall back to the same corner.
    const before = footprint(item, current.rotation);
    const after = footprint(item, rotation);
    const tries: PlacedItem[] = [
      { ...current, rotation, x: current.x + Math.floor((before.w - after.w) / 2), y: current.y + Math.floor((before.h - after.h) / 2) },
      { ...current, rotation },
    ];
    const fit = tries.find((p) => placeError(info, p, tool.index) === null);
    if (fit) app.homes.edit({ op: 'move', index: tool.index, x: fit.x, y: fit.y, rotation: fit.rotation });
    else this.flash();
  }

  // ---- Candidate under the pointer ----------------------------------------------------

  /** The room cell under the pointer (room coordinates), or null if it is not on the room. */
  private cellAt(pointer: Phaser.Input.Pointer): { x: number; y: number } | null {
    const info = app.homes.info;
    if (!info) return null;
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(world.x / TILE) - 1;
    const y = Math.floor(world.y / TILE);
    const { tilesW, tilesH } = homeMapSize(info.tier);
    return x >= 0 && x < tilesW - 2 && y >= 0 && y < tilesH - 1 ? { x, y } : null;
  }

  /** What the current tool would do at the hover cell, with the verdict of the shared rules. */
  private candidate(): Candidate | null {
    const info = app.homes.info;
    const tool = app.homes.tool;
    const hover = this.hover;
    if (!info || !tool || !hover) return null;
    let item: FurnitureItem | undefined;
    let rotation = 0;
    let ignore = -1;
    if (tool.kind === 'place') {
      item = getFurniture(tool.itemId);
      rotation = tool.rotation;
    } else {
      const current = info.items[tool.index];
      item = current ? getFurniture(current.itemId) : undefined;
      rotation = current?.rotation ?? 0;
      ignore = tool.index;
    }
    if (!item) return null;
    const { w, h } = footprint(item, rotation);
    const placed: PlacedItem = {
      itemId: item.id,
      rotation,
      x: hover.x - Math.floor((w - 1) / 2),
      y: hover.y - Math.floor((h - 1) / 2),
    };
    let valid = placeError(info, placed, ignore) === null;
    if (valid && tool.kind === 'place') {
      const owned = app.homes.inventory?.owned[item.id] ?? 0;
      valid = owned - info.items.filter((i) => i.itemId === item!.id).length > 0;
    }
    return { placed, item, ignore, valid };
  }

  /** The topmost placed item at a room cell: floor items, then the tall part of floor items, then wall items, then rugs. */
  private itemAt(info: HomeInfoMessage, x: number, y: number): number {
    let floorHit = -1;
    let liftHit = -1;
    let wallHit = -1;
    let rugHit = -1;
    info.items.forEach((placed, index) => {
      const item = getFurniture(placed.itemId);
      if (!item) return;
      const { w, h } = footprint(item, placed.rotation);
      const inColumns = x >= placed.x && x < placed.x + w;
      const exact = inColumns && y >= placed.y && y < placed.y + h;
      if (item.placement === 'floor') {
        if (exact && (floorHit < 0 || placed.y > (info.items[floorHit]?.y ?? -1))) floorHit = index;
        else if (inColumns && y < placed.y && y >= placed.y - item.lift && liftHit < 0) liftHit = index;
      } else if (item.placement === 'wall') {
        if (exact) wallHit = index;
      } else if (exact) {
        rugHit = index;
      }
    });
    if (floorHit >= 0) return floorHit;
    if (liftHit >= 0) return liftHit;
    if (wallHit >= 0) return wallHit;
    return rugHit;
  }

  // ---- What is drawn ---------------------------------------------------------------------

  /** The tool's item, whether it hangs on the wall (grid shows the wall rows) or stands on the floor. */
  private toolItem(): FurnitureItem | undefined {
    const tool = app.homes.tool;
    const info = app.homes.info;
    if (tool?.kind === 'place') return getFurniture(tool.itemId);
    if (tool?.kind === 'select') {
      const current = info?.items[tool.index];
      return current ? getFurniture(current.itemId) : undefined;
    }
    return undefined;
  }

  private drawGrid(): void {
    const info = app.homes.info;
    if (!info) return;
    const mode = this.toolItem()?.placement === 'wall' ? 'wall' : 'floor';
    if (mode === this.gridMode) return;
    this.gridMode = mode;
    const { tilesW, tilesH } = homeMapSize(info.tier);
    const columns = tilesW - 2;
    const floorRows = tilesH - 1 - WALL_ROWS;
    const top = mode === 'wall' ? 0 : WALL_ROWS * TILE;
    const rows = mode === 'wall' ? WALL_ROWS : floorRows;
    this.grid.clear();
    this.grid.lineStyle(1, 0xffffff, mode === 'wall' ? 0.28 : 0.18);
    for (let c = 0; c <= columns; c++) this.grid.lineBetween((c + 1) * TILE + 0.5, top, (c + 1) * TILE + 0.5, top + rows * TILE);
    for (let r = 0; r <= rows; r++) this.grid.lineBetween(TILE, top + r * TILE + 0.5, (columns + 1) * TILE, top + r * TILE + 0.5);
  }

  private refreshSelection(): void {
    const info = app.homes.info;
    const tool = app.homes.tool;
    const placed = tool?.kind === 'select' ? info?.items[tool.index] : undefined;
    const item = placed ? getFurniture(placed.itemId) : undefined;
    if (!placed || !item) {
      this.selection.setVisible(false);
      return;
    }
    const { w, h } = footprint(item, placed.rotation);
    this.selection.setPosition((placed.x + 1) * TILE, placed.y * TILE).setSize(w * TILE, h * TILE).setVisible(true);
  }

  private refreshGhost(): void {
    if (!this.on) return;
    this.drawGrid();
    const candidate = this.candidate();
    const hover = this.hover;
    if (!candidate) {
      this.ghost?.setVisible(false);
      this.outline.setVisible(false);
      this.hoverBox.setVisible(!!hover && !app.homes.tool).setPosition(((hover?.x ?? 0) + 1) * TILE, (hover?.y ?? 0) * TILE);
      return;
    }
    this.hoverBox.setVisible(false);
    const { item, placed, valid } = candidate;
    const key = `${item.id}:${placed.rotation}`;
    if (key !== this.ghostKey || !this.ghost) {
      this.ghost?.destroy();
      this.ghostKey = key;
      this.ghost = createItemPicture(this.scene, item, placed.rotation, 0, 0).setDepth(DEPTH.editor + 1).setAlpha(GHOST_ALPHA);
    }
    const { w, h } = footprint(item, placed.rotation);
    const wall = item.placement === 'wall';
    const topY = wall ? placed.y * TILE : (placed.y - item.lift) * TILE;
    this.ghost.setPosition((placed.x + 1) * TILE, topY).setVisible(true);
    const flashing = this.flashUntil > this.scene.time.now;
    this.tint(this.ghost, valid && !flashing ? GOOD : BAD);
    this.outline
      .setPosition((placed.x + 1) * TILE, placed.y * TILE)
      .setSize(w * TILE, h * TILE)
      .setStrokeStyle(1, valid && !flashing ? GOOD : BAD)
      .setVisible(true);
  }

  private tint(picture: Picture, color: number): void {
    if (picture instanceof Phaser.GameObjects.Image) picture.setTint(color);
    else picture.setFillStyle(color, GHOST_ALPHA);
  }

  /** A refused placement: the ghost turns red for a moment. Returns true (the click was handled). */
  private flash(): boolean {
    this.flashUntil = this.scene.time.now + FLASH_MS;
    this.refreshGhost();
    return true;
  }

  private hide(): void {
    this.ghost?.setVisible(false);
    this.hoverBox.setVisible(false);
    this.outline.setVisible(false);
    this.selection.setVisible(false);
    this.hover = null;
    this.gridMode = '';
  }
}

/** Cells covered by a placed item, for callers that need them (tests, hit checks). */
export function cellsOf(placed: PlacedItem): { x: number; y: number }[] {
  const item = getFurniture(placed.itemId);
  return item ? itemCells(item, placed.x, placed.y, placed.rotation) : [];
}

/** The manifest image key of a placed item's picture (re-exported for the scene's debug tools). */
export function pictureKey(placed: PlacedItem): string {
  return furnitureImageKey(placed.itemId, placed.rotation);
}
