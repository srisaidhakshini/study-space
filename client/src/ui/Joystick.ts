import { bus } from '../bus';
import { h } from './dom';

/** Current stick deflection, each axis in -1..1. Read every frame by the world scene. */
export const joystick = { x: 0, y: 0 };

const RADIUS = 46; // px the knob may travel from the centre
const DEAD_ZONE = 0.22;

/** True on phones and tablets, where there is no keyboard to walk with. */
export function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** A thumb joystick for touch screens. Hidden elsewhere and while a menu is open. */
export function createJoystick(): HTMLElement {
  const knob = h('div', { class: 'joystick-knob' });
  const base = h('div', { class: 'joystick', attrs: { 'aria-label': 'Move joystick', role: 'application' } }, knob);
  base.hidden = !isTouchDevice();
  let pointerId: number | null = null;

  const reset = (): void => {
    pointerId = null;
    joystick.x = 0;
    joystick.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  };

  const move = (event: PointerEvent): void => {
    const rect = base.getBoundingClientRect();
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > RADIUS) {
      dx = (dx / length) * RADIUS;
      dy = (dy / length) * RADIUS;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / RADIUS;
    const ny = dy / RADIUS;
    const magnitude = Math.hypot(nx, ny);
    if (magnitude < DEAD_ZONE) {
      joystick.x = 0;
      joystick.y = 0;
    } else {
      joystick.x = nx;
      joystick.y = ny;
    }
  };

  base.addEventListener('pointerdown', (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    base.setPointerCapture(event.pointerId);
    event.preventDefault();
    move(event);
  });
  base.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId) move(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    base.addEventListener(type, (event) => {
      if (event.pointerId === pointerId) reset();
    });
  }

  // A menu opening must not leave the character walking.
  bus.on('ui:lock', ({ locked }) => {
    base.classList.toggle('locked', locked);
    if (locked) reset();
  });
  window.addEventListener('blur', reset);
  return base;
}
