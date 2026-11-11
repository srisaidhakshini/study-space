import { button, h, setChildren } from './dom';
import { getNet, watchNet } from './netAccess';

/**
 * Camera panel, open to everyone in the room like voice. It offers "Start
 * camera", then shows a tile for everyone else on camera. Clicking a tile (or "Expand")
 * opens every tile together in a full-screen view.
 */
export function createVideoDock(): HTMLElement {
  const dock = h('div', { class: 'video-dock' });
  dock.hidden = true;
  let subscribed: ReturnType<typeof getNet> = null;

  // Full-screen view of all tiles. It sits outside the dock so it survives the dock re-rendering.
  let expanded = false;
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
    render();
  };
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && expanded) setExpanded(false);
  });

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

  const render = (): void => {
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
    const build = (): HTMLElement[] => {
      const tiles: HTMLElement[] = [tile('You', video.localStream, true, !video.camOn)];
      for (const id of video.peerIds()) {
        if (video.isHidden(id)) continue;
        tiles.push(tile(names.get(id) ?? 'Someone', video.remoteStream(id), false, false));
      }
      return tiles;
    };

    const small = build();
    for (const el of small) el.addEventListener('click', () => setExpanded(true));
    // The tile size and column count follow how many people are on camera (see .video-dock[data-count]).
    dock.dataset.count = String(Math.min(small.length, 8));
    const controls = h(
      'div',
      { class: 'video-controls' },
      button('Expand', 'btn btn-small', () => setExpanded(true), { title: 'Show everyone full screen' }),
      button(video.camOn ? 'Pause camera' : 'Resume camera', 'btn btn-small', () => video.toggleCam(), { 'aria-pressed': String(video.camOn) }),
      button('Stop video', 'btn btn-small', () => video.leave(), { title: 'Stop sharing and close video' }),
    );
    setChildren(dock, h('div', { class: 'video-grid' }, ...small), controls);

    overlay.hidden = !expanded;
    if (expanded) {
      const big = build();
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
