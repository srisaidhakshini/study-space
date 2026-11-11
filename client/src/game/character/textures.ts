import type Phaser from 'phaser';
import {
  ANIMATIONS,
  ANIMATION_NAMES,
  appearanceKey,
  DIRECTIONS,
  frameIndex,
  PET_ANIMATIONS,
  PET_COLUMNS,
  type AnimationDef,
  type AnimationName,
  type Appearance,
  type Direction,
  type PetAnimationName,
} from '@study/shared';
import { app } from '../../app';
import { composeCharacter } from './compositor';

export function characterAnimKey(texture: string, anim: AnimationName, direction: Direction): string {
  return `${texture}:${anim}:${direction}`;
}

export function petAnimKey(sheet: string, anim: PetAnimationName, direction: Direction): string {
  return `${sheet}:${anim}:${direction}`;
}

function createAnim(scene: Phaser.Scene, key: string, texture: string, def: AnimationDef, frames: number[]): void {
  if (scene.anims.exists(key)) return;
  scene.anims.create({
    key,
    frames: frames.map((frame) => ({ key: texture, frame })),
    frameRate: def.fps,
    repeat: def.repeat,
    yoyo: def.yoyo,
  });
}

/**
 * Returns the texture key for an appearance, compositing the layered sheet
 * and registering its frames and animations the first time it is asked for.
 */
export function ensureCharacterTexture(scene: Phaser.Scene, appearance: Appearance): string {
  const key = `char:${appearanceKey(appearance)}`;
  if (scene.textures.exists(key)) return key;

  const m = app.manifest.character;
  const canvas = composeCharacter(m, appearance, app.images);
  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) throw new Error(`Could not create character texture ${key}`);
  for (let row = 0; row < m.rows; row++) {
    for (let column = 0; column < m.columns; column++) {
      texture.add(row * m.columns + column, 0, column * m.frameWidth, row * m.frameHeight, m.frameWidth, m.frameHeight);
    }
  }

  for (const name of ANIMATION_NAMES) {
    const def = ANIMATIONS[name];
    for (const direction of DIRECTIONS) {
      const frames = Array.from({ length: def.frames }, (_, i) => frameIndex(direction, def.start + i));
      createAnim(scene, characterAnimKey(key, name, direction), key, def, frames);
    }
  }
  return key;
}

/** Registers the animations of a pet spritesheet (idempotent). */
export function ensurePetAnimations(scene: Phaser.Scene, sheet: string): void {
  for (const [name, def] of Object.entries(PET_ANIMATIONS) as [PetAnimationName, AnimationDef][]) {
    DIRECTIONS.forEach((direction, row) => {
      const frames = Array.from({ length: def.frames }, (_, i) => row * PET_COLUMNS + def.start + i);
      createAnim(scene, petAnimKey(sheet, name, direction), sheet, def, frames);
    });
  }
}
