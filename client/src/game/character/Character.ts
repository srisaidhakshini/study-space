import Phaser from 'phaser';
import { CHAR_H, FX_KEYS, type AnimationName, type Appearance, type Direction } from '@study/shared';
import { DEPTH } from '../depths';
import { characterAnimKey, ensureCharacterTexture } from './textures';

/** Looping states a character can be in. One-shot animations play on top. */
export type CharacterAction = 'idle' | 'walk' | 'sit' | 'study' | 'sleep';

/** Row of the frame where the feet touch the ground (2px of padding below). */
const FEET_ROW = CHAR_H - 2;
const DUST_ANIM = 'fx:dust';
const DUST_EVERY_MS = 260;
const ZZZ_EVERY_MS = 1300;

/**
 * A chibi character in the world: the local player now, remote players in
 * phase 2. Its position is the centre of its feet.
 */
export class Character {
  x = 0;
  y = 0;
  facing: Direction = 'down';
  /** Shown on the nameplate. */
  name: string;
  /** Second nameplate line (subject and clock), or null. */
  statusText: string | null = null;

  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly bubble: Phaser.GameObjects.Image;
  private readonly bubbleIcon: Phaser.GameObjects.Image;
  private texture: string;
  private action: CharacterAction = 'idle';
  private oneShot: AnimationName | null = null;
  private bubbleFrame: number | null = null;
  private dustClock = 0;
  private zzzClock = 0;
  private pageTurnIn = 0;
  private age = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    appearance: Appearance,
    name: string,
  ) {
    this.name = name;
    this.texture = ensureCharacterTexture(scene, appearance);
    this.shadow = scene.add.image(0, 0, FX_KEYS.shadow);
    this.sprite = scene.add.sprite(0, 0, this.texture, 0).setOrigin(0.5, FEET_ROW / CHAR_H);
    this.bubble = scene.add.image(0, 0, FX_KEYS.bubble).setOrigin(0, 1).setDepth(DEPTH.bubble).setVisible(false);
    this.bubbleIcon = scene.add
      .image(0, 0, FX_KEYS.subjectIcons, 0)
      .setOrigin(0, 0)
      .setDepth(DEPTH.bubble + 1)
      .setVisible(false);

    if (!scene.anims.exists(DUST_ANIM)) {
      scene.anims.create({
        key: DUST_ANIM,
        frames: scene.anims.generateFrameNumbers(FX_KEYS.dust, { start: 0, end: 3 }),
        frameRate: 10,
        repeat: 0,
      });
    }
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.finishOneShot());
    this.resetPageTurn();
    this.play();
    this.sync();
  }

  get currentAction(): CharacterAction {
    return this.action;
  }

  /** True while a one-shot animation (wave, stretch, ...) is playing. */
  get busy(): boolean {
    return this.oneShot !== null;
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.sync();
  }

  setFacing(facing: Direction): void {
    if (this.facing === facing) return;
    this.facing = facing;
    this.play();
  }

  setAction(action: CharacterAction): void {
    if (this.action === action) return;
    this.action = action;
    this.dustClock = DUST_EVERY_MS;
    this.zzzClock = 400;
    if (action === 'study') this.resetPageTurn();
    if (this.oneShot === null) this.play();
  }

  /** Plays an animation once, then returns to the current action. */
  playOnce(anim: AnimationName): void {
    this.oneShot = anim;
    this.play();
  }

  /** Stops any one-shot animation right away. */
  cancelOneShot(): void {
    if (this.oneShot === null) return;
    this.oneShot = null;
    this.play();
  }

  setOpacity(alpha: number): void {
    this.sprite.setAlpha(alpha);
    this.shadow.setAlpha(alpha);
  }

  setAppearance(appearance: Appearance): void {
    this.texture = ensureCharacterTexture(this.scene, appearance);
    this.play(true);
  }

  /** Shows a thought bubble with an icon frame, or hides it with null. */
  setBubble(iconFrame: number | null): void {
    if (this.bubbleFrame === iconFrame) return;
    this.bubbleFrame = iconFrame;
    const visible = iconFrame !== null;
    this.bubble.setVisible(visible);
    this.bubbleIcon.setVisible(visible);
    if (iconFrame !== null) this.bubbleIcon.setFrame(iconFrame);
  }

  update(deltaMs: number): void {
    this.age += deltaMs;
    if (this.action === 'walk' && this.oneShot === null) {
      this.dustClock += deltaMs;
      if (this.dustClock >= DUST_EVERY_MS) {
        this.dustClock = 0;
        this.spawnDust();
      }
    }
    if (this.action === 'sleep') {
      this.zzzClock += deltaMs;
      if (this.zzzClock >= ZZZ_EVERY_MS) {
        this.zzzClock = 0;
        this.spawnZzz();
      }
    }
    if (this.action === 'study' && this.oneShot === null) {
      this.pageTurnIn -= deltaMs;
      if (this.pageTurnIn <= 0) {
        this.resetPageTurn();
        this.playOnce('pageturn');
      }
    }
    this.sync();
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.bubble.destroy();
    this.bubbleIcon.destroy();
  }

  private resetPageTurn(): void {
    this.pageTurnIn = Phaser.Math.Between(6000, 12000);
  }

  private finishOneShot(): void {
    if (this.oneShot === null) return;
    this.oneShot = null;
    this.play();
  }

  private play(force = false): void {
    const anim = this.oneShot ?? this.action;
    const key = characterAnimKey(this.texture, anim, this.facing);
    if (force) this.sprite.setTexture(this.texture);
    this.sprite.play(key, !force);
  }

  private sync(): void {
    const seated = this.action === 'sit' || this.action === 'study' || this.action === 'sleep';
    this.sprite.setPosition(this.x, this.y).setDepth(this.y);
    this.shadow
      .setPosition(this.x, this.y - 1)
      .setDepth(this.y - 0.5)
      .setVisible(!seated);
    if (this.bubbleFrame !== null) {
      const bob = Math.round(Math.sin(this.age / 420));
      const bx = Math.round(this.x) + 7;
      const by = Math.round(this.y) - 30 + bob;
      this.bubble.setPosition(bx, by);
      this.bubbleIcon.setPosition(bx + 4, by - this.bubble.height + 2);
    }
  }

  private spawnDust(): void {
    const puff = this.scene.add.sprite(this.x, this.y - 2, FX_KEYS.dust, 0).setDepth(this.y - 0.4);
    puff.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => puff.destroy());
    puff.play(DUST_ANIM);
  }

  private spawnZzz(): void {
    const z = this.scene.add.image(this.x + 9, this.y - 34, FX_KEYS.zzz).setDepth(DEPTH.bubble);
    this.scene.tweens.add({
      targets: z,
      x: z.x + 6,
      y: z.y - 14,
      alpha: 0,
      duration: 1700,
      onComplete: () => z.destroy(),
    });
  }
}
