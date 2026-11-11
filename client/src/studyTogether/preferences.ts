import { Emitter, loadJson, saveJson } from '../state/emitter';

const KEY = 'study-space/focus-ghost';
let enabled = loadJson<boolean>(KEY) === true;

export function focusGhostEnabled(): boolean {
  return enabled;
}

export function setFocusGhost(enabledNext: boolean): void {
  enabled = enabledNext;
  saveJson(KEY, enabled);
}

export const studyDeskStatus = new Emitter<string>();
