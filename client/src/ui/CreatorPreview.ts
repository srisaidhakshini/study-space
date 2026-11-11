import {
  ANIMATIONS,
  DIRECTIONS,
  PET_FRAME,
  frameIndex,
  type AnimationName,
  type Appearance,
  type Direction,
} from '@study/shared';
import { app } from '../app';
import { composeCharacter } from '../game/character/compositor';

const SCALE = 6;
const PET_SCALE = 4;
const PAD_X = 4;

/** Clockwise turn order for the rotate buttons. */
const TURN_ORDER: readonly Direction[] = ['down', 'left', 'up', 'right'];

/** Animated, scaled-up view of the character being edited. */
export class CreatorPreview {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private sheet: HTMLCanvasElement | null = null;
  private petSheet: CanvasImageSource | null = null;
  private direction: Direction = 'down';
  private animation: AnimationName = 'idle';
  private columns: number[] = [0];
  private step = 0;
  private timer = 0;

  constructor() {
    const m = app.manifest.character;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.canvas.width = (m.frameWidth + PAD_X * 2) * SCALE;
    this.canvas.height = (m.frameHeight + 2) * SCALE;
    this.ctx = this.canvas.getContext('2d')!;
    this.setAnimation('idle');
  }

  setAppearance(appearance: Appearance): void {
    this.sheet = composeCharacter(app.manifest.character, appearance, app.images);
    this.draw();
  }

  setPet(petId: string): void {
    const sheet = app.manifest.pets.find((p) => p.id === petId)?.sheet ?? null;
    this.petSheet = sheet ? app.images(sheet) : null;
    this.draw();
  }

  turn(delta: number): void {
    const index = TURN_ORDER.indexOf(this.direction);
    this.direction = TURN_ORDER[(index + delta + TURN_ORDER.length) % TURN_ORDER.length]!;
    this.draw();
  }

  get currentAnimation(): AnimationName {
    return this.animation;
  }

  setAnimation(name: AnimationName): void {
    const def = ANIMATIONS[name];
    const forward = Array.from({ length: def.frames }, (_, i) => def.start + i);
    // Yoyo plays back down without repeating the end frames.
    this.columns = def.yoyo && def.frames > 2 ? [...forward, ...forward.slice(1, -1).reverse()] : forward;
    this.animation = name;
    this.step = 0;
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.step = (this.step + 1) % this.columns.length;
      this.draw();
    }, 1000 / def.fps);
    this.draw();
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const m = app.manifest.character;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const feetY = (m.frameHeight - 1) * SCALE;
    ctx.fillStyle = 'rgba(42, 27, 46, 0.22)';
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, feetY - SCALE, 10 * SCALE, 3 * SCALE, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.sheet) {
      const frame = frameIndex(this.direction, this.columns[this.step] ?? 0);
      const sx = (frame % m.columns) * m.frameWidth;
      const sy = Math.floor(frame / m.columns) * m.frameHeight;
      ctx.drawImage(
        this.sheet,
        sx,
        sy,
        m.frameWidth,
        m.frameHeight,
        PAD_X * SCALE,
        0,
        m.frameWidth * SCALE,
        m.frameHeight * SCALE,
      );
    }
    if (this.petSheet) {
      const row = DIRECTIONS.indexOf(this.direction);
      const size = PET_FRAME * PET_SCALE;
      ctx.drawImage(
        this.petSheet,
        (this.step % 2) * PET_FRAME,
        row * PET_FRAME,
        PET_FRAME,
        PET_FRAME,
        canvas.width - size,
        feetY - size + PET_SCALE,
        size,
        size,
      );
    }
  }
}
