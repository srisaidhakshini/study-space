import Phaser from 'phaser';
import { baseMapId } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { SCENES } from './depths';
import { devHomeRequested, installDevHome } from './home/homeDev';
import { BootScene } from './scenes/BootScene';
import { OverlayScene } from './scenes/OverlayScene';
import { WorldScene, type WorldInit } from './scenes/WorldScene';

export interface GameHandle {
  /**
   * (Re)enters the world. Online it places the player where the server says;
   * offline it uses the manifest's starting map. Safe to call after joining
   * a server, after leaving one, and more than once in a row.
   */
  startWorld(): void;
}

/** True if the map (a shared place, a home or a street page) can be drawn from the manifest. */
function mapAvailable(mapId: string): boolean {
  return baseMapId(mapId, app.homes.info?.tier) in app.manifest.maps;
}

/** Where the world should open right now. */
function entryPoint(): WorldInit {
  const net = app.net;
  if (net.online) {
    const me = net.self();
    const at = me
      ? { map: me.map, x: me.x, y: me.y, facing: me.dir }
      : net.welcome
        ? { map: net.welcome.map, x: net.welcome.x, y: net.welcome.y, facing: net.welcome.dir }
        : null;
    if (at && mapAvailable(at.map)) return { map: at.map, spawn: '', at: { x: at.x, y: at.y, facing: at.facing } };
  }
  // Dev only: ?home=1 opens a furnished home with a local stand-in for the server (&edit=1 starts editing).
  if (devHomeRequested() && 'home_1' in app.manifest.maps) return { map: installDevHome(), spawn: 'entrance' };
  // Solo shortcut for testing a map: http://localhost:5173/?map=cafe&spawn=entrance
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get('map');
  if (wanted && app.manifest.maps[wanted]) return { map: wanted, spawn: params.get('spawn') ?? 'entrance' };
  return { map: app.manifest.start.map, spawn: app.manifest.start.spawn };
}

/**
 * Runs `start` once the page has a real size. A page opened in a background
 * tab can report a 0x0 window, and Phaser's WebGL renderer then fails to
 * create its framebuffers and never recovers, so the game never boots.
 */
function whenSized(parent: HTMLElement, start: () => void): void {
  const sized = (): boolean =>
    window.innerWidth > 0 && window.innerHeight > 0 && parent.clientWidth > 0 && parent.clientHeight > 0;
  if (sized()) {
    start();
    return;
  }
  const timer = window.setInterval(() => {
    if (!sized()) return;
    window.clearInterval(timer);
    start();
  }, 150);
}

export function createGame(parent: HTMLElement): GameHandle {
  let game: Phaser.Game | null = null;

  const launch = (type: number): void => {
    game = new Phaser.Game({
      type,
      parent,
      backgroundColor: '#2a1b2e',
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      input: { activePointers: 3 },
      scene: [BootScene, WorldScene, OverlayScene],
    });
  };

  // Some graphics setups cannot create the WebGL render targets Phaser needs;
  // it then throws while booting and never recovers. Restart once with the
  // slower but universal Canvas renderer rather than leaving a blank page.
  const forced = new URLSearchParams(window.location.search).get('renderer');
  let fellBack = false;
  window.addEventListener('error', (event) => {
    if (fellBack || !/framebuffer|webgl/i.test(String(event.message))) return;
    fellBack = true;
    console.warn('WebGL failed to start; falling back to the Canvas renderer.');
    game?.destroy(true);
    parent.replaceChildren();
    launch(Phaser.CANVAS);
  });
  whenSized(parent, () => launch(forced === 'canvas' ? Phaser.CANVAS : Phaser.AUTO));

  // Calls in the same tick (the UI after joining, the net layer after a
  // drop) are merged so the world only restarts once.
  let scheduled = false;
  const startWorld = (): void => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      game?.scene.start(SCENES.world, entryPoint());
    }, 0);
  };

  // When the connection is lost (or left), the multiplayer world is gone:
  // continue solo from the start of the town.
  let worldStarted = false;
  let wasOnline = false;
  app.net.changed.subscribe(() => {
    const online = app.net.online;
    if (wasOnline && !online && worldStarted) startWorld();
    wasOnline = online;
  });
  bus.on('net:lost', () => {
    if (worldStarted) startWorld();
  });

  return {
    startWorld(): void {
      worldStarted = true;
      startWorld();
    },
  };
}
