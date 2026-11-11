/** Minimal change notifier used by the stores. */
export class Emitter<T = void> {
  private readonly listeners = new Set<(value: T) => void>();

  /** Subscribes and returns a function that unsubscribes. */
  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }
}

/** Reads JSON from localStorage; storage can be blocked, so never throw. */
export function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: the session simply is not remembered.
  }
}
