import Phaser from 'phaser';
import { FX_KEYS, TILE, type LampDef } from '@study/shared';
import { DEPTH } from '../depths';

interface Lamp {
  def: LampDef;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  lit: boolean;
}

/** Desk lamps that switch on while someone is focusing at their seat. */
export class Lamps {
  private readonly lamps: Lamp[];

  constructor(scene: Phaser.Scene, defs: readonly LampDef[]) {
    this.lamps = defs.map((def) => {
      // Sort just in front of the desk tile the lamp stands on.
      const depth = Math.ceil(def.y / TILE) * TILE + 0.5;
      const sprite = scene.add.image(def.x, def.y, FX_KEYS.lamp, 0).setOrigin(0.5, 1).setDepth(depth);
      const glow = scene.add
        .image(def.x, def.y - 6, FX_KEYS.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.glow)
        .setVisible(false);
      return { def, sprite, glow, lit: false };
    });
  }

  /** `isFocusing` says whether the seat with that id has a running focus session. */
  update(isFocusing: (seatId: string) => boolean): void {
    for (const lamp of this.lamps) {
      const lit = isFocusing(lamp.def.seatId);
      if (lit === lamp.lit) continue;
      lamp.lit = lit;
      lamp.sprite.setFrame(lit ? 1 : 0);
      lamp.glow.setVisible(lit);
    }
  }
}
