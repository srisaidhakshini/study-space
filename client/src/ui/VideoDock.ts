import { button, h, setChildren } from './dom';
import { getNet, watchNet } from './netAccess';

/** Tile width before you resize it: roomy for a pair, smaller as more people join. */
function defaultWidth(count: number): number {
  if (count <= 1) return 220;
  if (count === 2) return 280;
  if (count === 3) return 220;
  return 180;
}
const MIN_WIDTH = 96;
const MAX_WIDTH = 560;
const SELF = 'self';

/**
 * Camera panel, open to everyone in the room like voice. "Start camera" opens it:
 * one tile per person, each resizable by dragging its bottom-left corner. A small
 * menu in the top-right corner maximizes (every tile full screen), minimizes the
 * panel to a pill, pauses your camera or stops video. Clicking a tile maximizes too.
 */
export function createVideoDock(): HTMLElement {
  const dock = h('div', { class: 'video-dock' });
  dock.hidden = true;
  let subscribed: ReturnType<typeof getNet> = null;

  let expanded = false; // full-screen view of all tiles
  let minimized = false; // the panel is just a pill; the camera stays on
  let menuOpen = false;
  let dragging = false;
  let dirty = false; // a render was skipped while dragging
  const widths = new Map<string, number>(); // chosen tile widths, by player id

  // Full-screen view. It sits outside the dock so it survives the dock re-rendering.
  const bigGrid = h('div', { class: 'video-big-grid' });
  const overlay = h(
    'div',
    { class: 'video-big' },
    bigGrid,
    button('Close', 'btn btn-small video-big-close', () => setExpanded(false), { title: 'Close (Esc)' }),
  );
  overlay.hidden = true;

  const setExpanded = (value: boolean): void => {
    expanded = value;
    menuOpen = false;
    render();
  };
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (expanded) setExpanded(false);
    else if (menuOpen) {
      menuOpen = false;
      render();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (menuOpen && !(event.target instanceof Element && event.target.closest('.video-menu, .video-menu-btn'))) {
      menuOpen = false;
      render();
    }
  });

  /** Drag the bottom-left corner to resize one tile (4:3). The panel hugs the right edge, so dragging left grows it. */
  const resizeHandle = (id: string, el: HTMLElement): HTMLElement => {
    const handle = h('div', { class: 'video-resize', attrs: { title: 'Drag to resize' } }, h('span'));
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      dragging = true;
      const startX = event.clientX;
      const startY = event.clientY;
      const startW = el.getBoundingClientRect().width;
      const move = (e: PointerEvent): void => {
        const dx = startX - e.clientX;
        const dy = ((e.clientY - startY) * 4) / 3;
        const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
        const width = Math.round(Math.min(MAX_WIDTH, window.innerWidth - 20, Math.max(MIN_WIDTH, startW + delta)));
        widths.set(id, width);
        el.style.setProperty('--w', `${width}px`);
      };
      const end = (): void => {
        dragging = false;
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        if (dirty) {
          dirty = false;
          render();
        }
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
    return handle;
  };

  const tile = (name: string, stream: MediaStream | null, self: boolean, off: boolean): HTMLElement => {
    const video = h('video', { class: `video-feed${self ? ' video-self' : ''}`, attrs: { autoplay: true, playsinline: true } });
    video.muted = true; // video links carry no sound; the voice call does
    if (stream) video.srcObject = stream;
    void video.play().catch(() => undefined);
    return h(
      'div',
      { class: `video-tile${off ? ' video-off' : ''}` },
      video,
      h('span', { class: 'video-name' }, self ? `${name} (you)` : name),
    );
  };

  const menuItem = (label: string, action: () => void): HTMLButtonElement =>
    button(label, 'video-menu-item', () => {
      menuOpen = false;
      action();
      render();
    });

  const render = (): void => {
    if (dragging) {
      dirty = true;
      return;
    }
    const net = getNet();
    const video = net?.video;
    const online = net?.status === 'online';
    if (!net || !video || !video.supported || !online) {
      dock.hidden = true;
      overlay.hidden = true;
      expanded = false;
      return;
    }
    dock.hidden = false;
    if (video.state !== 'on') {
      expanded = false;
      menuOpen = false;
      overlay.hidden = true;
    }

    if (video.state === 'off') {
      setChildren(
        dock,
        button('Start camera', 'btn btn-small', () => void video.join(), { title: 'Share your camera with everyone in this room' }),
      );
      return;
    }
    if (video.state === 'joining') {
      setChildren(dock, button('Starting camera…', 'btn btn-small', () => undefined, { disabled: true }));
      return;
    }

    const names = new Map(net.players().map((p) => [p.id, p.name]));
    const entries: { id: string; name: string; stream: MediaStream | null; self: boolean; off: boolean }[] = [
      { id: SELF, name: 'You', stream: video.localStream, self: true, off: !video.camOn },
    ];
    for (const id of video.peerIds()) {
      if (!video.isHidden(id)) entries.push({ id, name: names.get(id) ?? 'Someone', stream: video.remoteStream(id), self: false, off: false });
    }

    const menuButton = button(
      minimized ? `Video (${entries.length}) ▼` : '▼',
      `btn btn-small video-menu-btn${minimized ? ' video-menu-pill' : ''}`,
      () => {
        menuOpen = !menuOpen;
        render();
      },
      { title: 'Video options', 'aria-haspopup': 'menu', 'aria-expanded': String(menuOpen) },
    );
    const menu = h(
      'div',
      { class: 'video-menu', attrs: { role: 'menu' } },
      menuItem('Maximize', () => {
        expanded = true;
      }),
      menuItem(minimized ? 'Show video' : 'Minimize', () => {
        minimized = !minimized;
      }),
      menuItem(video.camOn ? 'Pause camera' : 'Resume camera', () => video.toggleCam()),
      menuItem('Reset sizes', () => widths.clear()),
      menuItem('Stop video', () => video.leave()),
    );
    menu.hidden = !menuOpen;

    const defaultW = defaultWidth(entries.length);
    const tiles = entries.map((e) => {
      const el = tile(e.name, e.stream, e.self, e.off);
      el.style.setProperty('--w', `${widths.get(e.id) ?? defaultW}px`);
      el.addEventListener('click', () => setExpanded(true));
      el.append(resizeHandle(e.id, el));
      return el;
    });
    const flow = h('div', { class: 'video-flow' }, ...tiles);
    flow.hidden = minimized;
    setChildren(dock, flow, menuButton, menu);

    overlay.hidden = !expanded;
    if (expanded) {
      const big = entries.map((e) => tile(e.name, e.stream, e.self, e.off));
      bigGrid.dataset.count = String(Math.min(big.length, 9));
      setChildren(bigGrid, ...big);
    } else {
      setChildren(bigGrid);
    }
  };

  watchNet(() => {
    const net = getNet();
    if (net && net !== subscribed) {
      subscribed = net;
      net.video.changed.subscribe(render);
    }
    render();
  });
  return h('div', { class: 'video-root' }, dock, overlay);
}
