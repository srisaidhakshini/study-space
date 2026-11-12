import { AUDIO_KEYS, weatherAt } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import {
  CROSSFADE_SECONDS,
  RAIN_FADE_SECONDS,
  channelGain,
  isTypingTarget,
  masterGain,
  planLoop,
  rainFilterHz,
  rainGain,
  type LoopChannel,
} from './mix';

const ASSET_ROOT = 'assets/';
const WEATHER_CHECK_MS = 5000;
/** Time constant for volume changes: short enough to feel instant, long enough not to click. */
const VOLUME_TC = 0.05;
const DUCK_TC = 0.6;

/** A playing loop and the gain that fades it in or out. */
interface Loop {
  key: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

type AudioContextCtor = typeof AudioContext;

/**
 * Plays the ambience and music for each place, plus rain, with the Web Audio
 * API. Graph: loop -> loop gain -> channel gain -> master -> speakers, and
 * rain -> low-pass filter -> rain gain -> master.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private readonly channels = {} as Record<LoopChannel, GainNode>;
  private rainBus!: GainNode;
  private rainFilter!: BiquadFilterNode;

  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>();
  private readonly failed = new Set<string>();

  private readonly loops: Record<LoopChannel, Loop | null> = { music: null, ambience: null };
  private rain: Loop | null = null;

  private mapId = '';
  private started = false;
  private unlocked = false;
  /** Bumped on every place change so a slow download for an old place is ignored. */
  private placeToken = 0;

  /** Wires everything up. Call once, when the assets are loaded. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    for (const channel of ['music', 'ambience'] as const) {
      this.channels[channel] = ctx.createGain();
      this.channels[channel].connect(this.master);
    }
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainBus = ctx.createGain();
    this.rainBus.gain.value = 0;
    this.rainFilter.connect(this.rainBus);
    this.rainBus.connect(this.master);
    this.applyVolumes(true);

    this.listenForGesture();
    bus.on('location', ({ mapId }) => this.enterPlace(mapId));
    app.settings.changed.subscribe(() => {
      this.applyVolumes(false);
      this.updateRain();
    });
    app.timer.changed.subscribe(() => this.applyVolumes(false));
    app.timer.events.subscribe((event) => {
      if (event === 'focusDone') this.chime([659.25, 783.99, 1046.5]); // rising: time for a break
      else if (event === 'breakDone') this.chime([783.99, 587.33]); // falling: back to work
    });
    bus.on('ui:alertPreview', () => this.chime([659.25, 783.99, 1046.5]));
    window.setInterval(() => this.updateRain(), WEATHER_CHECK_MS);
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('keydown', (event) => this.onKey(event));

    void this.prefetch();
    this.exposeDebugHandle();
  }

  // ---- Browser autoplay rules -------------------------------------------------

  /** Browsers keep audio silent until the player interacts, so resume on the first gesture. */
  private listenForGesture(): void {
    const unlock = (): void => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      this.unlocked = true;
      void this.resume();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  private async resume(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || document.hidden) return;
    try {
      if (ctx.state !== 'running') await ctx.resume();
    } catch {
      // Still blocked; the next gesture tries again.
    }
  }

