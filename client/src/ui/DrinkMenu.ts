import { bus } from '../bus';
import { button, h } from './dom';
import { openModal } from './modal';

interface Drink {
  name: string;
  note: string;
}

/** Cosmetic menu: ordering plays the sip animation and nothing else. */
const DRINKS: readonly Drink[] = [
  { name: 'Latte', note: 'Warm and milky' },
  { name: 'Matcha', note: 'Calm focus' },
  { name: 'Hot chocolate', note: 'Extra cosy' },
  { name: 'Iced tea', note: 'Light and cold' },
  { name: 'Orange juice', note: 'Fresh squeezed' },
  { name: 'Espresso', note: 'Strong, quick' },
];

/** Modal menu at the cafe counter. Choosing a drink makes your character sip it. */
export function openDrinkMenu(root: HTMLElement): void {
  const close = (): void => modal.close();
  const order = (drink: Drink): void => {
    close();
    bus.emit('ui:emote', { name: 'drink' });
    bus.emit('toast', { text: `One ${drink.name.toLowerCase()}, enjoy!` });
  };

  const panel = h(
    'div',
    { class: 'panel drink-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drink-title' } },
    h('h1', { class: 'panel-title', attrs: { id: 'drink-title' } }, 'What would you like?'),
    h(
      'div',
      { class: 'choice-grid' },
      ...DRINKS.map((drink) =>
        button(h('span', {}, h('strong', {}, drink.name), h('small', {}, drink.note)), 'btn btn-choice', () => order(drink)),
      ),
    ),
    h('div', { class: 'panel-actions' }, button('No thanks', 'btn', close)),
  );
  const modal = openModal(root, panel, close);
}
