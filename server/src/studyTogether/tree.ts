import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** One counter for every world instance on this host, including guest sessions. */
export class SharedTree {
  private total = 0;

  constructor(private readonly path: string) {
    try {
      const stored: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (typeof stored !== 'number' || !Number.isSafeInteger(stored) || stored < 0) {
        throw new Error('Invalid shared tree counter');
      }
      this.total = stored;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  get minutes(): number {
    return this.total;
  }

  add(minutes: number): boolean {
    if (!Number.isSafeInteger(minutes) || minutes < 1) return false;
    const total = this.total + minutes;
    if (!Number.isSafeInteger(total)) return false;
    const temporary = this.path + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify(total), { mode: 0o600 });
      renameSync(temporary, this.path);
    } catch (error) {
      console.error('[shared tree] Could not save focus minutes', error);
      return false;
    }
    this.total = total;
    return true;
  }
}

let tree: SharedTree | undefined;

export function sharedTree(): SharedTree {
  return tree ??= new SharedTree(resolve(process.env.STUDY_TREE_FILE ?? '.study-tree.json'));
}
