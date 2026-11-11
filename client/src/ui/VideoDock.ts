import { app } from '../app';
import { button, h, setChildren } from './dom';
import { getNet, watchNet } from './netAccess';

/**
 * Camera panel for people sitting at a study desk. It offers "Start camera"
 * while you are seated, shows a tile for everyone else on camera in the same
 * place, and shuts itself when you stand up.
 */
export function createVideoDock(): HTMLElement {
  const dock = h('div', { class: 'video-dock' });
  dock.hidden = true;
  let subscribed: ReturnType<typeof getNet> = null;

  const tile = (name: string, stream: MediaStream | null, self: boolean, off = false): HTMLElement => {
    const video = h('video', { class: `video-feed${self ? ' video-self' : ''}`, attrs: { autoplay: true, playsinline: true, muted: self } });
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
    const seated = app.timer.seated;
    const online = net?.status === 'online';
    if (!net || !video || !video.supported || !online) {
      dock.hidden = true;
      return;
    }
    if (!seated && video.state !== 'off') {
      video.leave(); // stood up: the server removes you too
      return;
    }
    dock.hidden = !seated;
    if (!seated) return;

    if (video.state === 'off') {
      setChildren(
        dock,
        button('Start camera', 'btn btn-small', () => void video.join(), { title: 'Share your camera with others seated at study desks here' }),
      );
      return;
    }
    if (video.state === 'joining') {
      setChildren(dock, button('Starting camera…', 'btn btn-small', () => undefined, { disabled: true }));
      return;
    }
    const names = new Map(net.players().map((p) => [p.id, p.name]));
    const tiles: HTMLElement[] = [tile('You', video.localStream, true, !video.camOn)];
    for (const id of video.peerIds()) {
      if (video.isHidden(id)) continue;
      tiles.push(tile(names.get(id) ?? 'Someone', video.remoteStream(id), false));
    }
    const controls = h(
      'div',
      { class: 'video-controls' },
      button(video.camOn ? 'Pause camera' : 'Resume camera', 'btn btn-small', () => video.toggleCam(), { 'aria-pressed': String(video.camOn) }),
      button('Stop video', 'btn btn-small', () => video.leave(), { title: 'Stop sharing and close video' }),
    );
    setChildren(dock, h('div', { class: 'video-grid' }, ...tiles), controls);
  };

  watchNet(() => {
    const net = getNet();
    if (net && net !== subscribed) {
      subscribed = net;
      net.video.changed.subscribe(render);
    }
    render();
  });
  app.timer.changed.subscribe(render);
  return dock;
}
