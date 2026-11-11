import { SUBJECTS, TIMER_LIMITS, TIMER_PRESETS, type TimerConfig } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { button, h } from './dom';
import { openModal } from './modal';
import { subjectIcon } from './subjectIcon';

/** 'custom', 'stopwatch', or the id of a preset. */
type Choice = string;

function numberField(id: string, label: string, value: number, limits: { min: number; max: number }): HTMLInputElement {
  const input = h('input', {
    class: 'input input-number',
    attrs: { type: 'number', id, min: limits.min, max: limits.max, step: 1, inputmode: 'numeric', 'aria-label': label },
  });
  input.value = String(value);
  return input;
}

/** Modal for choosing lengths, mode and subject, then starting a session. */
export function openTimerPanel(root: HTMLElement): void {
  const saved = app.timer.config;
  const preset = TIMER_PRESETS.find((p) => p.focusMin === saved.focusMin && p.breakMin === saved.breakMin);
  let choice: Choice = saved.mode === 'stopwatch' ? 'stopwatch' : (preset?.id ?? 'custom');
  let subject = saved.subject;

  const focusInput = numberField('timer-focus', 'Focus minutes', saved.focusMin, TIMER_LIMITS.focusMin);
  const breakInput = numberField('timer-break', 'Break minutes', saved.breakMin, TIMER_LIMITS.breakMin);
  const customRow = h(
    'div',
    { class: 'row wrap custom-row' },
    h('label', { class: 'inline-label', attrs: { for: 'timer-focus' } }, 'Focus', focusInput, 'min'),
    h('label', { class: 'inline-label', attrs: { for: 'timer-break' } }, 'Break', breakInput, 'min'),
  );

  const repeat = h('input', { attrs: { type: 'checkbox', id: 'timer-repeat' } });
  repeat.checked = saved.autoRepeat;
  const repeatLabel = h('label', { class: 'check', attrs: { for: 'timer-repeat' } }, repeat, 'Repeat cycles automatically');

  const choices: { id: Choice; label: string; note: string }[] = [
    ...TIMER_PRESETS.map((p) => ({ id: p.id, label: p.label, note: 'Pomodoro' })),
    { id: 'custom', label: 'Custom', note: 'Your lengths' },
    { id: 'stopwatch', label: 'Stopwatch', note: 'Open-ended' },
  ];
  const choiceButtons = choices.map((c) => ({
    id: c.id,
    el: button(h('span', {}, h('strong', {}, c.label), h('small', {}, c.note)), 'btn btn-choice', () => {
      choice = c.id;
      update();
    }),
  }));
  const subjectButtons = SUBJECTS.map((s) => ({
    id: s.id,
    el: button(h('span', { class: 'subject' }, subjectIcon(s), s.label), 'btn btn-small', () => {
      subject = s.id;
      update();
    }),
  }));

  const update = (): void => {
    for (const b of choiceButtons) {
      b.el.classList.toggle('active', b.id === choice);
      b.el.setAttribute('aria-pressed', String(b.id === choice));
    }
    for (const b of subjectButtons) {
      b.el.classList.toggle('active', b.id === subject);
      b.el.setAttribute('aria-pressed', String(b.id === subject));
    }
    customRow.hidden = choice !== 'custom';
    const stopwatch = choice === 'stopwatch';
    repeat.disabled = stopwatch;
    repeatLabel.classList.toggle('disabled', stopwatch);
  };

  const buildConfig = (): TimerConfig => {
    const chosen = TIMER_PRESETS.find((p) => p.id === choice);
    return {
      mode: choice === 'stopwatch' ? 'stopwatch' : 'pomodoro',
      focusMin: chosen?.focusMin ?? (Number(focusInput.value) || saved.focusMin),
      breakMin: chosen?.breakMin ?? (breakInput.value === '' ? saved.breakMin : Number(breakInput.value)),
      autoRepeat: choice !== 'stopwatch' && repeat.checked,
      subject,
    };
  };

  const close = (): void => modal.close();
  const start = (): void => {
    const started = app.timer.start(buildConfig());
    close();
    if (!started) bus.emit('toast', { text: 'Sit down first to start a timer.' });
  };

  const panel = h(
    'div',
    { class: 'panel timer-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'timer-title' } },
    h('h1', { class: 'panel-title', attrs: { id: 'timer-title' } }, 'Start a study session'),
    h('div', { class: 'choice-grid' }, ...choiceButtons.map((b) => b.el)),
    customRow,
    repeatLabel,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Subject'), h('div', { class: 'row wrap' }, ...subjectButtons.map((b) => b.el))),
    h('div', { class: 'panel-actions' }, button('Cancel', 'btn', close), button('Start', 'btn btn-primary', start)),
  );

  const modal = openModal(root, panel, close);
  update();
}
