import {
  NAME_MAX_LENGTH,
  defaultAppearance,
  randomAppearance,
  type AnimationName,
  type Appearance,
} from '@study/shared';
import { app } from '../app';
import { randomName } from '../state/profile';
import { CreatorPreview } from './CreatorPreview';
import { button, h } from './dom';
import { openModal } from './modal';
import { stepper, swatchRow, type Control } from './pickers';

const PREVIEW_ANIMATIONS: readonly { id: AnimationName; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Walk' },
  { id: 'study', label: 'Study' },
  { id: 'wave', label: 'Wave' },
];

/**
 * Opens the character creator. New players must save; returning players can
 * cancel. `onDone` runs after a successful save.
 */
export function openCreator(root: HTMLElement, onDone?: () => void): void {
  const m = app.manifest.character;
  const existing = app.profile.get();
  const appearance: Appearance = { ...(existing?.appearance ?? defaultAppearance(m)) };
  let pet = existing?.pet ?? app.manifest.pets[0]?.id ?? '';

  const preview = new CreatorPreview();
  const controls: Control[] = [];
  const refresh = (): void => {
    preview.setAppearance(appearance);
    preview.setPet(pet);
    for (const control of controls) control.update();
  };
  const change = (patch: Partial<Appearance>): void => {
    Object.assign(appearance, patch);
    refresh();
  };

  const nameInput = h('input', {
    class: 'input',
    attrs: {
      type: 'text',
      id: 'creator-name',
      maxlength: NAME_MAX_LENGTH,
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Your name',
    },
    on: {
      // Enter should not press a button by accident; it just leaves the field.
      keydown: (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          nameInput.blur();
        }
      },
    },
  });
  nameInput.value = existing?.name ?? randomName();

  const currentOutfit = (): string =>
    m.outfits.find((o) => o.top === appearance.top && o.bottom === appearance.bottom && o.shoes === appearance.shoes)
      ?.id ?? '';
  const setOutfit = (id: string): void => {
    const outfit = m.outfits.find((o) => o.id === id);
    if (outfit) change({ top: outfit.top, bottom: outfit.bottom, shoes: outfit.shoes });
  };

  controls.push(
    swatchRow('Skin', m.skins, () => appearance.skin, (skin) => change({ skin })),
    stepper('Hair style', m.hairStyles, () => appearance.hair, (hair) => change({ hair })),
    swatchRow('Hair colour', m.hairColors, () => appearance.hairColor, (hairColor) => change({ hairColor })),
    swatchRow('Eyes', m.eyeColors, () => appearance.eyes, (eyes) => change({ eyes })),
    stepper('Outfit', m.outfits, currentOutfit, setOutfit, 'Custom mix'),
    stepper('Top', m.tops, () => appearance.top, (top) => change({ top })),
    stepper('Bottom', m.bottoms, () => appearance.bottom, (bottom) => change({ bottom })),
    stepper('Shoes', m.shoes, () => appearance.shoes, (shoes) => change({ shoes })),
    stepper('Accessory', m.accessories, () => appearance.accessory, (accessory) => change({ accessory })),
    stepper(
      'Pet',
      app.manifest.pets,
      () => pet,
      (id) => {
        pet = id;
        refresh();
      },
    ),
  );

  const animButtons = PREVIEW_ANIMATIONS.map(({ id, label }) => {
    const el = button(label, 'btn btn-small', () => {
      preview.setAnimation(id);
      markAnimation();
    });
    return { id, el };
  });
  const markAnimation = (): void => {
    for (const b of animButtons) {
      const active = b.id === preview.currentAnimation;
      b.el.classList.toggle('active', active);
      b.el.setAttribute('aria-pressed', String(active));
    }
  };

  const close = (): void => {
    preview.destroy();
    modal.close();
  };
  const save = (): void => {
    app.profile.set({ name: nameInput.value, appearance: { ...appearance }, pet });
    close();
    onDone?.();
  };

  const panel = h(
    'div',
    { class: 'panel creator', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'creator-title' } },
    h('h1', { class: 'panel-title', attrs: { id: 'creator-title' } }, existing ? 'Edit character' : 'Create your character'),
    h(
      'div',
      { class: 'creator-body' },
      h(
        'div',
        { class: 'creator-preview' },
        h('div', { class: 'preview-stage' }, preview.canvas),
        h(
          'div',
          { class: 'row' },
          button('⟲', 'btn btn-icon', () => preview.turn(-1), { 'aria-label': 'Turn left' }),
          h('span', { class: 'hint' }, 'Turn'),
          button('⟳', 'btn btn-icon', () => preview.turn(1), { 'aria-label': 'Turn right' }),
        ),
        h('div', { class: 'row wrap' }, ...animButtons.map((b) => b.el)),
      ),
      h(
        'div',
        { class: 'creator-options' },
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'field-label', attrs: { for: 'creator-name' } }, 'Name'),
          h(
            'div',
            { class: 'row' },
            nameInput,
            button('🎲', 'btn btn-icon', () => (nameInput.value = randomName()), {
              'aria-label': 'Random name',
              title: 'Random name',
            }),
          ),
        ),
        ...controls.map((c) => c.element),
      ),
    ),
    h(
      'div',
      { class: 'panel-actions' },
      button('Randomise', 'btn', () => change(randomAppearance(m))),
      existing ? button('Cancel', 'btn', close) : null,
      button(existing ? 'Save' : 'Enter the town', 'btn btn-primary', save),
    ),
  );

  const modal = openModal(root, panel, existing ? close : null);
  markAnimation();
  refresh();
}
