import Phaser from 'phaser';

const MAX_DROPS = 140;
const MAX_SPLASHES = 24;
const DROP_COLOR = '#bcd4e6';
const DROP_ALPHA = 0.55;
const SPLASH_ALPHA = 0.5;
const SPLASH_LIFE_S = 0.38;
/** How the rain layer fades in and out, in ms. */
const FADE_MS = 3000;
/** Horizontal speed relative to vertical: the rain slants down and to the left. */
const SLANT = 0.36;

const TEX_DROP_LONG = 'sky_drop_long';
const TEX_DROP_SHORT = 'sky_drop_short';
const TEX_RIPPLE = 'sky_ripple';

const RIPPLE_ROWS = ['...####...', '.##....##.', '##......##', '.##....##.', '...####...'];

/** Draws a slanted streak: 2px wide, fading in toward the bottom. */
function makeDrop(textures: Phaser.Textures.TextureManager, key: string, length: number): void {
  if (textures.exists(key)) return;
  const slant = Math.round(length * SLANT);
  const canvas = textures.createCanvas(key, slant + 2, length);
  if (!canvas) return;
  const ctx = canvas.getContext();
  for (let y = 0; y < length; y++) {
    const x = slant - Math.round((y * slant) / (length - 1));
    ctx.globalAlpha = 0.35 + 0.65 * (y / (length - 1));
    ctx.fillStyle = DROP_COLOR;
    ctx.fillRect(x, y, 2, 1);
  }
  canvas.refresh();
}

function makeRipple(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(TEX_RIPPLE)) return;
  const canvas = textures.createCanvas(TEX_RIPPLE, 10, 5);
  if (!canvas) return;
  const ctx = canvas.getContext();
  ctx.fillStyle = DROP_COLOR;
  RIPPLE_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(x, y, 1, 1);
  });
  canvas.refresh();
}

/**
 * Falling rain drawn in screen space on the overlay scene, so streaks keep
 * their size whatever the world zoom. All objects are pooled up front and the
 * per-frame update allocates nothing.
 */
export class Rain {
  private readonly drops: Phaser.GameObjects.Image[] = [];
  private readonly splashes: Phaser.GameObjects.Image[] = [];
  private readonly x = new Float32Array(MAX_DROPS);
  private readonly y = new Float32Array(MAX_DROPS);
  private readonly speed = new Float32Array(MAX_DROPS);
  private readonly landY = new Float32Array(MAX_DROPS);
  private readonly splashAge = new Float32Array(MAX_SPLASHES).fill(-1);
  private nextSplash = 0;
  private shown = 0;
  private layer = 0;
  private lastLayerAlpha = -1;

  constructor(private readonly scene: Phaser.Scene) {
    makeDrop(scene.textures, TEX_DROP_LONG, 12);
    makeDrop(scene.textures, TEX_DROP_SHORT, 8);
    makeRipple(scene.textures);
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops.push(
        scene.add
          .image(0, 0, i % 2 === 0 ? TEX_DROP_LONG : TEX_DROP_SHORT)
          .setOrigin(0.5, 0.5)
          .setDepth(-10)
          .setVisible(false),
      );
      this.respawn(i, true);
    }
    for (let i = 0; i < MAX_SPLASHES; i++) {
      this.splashes.push(scene.add.image(0, 0, TEX_RIPPLE).setDepth(-9).setVisible(false));
    }
  }

  private width(): number {
    return this.scene.scale.width;
  }

  private height(): number {
    return this.scene.scale.height;
  }

  private respawn(i: number, scatter: boolean): void {
    const w = this.width();
    const h = this.height();
    this.x[i] = Math.round(Math.random() * w * 1.3);
    this.speed[i] = 520 + Math.random() * 280;
    this.landY[i] = h * (0.55 + Math.random() * 0.43);
    this.y[i] = scatter ? Math.random() * this.landY[i]! : -12 - Math.random() * 40;
  }

  /**
   * `density` (0 to 1) sets how many drops fall; `active` says whether rain
   * should be showing at all, which fades the whole layer in or out.
   */
  update(deltaMs: number, density: number, active: boolean): void {
    const target = active ? 1 : 0;
    this.layer += Math.sign(target - this.layer) * Math.min(Math.abs(target - this.layer), deltaMs / FADE_MS);
    if (this.layer <= 0.001 && !active) {
      if (this.shown > 0) this.hideAll();
      return;
    }

    const count = Math.round(MAX_DROPS * Math.min(1, Math.max(0, density)));
    if (count !== this.shown) this.setCount(count);

    const dt = deltaMs / 1000;
    const alpha = DROP_ALPHA * this.layer;
    const fadeChanged = Math.abs(this.layer - this.lastLayerAlpha) > 0.002;
    if (fadeChanged) this.lastLayerAlpha = this.layer;

    for (let i = 0; i < count; i++) {
      const speed = this.speed[i]!;
      const nx = this.x[i]! - speed * SLANT * dt;
      const ny = this.y[i]! + speed * dt;
      if (ny >= this.landY[i]!) {
        this.startSplash(nx, this.landY[i]!);
        this.respawn(i, false);
      } else {
        this.x[i] = nx;
        this.y[i] = ny;
      }
      const drop = this.drops[i]!;
      drop.x = Math.round(this.x[i]!);
      drop.y = Math.round(this.y[i]!);
      if (fadeChanged) drop.alpha = alpha;
    }

    for (let i = 0; i < MAX_SPLASHES; i++) {
      const age = this.splashAge[i]!;
      if (age < 0) continue;
      const next = age + dt;
      const splash = this.splashes[i]!;
      if (next >= SPLASH_LIFE_S) {
        this.splashAge[i] = -1;
        splash.setVisible(false);
        continue;
      }
      this.splashAge[i] = next;
      const t = next / SPLASH_LIFE_S;
      splash.setScale(0.5 + t * 0.9, 0.5 + t * 0.9);
      splash.alpha = SPLASH_ALPHA * this.layer * (1 - t);
    }
  }

  private startSplash(x: number, y: number): void {
    const i = this.nextSplash;
    this.nextSplash = (i + 1) % MAX_SPLASHES;
    this.splashAge[i] = 0;
    this.splashes[i]!.setPosition(Math.round(x), Math.round(y)).setVisible(true).setScale(0.5);
  }

  private setCount(count: number): void {
    for (let i = 0; i < MAX_DROPS; i++) {
      const visible = i < count;
      const drop = this.drops[i]!;
      if (visible && !drop.visible) this.respawn(i, true);
      drop.setVisible(visible);
    }
    this.shown = count;
    this.lastLayerAlpha = -1;
  }

  private hideAll(): void {
    for (const drop of this.drops) drop.setVisible(false);
    for (let i = 0; i < MAX_SPLASHES; i++) {
      this.splashAge[i] = -1;
      this.splashes[i]!.setVisible(false);
    }
    this.shown = 0;
    this.lastLayerAlpha = -1;
  }

  destroy(): void {
    for (const drop of this.drops) drop.destroy();
    for (const splash of this.splashes) splash.destroy();
    this.drops.length = 0;
    this.splashes.length = 0;
  }
}
