import { EventEmitter } from 'node:events';

/**
 * Tells every room instance in this process that something about homes
 * changed, so visitors in another instance's copy of the same home or street
 * stay in step. (Across separate server processes this would need a shared
 * channel such as Redis; see docs/HOMES.md.)
 */
export interface HomeEventMap {
  /** A home's visibility changed or its owner's friendships did: re-check who may be inside. */
  access: [ownerId: string];
  /** A home's layout, surfaces or tier changed: reload it and show the new room. */
  layout: [ownerId: string];
  /** A street page's houses changed (a home was created or its visibility changed). */
  street: [page: number];
  /** Two accounts became friends or stopped being friends. */
  friendship: [a: string, b: string];
  /** A request or friendship changed in either interface. */
  friendList: [a: string, b: string];
}

class HomeBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  on<K extends keyof HomeEventMap>(event: K, listener: (...args: HomeEventMap[K]) => void): () => void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return () => this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof HomeEventMap>(event: K, ...args: HomeEventMap[K]): void {
    this.emitter.emit(event, ...args);
  }
}

export const homeBus = new HomeBus();
