import { app } from '../app';
import type { NetApi } from '../net/types';

/** The networking client, or null while it has not been installed yet. */
export function getNet(): NetApi | null {
  return (app.net as NetApi | null) ?? null;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Calls `render` now and whenever the networking state changes. Safe to call
 * before `app.net` exists: it subscribes as soon as the client appears.
 */
export function watchNet(render: () => void): void {
  const attach = (): boolean => {
    const net = getNet();
    if (!net) return false;
    net.changed.subscribe(render);
    render();
    return true;
  };
  if (attach()) return;
  render();
  const id = window.setInterval(() => {
    if (attach()) window.clearInterval(id);
  }, 200);
}

/** Copies text to the clipboard, falling back to a hidden textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
