export interface RateLimiter {
  /** Counts an attempt. False means the limit is already used up. */
  hit(key: string): boolean;
  /** Forgets a key (after a successful login). */
  reset(key: string): void;
  /** Forgets everything (tests). */
  clear(): void;
}

/** A fixed-window counter held in memory: `limit` attempts per `windowMs` per key. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = now();

  return {
    hit(key) {
      const t = now();
      if (t - lastSweep > windowMs) {
        lastSweep = t;
        for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
      }
      let w = windows.get(key);
      if (!w || w.resetAt <= t) {
        w = { count: 0, resetAt: t + windowMs };
        windows.set(key, w);
      }
      if (w.count >= limit) return false;
      w.count += 1;
      return true;
    },
    reset(key) {
      windows.delete(key);
    },
    clear() {
      windows.clear();
    },
  };
}
