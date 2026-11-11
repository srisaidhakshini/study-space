import { parseMapId } from '@study/shared';
import type { HomeStore } from '../state/homes';
import type { NetClient } from './NetClient';

/**
 * Connects the networking client to the home store: server messages fill the
 * store, the store's requests go out as messages, and everything is cleared
 * when the connection ends.
 *
 * The game scene clears `info` and `street` when the player walks out of a
 * home or street; the only clearing done here is the safety net for a
 * teleport that lands somewhere else, using the runtime map id.
 */
export function bindHomes(net: NetClient, homes: HomeStore): void {
  net.homeInfos.subscribe((info) => homes.setInfo(info));
  net.inventories.subscribe((inventory) => homes.setInventory(inventory));
  net.streetInfos.subscribe((street) => homes.setStreet(street));
  net.homeResults.subscribe((result) => homes.results.emit(result));

  homes.sender = {
    enter: (ownerId) => net.sendHomeEnter(ownerId),
    edit: (version, op) => net.sendHomeEdit(version, op),
    buy: (itemId, quantity) => net.sendShopBuy(itemId, quantity),
  };

  // A teleport to a map that is not a home (or street) means we are no longer in one.
  net.teleports.subscribe(({ map }) => {
    const kind = parseMapId(map).kind;
    if (kind !== 'home' && homes.info) homes.setInfo(null);
    if (kind !== 'street' && homes.street) homes.setStreet(null);
  });

  // Leaving the server, losing the connection or signing out forgets everything.
  net.changed.subscribe(() => {
    if (!net.online && (homes.info || homes.inventory || homes.street || homes.editing)) homes.reset();
  });
}
