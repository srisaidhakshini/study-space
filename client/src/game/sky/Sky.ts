import Phaser from 'phaser';
import { darkness, gameHour, skyTint, weatherAt, weatherTint, type LightDef, type WeatherState } from '@study/shared';
import { app } from '../../app';
import { DEPTH } from '../depths';
import { Lights } from './Lights';
import { Rain } from './Rain';
import { SKY_DEBUG } from './skyDebug';

/** The world clock is sampled this often; everything in between is smoothed. */
const REFRESH_MS = 1000;
/** The multiply colour eases toward its target with this time constant. */
const TINT_EASE_MS = 800;
/** Weather changes fade over about this long (rate = 1 / seconds). */
const WEATHER_FADE_S = 20;
/** Toggling the rain setting should feel immediate rather than a 20 s fade. */
const SETTING_FADE_S = 1.5;
const SETTING_FAST_MS = 4000;
/** Lamps come on a little when rain darkens the day. */
const RAIN_LAMP_BOOST = 0.35;

type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toInt(rgb: Rgb): number {
  return (Math.round(rgb[0]) << 16) | (Math.round(rgb[1]) << 8) | Math.round(rgb[2]);
}

function approach(value: number, target: number, step: number): number {
  const delta = target - value;
  return Math.abs(delta) <= step ? target : value + Math.sign(delta) * step;
}

/**
 * Day, night and weather for an outdoor map. Everything derives from the
 * shared world clock, so all players see the same sky. Owns a multiply tint
 * over the world, glowing street lamps and the rain layer.
 */
export class Sky {
  private readonly tint: Phaser.GameObjects.Rectangle;
  private readonly lights: Lights;
  private rain: Rain | null = null;

  private readonly skyRgb: Rgb = [...WHITE];
  private readonly current: Rgb = [...WHITE];
  private readonly cloudRgb: Rgb;
  private readonly rainRgb: Rgb;
  private cloudTarget = 0;
  private rainTarget = 0;
  private cloudLevel = 0;
  private rainLevel = 0;
  private darkLevel = 0;
  private rainEnabled = true;
  private sinceRefresh = REFRESH_MS;
  private clock = 0;
  private fastUntil = 0;
  private lastColor = -1;
  private readonly stopSettings: () => void;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    lights: readonly LightDef[],
    private readonly getOverlay: () => Phaser.Scene | null,
  ) {
    this.tint = scene.add
      .rectangle(0, 0, width, height, 0xffffff)
      .setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(DEPTH.ambient);
    this.lights = new Lights(scene, lights);
    this.cloudRgb = hexToRgb(weatherTint({ weather: 'cloudy', intensity: 1 }));
    this.rainRgb = hexToRgb(weatherTint({ weather: 'rain', intensity: 1 }));

    this.stopSettings = app.settings.changed.subscribe(() => {
      this.fastUntil = this.clock + SETTING_FAST_MS;
      this.sinceRefresh = REFRESH_MS; // re-read the clock on the next frame
    });

    if (import.meta.env.DEV) {
      (window as unknown as { __sky?: unknown }).__sky = {
        fps: (): number => scene.game.loop.actualFps,
        state: (): unknown => ({ hour: this.hourNow(), cloud: this.cloudLevel, rain: this.rainLevel, dark: this.darkLevel }),
      };
    }
  }

  private hourNow(): number {
    return SKY_DEBUG.hour ?? gameHour(Date.now());
  }

  private weatherNow(): WeatherState {
    if (SKY_DEBUG.weather) {
      return { weather: SKY_DEBUG.weather, intensity: SKY_DEBUG.weather === 'clear' ? 0 : SKY_DEBUG.intensity };
    }
    return weatherAt(Date.now());
  }

  /** Reads the world clock and the player's settings into smoothing targets. */
  private refresh(): void {
    const settings = app.settings.get();
    const hour = this.hourNow();
    const weather = this.weatherNow();
    this.rainEnabled = settings.rain;

    const sky = settings.dayNight ? hexToRgb(skyTint(hour)) : WHITE;
    this.skyRgb[0] = sky[0];
    this.skyRgb[1] = sky[1];
    this.skyRgb[2] = sky[2];
    this.darkLevel = settings.dayNight ? darkness(hour) : 0;

    this.cloudTarget = settings.rain && weather.weather === 'cloudy' ? weather.intensity : 0;
    this.rainTarget = settings.rain && weather.weather === 'rain' ? weather.intensity : 0;
  }

  update(deltaMs: number): void {
    const dt = Math.min(deltaMs, 100);
    this.clock += dt;
    this.sinceRefresh += dt;
    if (this.sinceRefresh >= REFRESH_MS) {
      this.sinceRefresh = 0;
      this.refresh();
    }

    // Weather fades slowly on its own, quickly right after a settings change.
    const rate = this.clock < this.fastUntil ? 1 / SETTING_FADE_S : 1 / WEATHER_FADE_S;
    const step = (rate * dt) / 1000;
    this.cloudLevel = approach(this.cloudLevel, this.cloudTarget, step);
    this.rainLevel = approach(this.rainLevel, this.rainTarget, step);

    // Target colour = sky tint x cloud tint x rain tint, per channel.
    const ease = 1 - Math.exp(-dt / TINT_EASE_MS);
    for (let c = 0; c < 3; c++) {
      const cloud = 255 + (this.cloudRgb[c]! - 255) * this.cloudLevel;
      const rain = 255 + (this.rainRgb[c]! - 255) * this.rainLevel;
      const target = (this.skyRgb[c]! * cloud * rain) / 65025;
      this.current[c] = this.current[c]! + (target - this.current[c]!) * ease;
    }
    const color = toInt(this.current);
    if (color !== this.lastColor) {
      this.lastColor = color;
      this.tint.setFillStyle(color);
    }

    const lit = Math.min(1, this.darkLevel + RAIN_LAMP_BOOST * this.rainLevel);
    this.lights.update(dt, lit);

    this.updateRain(dt);
  }

  private updateRain(dt: number): void {
    if (!this.rain) {
      const overlay = this.getOverlay();
      // The overlay scene starts a frame after the world; wait until it runs.
      if (!overlay || overlay.sys.settings.status !== Phaser.Scenes.RUNNING) return;
      this.rain = new Rain(overlay);
    }
    this.rain.update(dt, this.rainLevel, this.rainEnabled && this.rainTarget > 0);
  }

  destroy(): void {
    this.stopSettings();
    this.lights.destroy();
    this.rain?.destroy();
    this.rain = null;
    this.tint.destroy();
  }
}
