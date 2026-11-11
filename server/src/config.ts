import { MAX_PLAYERS_PER_ROOM } from '@study/shared';

/** Mutable server settings. createServer() fills them in; tests lower the cap. */
export const serverConfig = {
  maxPlayers: MAX_PLAYERS_PER_ROOM,
};
