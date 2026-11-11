import type { PaletteOption } from '@study/shared';
import { button, h, setChildren } from './dom';

export interface Control {
  element: HTMLElement;
  /** Re-reads the current value and redraws. */
  update(): void;
}

interface Named {
  id: string;
  name: string;
}

/** A row of colour squares; the chosen one is ringed. */
export function swatchRow(
  label: string,
  options: readonly PaletteOption[],
  get: () => string,
  set: (id: string) => void,
): Control {
  const buttons = options.map((option) => {
    const el = button('', 'swatch', () => set(option.id), { title: option.name, 'aria-label': `${label}: ${option.name}` });
    el.style.background = option.ramp?.[1] ?? 'transparent';
    return { id: option.id, el };
  });
  const element = h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h('div', { class: 'swatches' }, ...buttons.map((b) => b.el)),
  );
  return {
    element,
    update(): void {
      const current = get();
      for (const b of buttons) {
        b.el.classList.toggle('selected', b.id === current);
        b.el.setAttribute('aria-pressed', String(b.id === current));
      }
    },
  };
}

/**
 * Previous / next picker showing the variant name and its position. When the
 * current value is not in the list (a hand-mixed outfit) it shows `fallback`.
 */
export function stepper(
  label: string,
  items: readonly Named[],
  get: () => string,
  set: (id: string) => void,
  fallback = 'Custom',
): Control {
  const name = h('span', { class: 'stepper-name' });
  const count = h('span', { class: 'stepper-count' });
  const step = (delta: number): void => {
    if (items.length === 0) return;
    const index = items.findIndex((item) => item.id === get());
    const next = index === -1 ? (delta > 0 ? 0 : items.length - 1) : (index + delta + items.length) % items.length;
    set(items[next]!.id);
  };
  const element = h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h(
      'div',
      { class: 'stepper' },
      button('◀', 'btn btn-icon', () => step(-1), { 'aria-label': `Previous ${label.toLowerCase()}` }),
      h('div', { class: 'stepper-value', attrs: { 'aria-live': 'polite' } }, name, count),
      button('▶', 'btn btn-icon', () => step(1), { 'aria-label': `Next ${label.toLowerCase()}` }),
    ),
  );
  return {
    element,
    update(): void {
      const index = items.findIndex((item) => item.id === get());
      setChildren(name, index === -1 ? fallback : items[index]!.name);
      setChildren(count, index === -1 ? `– / ${items.length}` : `${index + 1} / ${items.length}`);
    },
  };
}
