import type { AssetManifest } from '@study/shared';
import { app } from './app';
import { bus } from './bus';
import { loadFonts } from './fonts';
import { createGame } from './game';
import { mountUi } from './ui';
import './ui/styles.css';

async function main(): Promise<void> {
  const response = await fetch('assets/assets.json');
  if (!response.ok) throw new Error('assets/assets.json is missing. Run "npm run assets" first.');
  app.manifest = (await response.json()) as AssetManifest;
  app.profile.load(app.manifest);

  // Canvas text needs the font loaded before the first label is drawn.
  await loadFonts();

  const ui = mountUi(document.getElementById('ui')!);
  const game = createGame(document.getElementById('game')!);
  const enterWorld = (): void => game.startWorld();

  bus.on('boot:ready', () => {
    // The first screen has no world behind it, so it cannot be dismissed:
    // the player picks a server or plays solo.
    const chooseServer = (): void => ui.openServerList(enterWorld, { closable: false });
    if (app.profile.get()) {
      chooseServer();
      return;
    }
    // First visit: make a character, then pick a server.
    ui.openCreator(chooseServer);
  });

  // A dropped connection leaves the player solo; offer a way back online.
  bus.on('net:lost', ({ message }) => ui.openServerList(enterWorld, { message, closable: true }));
}

main().catch((error: unknown) => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">${message.replace(/</g, '&lt;')}</pre>`);
});
