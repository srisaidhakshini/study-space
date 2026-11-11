import { getFurniture, getSurface } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { homeFailureText } from './homeText';

/** Tells the player how their purchases and room edits went. Call once when the interface is built. */
export function watchHomeResults(): void {
  app.homes.results.subscribe((result) => {
    if (!result.ok) {
      bus.emit('toast', { text: homeFailureText(result.reason) });
      return;
    }
    // Moving, placing and removing need no message: the room itself changes.
    if (result.op === 'upgrade') {
      bus.emit('toast', { text: 'Room upgraded!' });
    } else if (result.op === 'buy') {
      const last = app.homes.lastBuy;
      const name = last ? (getFurniture(last.itemId)?.name ?? getSurface(last.itemId)?.name) : undefined;
      const times = last && last.quantity > 1 ? `${last.quantity} × ` : '';
      bus.emit('toast', { text: name ? `Bought ${times}${name}.` : 'Bought!' });
    }
  });
}
