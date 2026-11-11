import Phaser from 'phaser';
import { FX_KEYS, type LightDef } from '@study/shared';
import { DEPTH } from '../depths';

/** The warm colour of a street lamp's glow. */
const GLOW_TINT = 0xffd98a;
/** The lit glass of the lamp head. */
const CORE_COLOR = 0xfff3c4;
/** How quickly lamps fade on and off, in ms. */
const FADE_MS = 1200;
const FLICKER = 0.06;
const GLOW_PEAK = 0.9;
/** Below this the lamp counts as off and its objects are hidden. */
const OFF_LEVEL = 0.01;

interface Light {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Rectangle;
  phase: number;
}

/** Street lamps and lanterns that glow when it is dark or raining. */
export class Lights {
  private readonly lights: Light[];
  private level = 0;
  private clock = 0;
  private visible = false;

  constructor(scene: Phaser.Scene, defs: readonly LightDef[]) {
    this.lights = defs.map((def, index) => {
      const glow = scene.add
        .image(def.x, def.y, FX_KEYS.glow)
        .setTint(GLOW_TINT)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(def.radius / 32)
        .setDepth(DEPTH.glow)
        .setVisible(false);
      const core = scene.add
        .rectangle(def.x - 1, def.y - 3, 2, 2, CORE_COLOR)
        .setOrigin(0, 0)
        .setDepth(DEPTH.glow + 10)
        .setVisible(false);
      return { glow, core, phase: index * 1.7 };
    });
  }

  /** `target` is how lit the lamps should be, 0 (off) to 1 (full). */
  update(deltaMs: number, target: number): void {
    this.clock += deltaMs;
    this.level += (target - this.level) * (1 - Math.exp(-deltaMs / FADE_MS));
    if (this.level < OFF_LEVEL && target < OFF_LEVEL) {
      if (this.visible) this.setVisible(false);
      return;
    }
    if (!this.visible) this.setVisible(true);
    const seconds = this.clock / 1000;
    for (const light of this.lights) {
      const flicker = 1 + FLICKER * Math.sin(seconds * 2.3 + light.phase) * Math.sin(seconds * 0.7 + light.phase * 0.5);
      light.glow.setAlpha(Math.min(1, this.level * GLOW_PEAK * flicker));
      light.core.setAlpha(Math.min(1, this.level * 1.4));
    }
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    for (const light of this.lights) {
      light.glow.setVisible(visible);
      light.core.setVisible(visible);
    }
  }

  destroy(): void {
    for (const light of this.lights) {
      light.glow.destroy();
      light.core.destroy();
    }
    this.lights.length = 0;
  }
}
