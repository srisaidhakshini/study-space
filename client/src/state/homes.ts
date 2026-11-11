import type {
  HomeEditOp,
  HomeInfoMessage,
  HomeResultMessage,
  InventoryMessage,
  StreetInfoMessage,
} from '@study/shared';
import { Emitter } from './emitter';

/** What the owner is doing with the mouse in edit mode. */
export type EditTool =
  /** Placing a new copy of an owned item; `rotation` is the quarter turns. */
  | { kind: 'place'; itemId: string; rotation: number }
  /** An item already in the room is selected (by index in `info.items`). */
  | { kind: 'select'; index: number }
  | null;

/** How the store talks to the server. Set by the networking layer. */
export interface HomeSender {
  enter(ownerId: string): void;
  edit(version: number, op: HomeEditOp): void;
  buy(itemId: string, quantity: number): void;
}

/**
 * The home you are in, your furniture inventory, the street you are on, and
 * the edit-mode state shared by the interface panels and the game scene.
 * Plain state plus change notifications; no rendering and no networking here.
 */
export class HomeStore {
  /** Fires on any change to the data or to edit mode. */
  readonly changed = new Emitter();
  /** Fires once for every homeResult from the server (toast the failures). */
  readonly results = new Emitter<HomeResultMessage>();

  /** The home you are standing in, or null when you are elsewhere. */
  info: HomeInfoMessage | null = null;
  /** Your furniture and coins (account players). */
  inventory: InventoryMessage | null = null;
  /** The street page you are on, or null elsewhere. */
  street: StreetInfoMessage | null = null;
  /** Owner-only edit mode: the game scene shows the grid and handles the pointer. */
  editing = false;
  tool: EditTool = null;
  /** Set by the networking layer when a connection exists. */
  sender: HomeSender | null = null;
  /** The last purchase asked for, so the interface can say what "Bought" refers to. */
  lastBuy: { itemId: string; quantity: number } | null = null;

  setInfo(info: HomeInfoMessage | null): void {
    this.info = info;
    if (!info?.mine) this.editing = false;
    if (this.tool?.kind === 'select' && (!info || this.tool.index >= info.items.length)) this.tool = null;
    this.changed.emit();
  }

  setInventory(inventory: InventoryMessage | null): void {
    this.inventory = inventory;
    this.changed.emit();
  }

  setStreet(street: StreetInfoMessage | null): void {
    this.street = street;
    this.changed.emit();
  }

  setEditing(editing: boolean): void {
    const allowed = editing && this.info?.mine === true;
    if (this.editing === allowed && (allowed || this.tool === null)) return;
    this.editing = allowed;
    if (!allowed) this.tool = null;
    this.changed.emit();
  }

  setTool(tool: EditTool): void {
    this.tool = tool;
    this.changed.emit();
  }

  /** Forgets everything tied to a connection (on leaving a server). */
  reset(): void {
    this.info = null;
    this.inventory = null;
    this.street = null;
    this.editing = false;
    this.tool = null;
    this.changed.emit();
  }

  /** Sends an edit against the layout version you are looking at. Returns false if it cannot be sent. */
  edit(op: HomeEditOp): boolean {
    if (!this.sender || !this.info?.mine) return false;
    this.sender.edit(this.info.version, op);
    return true;
  }

  buy(itemId: string, quantity = 1): boolean {
    if (!this.sender) return false;
    this.lastBuy = { itemId, quantity };
    this.sender.buy(itemId, quantity);
    return true;
  }

  /** Travels to a home by its owner's account id (your own id goes home). */
  visit(ownerId: string): boolean {
    if (!this.sender) return false;
    this.sender.enter(ownerId);
    return true;
  }
}
