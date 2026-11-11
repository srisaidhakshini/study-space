import Phaser from 'phaser';
import { app } from '../../app';
import { bus } from '../../bus';
import { SCENES } from '../depths';

const ASSET_ROOT = 'assets/';

/** Loads everything listed in the asset manifest, then hands over to the UI. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    const { width, height } = this.scale;
    const barWidth = Math.min(320, width * 0.6);
    const x = (width - barWidth) / 2;
    const y = height / 2;
    const track = this.add.rectangle(x, y, barWidth, 10, 0x4a2f3a).setOrigin(0, 0.5);
    const fill = this.add.rectangle(x + 2, y, 0, 6, 0xf0c552).setOrigin(0, 0.5);
    this.load.on('progress', (value: number) => {
      fill.width = (barWidth - 4) * value;
    });
    this.load.once('complete', () => {
      track.destroy();
      fill.destroy();
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`Could not load asset "${file.key}" from ${String(file.url)}`);
    });

    const manifest = app.manifest;
    for (const [key, path] of Object.entries(manifest.images)) {
      this.load.image(key, ASSET_ROOT + path);
    }
    for (const [key, sheet] of Object.entries(manifest.spritesheets)) {
      this.load.spritesheet(key, ASSET_ROOT + sheet.path, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
    for (const [id, map] of Object.entries(manifest.maps)) {
      this.load.tilemapTiledJSON(id, ASSET_ROOT + map.path);
    }
  }

  create(): void {
    const textures = this.textures;
    app.images = (key) => (textures.exists(key) ? (textures.get(key).getSourceImage() as CanvasImageSource) : null);
    bus.emit('boot:ready');
  }
}
