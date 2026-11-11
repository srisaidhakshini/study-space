import { app } from '../app';
import type { Settings } from '../state/settings';
import { button, h } from './dom';
import { openModal } from './modal';

type VolumeKey = 'master' | 'music' | 'ambience';
type ToggleKey = 'muted' | 'rain' | 'dayNight';

const VOLUMES: { key: VolumeKey; label: string; note: string }[] = [
  { key: 'master', label: 'Master volume', note: 'Everything' },
  { key: 'music', label: 'Music', note: 'Lo-fi background music' },
  { key: 'ambience', label: 'Ambience', note: 'Birds, water, room tone, rain' },
];

const TOGGLES: { key: ToggleKey; label: string; note: string }[] = [
  { key: 'muted', label: 'Mute all sound', note: 'Keeps your volumes. Press M to toggle.' },
  { key: 'rain', label: 'Rain and rain sounds', note: 'Turn off to keep every sky dry' },
  { key: 'dayNight', label: 'Day and night', note: 'Evening tint and glowing lamps' },
];

interface Row {
  el: HTMLElement;
  sync(settings: Settings): void;
}

function volumeRow(key: VolumeKey, label: string, note: string): Row {
  const id = `setting-${key}`;
  const output = h('output', { class: 'slider-value', attrs: { for: id } });
  const input = h('input', {
    class: 'slider',
    attrs: { type: 'range', id, min: 0, max: 100, step: 1, 'aria-label': label },
  });
  input.addEventListener('input', () => app.settings.update({ [key]: Number(input.value) / 100 }));
  const el = h(
    'div',
    { class: 'setting-row' },
    h('label', { class: 'setting-label', attrs: { for: id } }, h('strong', {}, label), h('small', {}, note)),
    h('div', { class: 'slider-line' }, input, output),
  );
  return {
    el,
    sync(settings): void {
      const percent = Math.round(settings[key] * 100);
      if (document.activeElement !== input) input.value = String(percent);
      output.textContent = String(percent);
      input.style.setProperty('--fill', `${percent}%`);
    },
  };
}

function toggleRow(key: ToggleKey, label: string, note: string): Row {
  const id = `setting-${key}`;
  const state = h('span', { class: 'switch-state' });
  const control = h('button', { class: 'switch', attrs: { type: 'button', id, role: 'switch', 'aria-checked': 'false' } }, h('span', { class: 'switch-knob' }), state);
  control.addEventListener('click', () => {
    if (control.dataset.pointer === '1') control.blur();
    app.settings.update({ [key]: !app.settings.get()[key] });
  });
  control.addEventListener('pointerdown', () => {
    control.dataset.pointer = '1';
  });
  const el = h(
    'div',
    { class: 'setting-row setting-toggle' },
    h('label', { class: 'setting-label', attrs: { for: id } }, h('strong', {}, label), h('small', {}, note)),
    control,
  );
  return {
    el,
    sync(settings): void {
      const on = settings[key];
      control.setAttribute('aria-checked', String(on));
      control.classList.toggle('on', on);
      state.textContent = on ? 'On' : 'Off';
    },
  };
}

let isOpen = false;

/** Modal with sliders and switches; every change applies immediately and is saved. */
export function openSettingsPanel(root: HTMLElement): void {
  if (isOpen) return;
  isOpen = true;
  const rows: Row[] = [
    ...VOLUMES.map((v) => volumeRow(v.key, v.label, v.note)),
    ...TOGGLES.map((t) => toggleRow(t.key, t.label, t.note)),
  ];
  const syncAll = (): void => {
    const settings = app.settings.get();
    for (const row of rows) row.sync(settings);
  };
  const unsubscribe = app.settings.changed.subscribe(syncAll);

  const close = (): void => {
    isOpen = false;
    unsubscribe();
    modal.close();
  };

  const panel = h(
    'div',
    { class: 'panel settings-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'settings-title' } },
    h('h1', { class: 'panel-title', attrs: { id: 'settings-title' } }, 'Settings'),
    ...rows.map((row) => row.el),
    h(
      'div',
      { class: 'panel-actions' },
      button('Reset to defaults', 'btn', () => app.settings.reset()),
      button('Done', 'btn btn-primary', close),
    ),
  );
  const modal = openModal(root, panel, close);
  syncAll();
}