  private onVisibility(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => undefined);
    else void this.resume();
  }

  // ---- Loading ------------------------------------------------------------------

  private paths(): Record<string, string> {
    return app.manifest.audio ?? {};
  }

  /** Downloads and decodes a file once; null if it is missing or broken (logged once). */
  private load(key: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const path = this.paths()[key];
    const ctx = this.ctx;
    if (!path || !ctx) return Promise.resolve(null);

    const task = (async (): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(ASSET_ROOT + path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(key, buffer);
        return buffer;
      } catch (error) {
        if (!this.failed.has(key)) {
          this.failed.add(key);
          console.warn(`Could not load audio "${key}" from ${path}:`, error);
        }
        return null;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, task);
    return task;
  }

  /** Decodes everything in the background, the current place's sounds first. */
  private async prefetch(): Promise<void> {
    const wanted = new Set<string>();
    const entry = app.manifest.maps[this.mapId];
    for (const key of [entry?.ambience, entry?.music, AUDIO_KEYS.rain]) if (key) wanted.add(key);
    for (const key of Object.keys(this.paths())) wanted.add(key);
    for (const key of wanted) await this.load(key);
  }

  // ---- Places ---------------------------------------------------------------------

  private enterPlace(mapId: string): void {
    if (mapId === this.mapId) return;
    this.mapId = mapId;
    const token = ++this.placeToken;
    const entry = app.manifest.maps[mapId];
    for (const channel of ['ambience', 'music'] as const) {
      const current = this.loops[channel]?.key ?? null;
      const wanted = channel === 'ambience' ? entry?.ambience : entry?.music;
      const plan = planLoop(current, wanted);
      if (plan === 'keep' || plan === 'none') continue;
      if (plan === 'stop' || plan === 'swap') this.fadeOut(channel);
      if (wanted) void this.fadeIn(channel, wanted, token);
    }
    this.updateRain();
  }

  private async fadeIn(channel: LoopChannel, key: string, token: number): Promise<void> {
    const buffer = await this.load(key);
    const ctx = this.ctx;
    if (!buffer || !ctx || token !== this.placeToken) return;
    const loop = this.createLoop(key, buffer, this.channels[channel]);
    this.loops[channel] = loop;
    const now = ctx.currentTime;
    loop.gain.gain.setValueAtTime(0, now);
    loop.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SECONDS);
  }

  private fadeOut(channel: LoopChannel): void {
    const loop = this.loops[channel];
    this.loops[channel] = null;
    if (loop) this.retire(loop, CROSSFADE_SECONDS);
  }

  private createLoop(key: string, buffer: AudioBuffer, destination: AudioNode): Loop {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(destination);
    source.start();
    return { key, source, gain };
  }

  /** Fades a loop to silence on the audio clock, then stops and disconnects it. */
  private retire(loop: Loop, seconds: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setValueAtTime(loop.gain.gain.value, now);
    loop.gain.gain.linearRampToValueAtTime(0, now + seconds);
    loop.source.stop(now + seconds + 0.05);
    loop.source.onended = (): void => {
      loop.source.disconnect();
      loop.gain.disconnect();
    };
  }

  // ---- Volumes and rain -------------------------------------------------------------

  /**
   * Plays a short bell arpeggio at the alert volume, through the master bus
   * (so muting silences it). It wakes the audio context so a chime still
   * sounds when the tab is in the background.
   */
  private chime(notes: number[]): void {
    const ctx = this.ctx;
    const volume = app.settings.get().alerts;
    if (!ctx || !this.unlocked || volume <= 0) return;
    void ctx.resume().catch(() => undefined).then(() => {
      const start = ctx.currentTime + 0.05;
      notes.forEach((freq, i) => {
        const at = start + i * 0.22;
        for (const [mult, level] of [[1, 1], [2.01, 0.3]] as const) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq * mult;
          const peak = 0.35 * volume * level;
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
          osc.connect(gain).connect(this.master);
          osc.start(at);
          osc.stop(at + 1.2);
        }
      });
    });
  }

  private focusing(): boolean {
    return app.timer.state.phase === 'focus';
  }

  private applyVolumes(immediate: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const settings = app.settings.get();
    const ramp = (param: AudioParam, value: number, tc: number): void => {
      if (immediate) param.setValueAtTime(value, ctx.currentTime);
      else param.setTargetAtTime(value, ctx.currentTime, tc);
    };
    ramp(this.master.gain, masterGain(settings), VOLUME_TC);
    ramp(this.channels.ambience.gain, channelGain(settings, 'ambience', false), VOLUME_TC);
    ramp(this.channels.music.gain, channelGain(settings, 'music', this.focusing()), this.focusing() ? DUCK_TC : VOLUME_TC);
  }

  private isIndoor(): boolean {
    return app.manifest.maps[this.mapId]?.indoor === true;
  }

  /** Starts, adjusts or stops the rain loop to match the weather, settings and place. */
  private updateRain(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const indoor = this.isIndoor();
    const target = rainGain(app.settings.get(), weatherAt(Date.now()), indoor);
    const now = ctx.currentTime;
    this.rainFilter.frequency.setTargetAtTime(rainFilterHz(indoor), now, 0.3);
    this.rainBus.gain.setTargetAtTime(target, now, target > 0 ? 1 : RAIN_FADE_SECONDS / 3);

    if (target > 0 && !this.rain) void this.startRain();
    if (target === 0 && this.rain) {
      const loop = this.rain;
      this.rain = null;
      this.retire(loop, RAIN_FADE_SECONDS);
    }
  }

  private async startRain(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.rain) return;
    const buffer = await this.load(AUDIO_KEYS.rain);
    // The weather may have cleared while the file downloaded.
    if (!buffer || this.rain || rainGain(app.settings.get(), weatherAt(Date.now()), this.isIndoor()) === 0) return;
    const loop = this.createLoop(AUDIO_KEYS.rain, buffer, this.rainFilter);
    this.rain = loop;
    const now = ctx.currentTime;
    loop.gain.gain.setValueAtTime(0, now);
    loop.gain.gain.linearRampToValueAtTime(1, now + RAIN_FADE_SECONDS);
  }

  // ---- Keyboard ----------------------------------------------------------------------

  /** M toggles mute unless text is being typed or a menu is open. */
  private onKey(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'm' || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target && isTypingTarget(target.tagName, target.isContentEditable)) return;
    if (document.querySelector('.backdrop')) return;
    const muted = !app.settings.get().muted;
    app.settings.update({ muted });
    bus.emit('toast', { text: muted ? 'Sound off' : 'Sound on' });
  }

  // ---- Debugging ----------------------------------------------------------------------

  /** Development only: a read-only view of the audio graph at `window.__audio`. */
  private exposeDebugHandle(): void {
    if (!import.meta.env.DEV) return;
    const read = (): unknown => ({
      state: this.ctx?.state ?? 'none',
      map: this.mapId,
      loops: {
        music: this.loops.music?.key ?? null,
        ambience: this.loops.ambience?.key ?? null,
        rain: this.rain?.key ?? null,
      },
      gains: {
        master: this.master.gain.value,
        music: this.channels.music.gain.value,
        ambience: this.channels.ambience.gain.value,
        rain: this.rainBus.gain.value,
        rainFilterHz: this.rainFilter.frequency.value,
      },
      loaded: [...this.buffers.keys()],
      failed: [...this.failed],
    });
    Object.defineProperty(window, '__audio', { get: read, configurable: true });
  }
}
