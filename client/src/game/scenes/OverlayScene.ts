import Phaser from 'phaser';
import { UI_FONT } from '../../config';
import { SCENES } from '../depths';

/** Anything that wants a nameplate: a world position and the text to show. */
export interface NameplateSource {
  x: number;
  y: number;
  name: string;
  statusText: string | null;
}

/** A piece of text pinned to a world position (a house sign on the street). */
export interface WorldLabel {
  x: number;
  y: number;
  text: string;
  /** CSS colour; defaults to the nameplate cream. */
  color?: string;
  visible: boolean;
}

interface ChatBubble {
  text: Phaser.GameObjects.Text;
  /** Time (scene clock, ms) after which the bubble disappears. */
  until: number;
}

interface Plate {
  /** Created on the first update, once this scene is running. */
  text: Phaser.GameObjects.Text | null;
  shown: string;
  chat: ChatBubble | null;
}

interface PositionedPlate {
  text: Phaser.GameObjects.Text;
  chat: ChatBubble | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** World pixels from the feet up to just above the hair. */
const HEAD_CLEARANCE = 44;
/** How long a chat line stays above its speaker. */
const CHAT_SHOW_MS = 5000;
const CHAT_WRAP_PX = 170;
const PLATE_GAP = 4;

/**
 * Screen-space labels drawn over the world at native resolution, so text
 * stays crisp while the world camera is zoomed in.
 */
export class OverlayScene extends Phaser.Scene {
  private readonly plates = new Map<NameplateSource, Plate>();
  private readonly labels = new Map<WorldLabel, Phaser.GameObjects.Text | null>();
  private leaders!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENES.overlay);
  }

  /** Starts showing a nameplate for the source. Safe to call before this scene runs. */
  track(source: NameplateSource): void {
    if (!this.plates.has(source)) this.plates.set(source, { text: null, shown: '', chat: null });
  }

  untrack(source: NameplateSource): void {
    const plate = this.plates.get(source);
    plate?.text?.destroy();
    plate?.chat?.text.destroy();
    this.plates.delete(source);
  }

  /** Shows a speech line above a tracked source for a few seconds, replacing the last one. */
  say(source: NameplateSource, line: string): void {
    const plate = this.plates.get(source);
    if (!plate) return;
    plate.chat?.text.destroy();
    const text = this.createText().setWordWrapWidth(CHAT_WRAP_PX).setText(line).setColor('#f5e3b5').setFontStyle('400');
    plate.chat = { text, until: this.time.now + CHAT_SHOW_MS };
  }

  /** Shows a label at a world position until it is removed. Safe to call before this scene runs. */
  addLabel(label: WorldLabel): void {
    if (!this.labels.has(label)) this.labels.set(label, null);
  }

  removeLabel(label: WorldLabel): void {
    this.labels.get(label)?.destroy();
    this.labels.delete(label);
  }

  /** Removes every nameplate and label (the world calls this when it shuts down). */
  clear(): void {
    for (const text of this.labels.values()) text?.destroy();
    this.labels.clear();
    for (const plate of this.plates.values()) {
      plate.text?.destroy();
      plate.chat?.text.destroy();
    }
    this.plates.clear();
  }

  create(): void {
    this.leaders = this.add.graphics().setDepth(-1);
    // Lay out just before drawing: by then the world camera, which renders
    // first, has settled on this frame's scroll position.
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, this.layout, this);
  }

  private layout(): void {
    this.leaders.clear();
    if ((this.plates.size === 0 && this.labels.size === 0) || !this.scene.isActive(SCENES.world)) return;
    const camera = this.scene.get(SCENES.world).cameras.main;
    const view = camera.worldView;
    for (const [label, existing] of this.labels) {
      const text = existing ?? this.createText().setFontSize('12px').setLineSpacing(-3);
      this.labels.set(label, text);
      text.setVisible(label.visible);
      if (!label.visible) continue;
      if (text.text !== label.text) text.setText(label.text);
      text.setColor(label.color ?? '#fbf5ea');
      // Keep the whole label on screen even when its anchor is near an edge.
      const half = text.width / 2 + 4;
      const lx = Phaser.Math.Clamp(Math.round((label.x - view.x) * camera.zoom), half, Math.max(half, this.scale.width - half));
      text.setPosition(lx, Math.round((label.y - view.y) * camera.zoom));
    }
    const positions: PositionedPlate[] = [];
    for (const [source, plate] of this.plates) {
      const text = plate.text ?? this.createText();
      plate.text = text;
      const label = source.statusText ? `${source.name}\n${source.statusText}` : source.name;
      if (label !== plate.shown) {
        plate.shown = label;
        text.setText(label);
      }
      const px = Math.round((source.x - view.x) * camera.zoom);
      const py = Math.round((source.y - HEAD_CLEARANCE - view.y) * camera.zoom);
      if (plate.chat && this.time.now >= plate.chat.until) {
        plate.chat.text.destroy();
        plate.chat = null;
      }
      const visible = px >= 0 && px <= this.scale.width && py >= 0 && py <= this.scale.height;
      text.setVisible(visible);
      plate.chat?.text.setVisible(visible);
      if (!visible) continue;

      const chat = plate.chat;
      const width = Math.max(text.width, chat?.text.width ?? 0);
      const height = text.height + (chat ? chat.text.height + PLATE_GAP : 0);
      const half = width / 2 + PLATE_GAP;
      const x = Phaser.Math.Clamp(px, half, Math.max(half, this.scale.width - half));
      positions.push({ text, chat, x, y: py, width, height });
    }

    // Place lower avatars first so their text can stay close to them.
    positions.sort((a, b) => b.y - a.y || a.x - b.x);
    this.leaders.lineStyle(1, 0xfbf5ea, 0.65);
    const placed: PositionedPlate[] = [];
    for (const plate of positions) {
      const anchorY = plate.y;
      // A move can bring the plate into a different one, so recheck the
      // previously placed rectangles until the whole name and chat fit.
      let collision: PositionedPlate | undefined;
      do {
        collision = placed.find((other) =>
          Math.abs(plate.x - other.x) < (plate.width + other.width) / 2 + PLATE_GAP &&
          plate.y > other.y - other.height - PLATE_GAP &&
          plate.y - plate.height < other.y + PLATE_GAP,
        );
        if (collision) plate.y = collision.y - collision.height - PLATE_GAP;
      } while (collision);
      placed.push(plate);

      plate.text.setPosition(plate.x, plate.y);
      if (plate.y < anchorY) this.leaders.lineBetween(plate.x, plate.y, plate.x, anchorY);
      if (plate.chat) {
        plate.chat.text.setPosition(plate.x, plate.y - plate.text.height - PLATE_GAP);
        plate.chat.text.setAlpha(Math.min(1, (plate.chat.until - this.time.now) / 1000));
      }
    }
  }

  private createText(): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, '', {
        fontFamily: `"${UI_FONT}", monospace`,
        fontSize: '14px',
        fontStyle: '600',
        color: '#fbf5ea',
        stroke: '#2a1b2e',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setLineSpacing(-2);
  }
}
