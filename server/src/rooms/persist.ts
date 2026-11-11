/**
 * Database writes for account players run through one queue per user, so a
 * player's sessions are saved in the order they finished and a slow or failed
 * write never blocks the room's tick. Nothing here may throw into the room.
 */
const queues = new Map<string, Promise<void>>();

/** Runs `task` after the user's earlier tasks. The returned promise never rejects. */
export function enqueue(userId: string, task: () => Promise<void>): Promise<void> {
  const previous = queues.get(userId) ?? Promise.resolve();
  const next = previous.then(task).catch((error: unknown) => {
    console.error('[persist]', error);
  });
  queues.set(userId, next);
  void next.then(() => {
    if (queues.get(userId) === next) queues.delete(userId);
  });
  return next;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a database task, retrying once after half a second. Null when both attempts fail. */
export async function retryOnce<T>(label: string, task: () => Promise<T>): Promise<T | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await task();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[persist] ${label} failed (attempt ${attempt}/2): ${reason}`);
      if (attempt === 1) await sleep(500);
    }
  }
  return null;
}
