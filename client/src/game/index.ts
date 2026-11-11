import Phaser from 'phaser';
import { app } from '../app';
import { bus } from '../bus';
import { SCENES } from './depths';
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
    if (at && app.manifest.maps[at.map]) return { map: at.map, spawn: '', at: { x: at.x, y: at.y, facing: at.facing } };
  }
  // Solo shortcut for testing a map: http://localhost:5173/?map=cafe&spawn=entrance
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get('map');
  if (wanted && app.manifest.maps[wanted]) return { map: wanted, spawn: params.get('spawn') ?? 'entrance' };
  return { map: app.manifest.start.map, spawn: app.manifest.start.spawn };
}

export function createGame(parent: HTMLElement): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#2a1b2e',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    input: { activePointers: 3 },
    scene: [BootScene, WorldScene, OverlayScene],
  });

  // Browser zoom and window resizes can leave the canvas at a stale size (a black
  // box smaller than the page). Re-measure after the layout settles, and once more
  // shortly after, because zooming fires several resize events in a row.
  let resizeFrame = 0;
  let resizeTimer = 0;
  const syncSize = (): void => {
    game.scale.resize(window.innerWidth, window.innerHeight);
    game.scale.refresh();
  };
  const resync = (): void => {
    window.cancelAnimationFrame(resizeFrame);
    window.clearTimeout(resizeTimer);
    resizeFrame = window.requestAnimationFrame(syncSize);
    resizeTimer = window.setTimeout(syncSize, 250);
  };
  window.addEventListener('resize', resync);
  window.visualViewport?.addEventListener('resize', resync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resync();
  });

  // Calls in the same tick (the UI after joining, the net layer after a
  // drop) are merged so the world only restarts once.
  let scheduled = false;
  const startWorld = (): void => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      game.scene.start(SCENES.world, entryPoint());
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
