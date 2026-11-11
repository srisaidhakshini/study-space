import { bus } from '../bus';
import { h } from './dom';

export interface ModalHandle {
  close(): void;
}

interface OpenModal {
  backdrop: HTMLElement;
  /** Called when Escape is pressed; null means Escape does nothing. */
  onEscape: (() => void) | null;
}

const stack: OpenModal[] = [];
let listening = false;

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (!top?.onEscape) return;
  event.preventDefault();
  top.onEscape();
}

/**
 * Shows a panel over the game on a dimmed backdrop and locks game input while
 * any modal is open. `onEscape` usually closes it; pass null to require a choice.
 */
export function openModal(root: HTMLElement, panel: HTMLElement, onEscape: (() => void) | null): ModalHandle {
  const backdrop = h('div', { class: 'backdrop' }, panel);
  const entry: OpenModal = { backdrop, onEscape };
  root.appendChild(backdrop);
  stack.push(entry);
  if (stack.length === 1) bus.emit('ui:lock', { locked: true });
  if (!listening) {
    window.addEventListener('keydown', onKeyDown);
    listening = true;
  }

  return {
    close(): void {
      const index = stack.indexOf(entry);
      if (index === -1) return;
      stack.splice(index, 1);
      backdrop.remove();
      if (stack.length === 0) bus.emit('ui:lock', { locked: false });
    },
  };
}
