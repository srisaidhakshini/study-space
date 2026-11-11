import Phaser from 'phaser';
import { houseNumber, type DoorDef } from '@study/shared';
import { app } from '../../app';
import { DEPTH } from '../depths';
import type { OverlayScene, WorldLabel } from '../scenes/OverlayScene';

const INK = 0x2a1b2e;
const GOLD = 0xf0c552;
const LEAF = 0x86a856;
const MAX_NAME = 12;

/** 7x8 pixel glyphs: x draws, anything else is empty. */
const LOCK = ['..xxx..', '.x...x.', '.x...x.', 'xxxxxxx', 'xxxxxxx', 'xxx.xxx', 'xxxxxxx', 'xxxxxxx'];
const OPEN_DOOR = ['xxxxxxx', 'x.....x', 'x.ggg.x', 'x.ggg.x', 'x.ggg.x', 'x.ggg.x', 'x.ggg.x', 'xxxxxxx'];

const HOUSE_DOOR = /^house-(\d+)$/;
/** Pixels from the door trigger up to where its sign sits: above the door's top edge. */
const ABOVE_DOOR = 22;

interface Sign {
  door: DoorDef;
  slot: number;
  label: WorldLabel;
  glyph: Phaser.GameObjects.Graphics;
}

function shorten(name: string): string {
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
}

/** Draws a glyph with a dark outline, its top-left at (x, y). */
function drawGlyph(g: Phaser.GameObjects.Graphics, rows: string[], x: number, y: number, fill: number): void {
  g.fillStyle(INK, 1);
  rows.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      if (ch === '.') return;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) g.fillRect(x + rx + dx, y + ry + dy, 1, 1);
    });
  });
  rows.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      if (ch === '.') return;
      g.fillStyle(ch === 'g' ? LEAF : fill, 1);
      g.fillRect(x + rx, y + ry, 1, 1);
    });
  });
}

/**
 * Signs on the residential street: above each house door its number and the
 * owner (or "For sale"), a padlock when you may not enter and an open door
 * when you may, and labels at both ends of the street. Text is drawn in the
 * overlay so it stays crisp; the glyphs are tiny pixel art in the world.
 */
export class StreetView {
  private readonly signs: Sign[] = [];
  private readonly ends: { door: DoorDef; label: WorldLabel; side: 'west' | 'east' }[] = [];
  private readonly unsubscribe: () => void;

  /** `page` is the street page number; offline the street is page 1 with no residents. */
  constructor(
    scene: Phaser.Scene,
    private readonly overlay: OverlayScene,
    doors: readonly DoorDef[],
    private readonly page: number,
  ) {
    for (const door of doors) {
      const house = HOUSE_DOOR.exec(door.id);
      const cx = door.rect.x + door.rect.width / 2;
      if (house) {
        const label: WorldLabel = { x: cx, y: door.rect.y - ABOVE_DOOR, text: '', visible: true };
        const glyph = scene.add.graphics().setDepth(DEPTH.above - 10);
        this.signs.push({ door, slot: Number(house[1]), label, glyph });
        overlay.addLabel(label);
      } else if (door.id === 'west' || door.id === 'east') {
        const label: WorldLabel = { x: cx, y: door.rect.y - ABOVE_DOOR, text: '', visible: false };
        this.ends.push({ door, label, side: door.id });
        overlay.addLabel(label);
      }
    }
    this.refresh();
    this.unsubscribe = app.homes.changed.subscribe(() => this.refresh());
  }

  /** Rewrites every sign from the latest street information. */
  refresh(): void {
    const street = app.homes.street?.page === this.page ? app.homes.street : null;
    for (const sign of this.signs) {
      const house = street?.houses.find((h) => h.slot === sign.slot) ?? null;
      const number = houseNumber(this.page, sign.slot);
      const owned = house?.ownerId != null;
      sign.label.text = `#${number}\n${owned ? shorten(house?.ownerName ?? '?') : 'For sale'}`;
      sign.label.color = owned ? '#fbf5ea' : '#a89aa4';
      sign.glyph.clear();
      if (owned) {
        const x = Math.round(sign.door.rect.x + sign.door.rect.width / 2 - 3);
        const y = Math.round(sign.door.rect.y - ABOVE_DOOR - 12);
        if (house?.canEnter) drawGlyph(sign.glyph, OPEN_DOOR, x, y, GOLD);
        else drawGlyph(sign.glyph, LOCK, x, y, GOLD);
        sign.label.y = sign.door.rect.y - ABOVE_DOOR - 14;
      } else {
        sign.label.y = sign.door.rect.y - ABOVE_DOOR - 2;
      }
    }
    const lastPage = street?.lastPage ?? this.page;
    for (const end of this.ends) {
      if (end.side === 'west') {
        end.label.text = this.page > 1 ? `← Street ${this.page - 1}` : '← Back to town';
        end.label.visible = true;
      } else {
        end.label.text = `Street ${this.page + 1} →`;
        end.label.visible = this.page < lastPage;
      }
    }
  }

  destroy(): void {
    this.unsubscribe();
    for (const sign of this.signs) {
      this.overlay.removeLabel(sign.label);
      sign.glyph.destroy();
    }
    for (const end of this.ends) this.overlay.removeLabel(end.label);
    this.signs.length = 0;
    this.ends.length = 0;
  }
}
