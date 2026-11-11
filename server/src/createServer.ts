import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_PLAYERS_PER_ROOM, ROOM_NAME, SIGNAL_MAX_PAYLOAD, type ApiError } from '@study/shared';
import { registerAccountRoutes } from './api/accountRoutes';
import { registerRoutes } from './api/routes';
import { assertAuthConfig, isProductionEnv, serverConfig } from './config';
import { closeDb } from './db/client';
import { WorldRoom } from './rooms/WorldRoom';
import { getWorld } from './world/maps';

export interface ServerSettings {
  /** Players per instance. Only tests change this. */
  maxPlayers?: number;
  /**
   * A replacement clock (epoch ms) so tests can finish a 25-minute session
   * instantly. Refused when NODE_ENV is "production".
   */
  testClock?: () => number;
}

export interface GameServer {
  /** Starts listening and resolves once the port is open. */
  listen(port: number): Promise<void>;
  shutdown(): Promise<void>;
}

/** Builds the HTTP API and the Colyseus game server (not yet listening). */
export function createServer(settings: ServerSettings = {}): GameServer {
  serverConfig.maxPlayers = settings.maxPlayers ?? MAX_PLAYERS_PER_ROOM;
  if (settings.testClock && isProductionEnv()) throw new Error('A test clock cannot be used in production.');
  serverConfig.now = settings.testClock ?? ((): number => Date.now());
  assertAuthConfig();
  getWorld(); // fail fast, with a readable message, if the assets are missing

  const server = new Server({
    transport: new WebSocketTransport({ maxPayload: SIGNAL_MAX_PAYLOAD }),
    gracefullyShutdown: false,
    greet: false,
    express: (app) => {
      app.use(cors());
      // Importing a guest device's history is the one request with a large body.
      app.use('/api/sessions/import', express.json({ limit: '256kb' }));
      app.use(express.json({ limit: '4kb' }));
      registerRoutes(app);
      registerAccountRoutes(app);
      // Serve the built game and its websocket/API from one public origin.
      const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
      if (existsSync(resolve(clientDir, 'index.html'))) {
        app.use(express.static(clientDir));
      }
      // Malformed JSON bodies get a JSON error like every other failure.
      app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        const body: ApiError = { error: 'Invalid request' };
        res.status(400).json(body);
      });
    },
  });
  server.define(ROOM_NAME, WorldRoom);

  return {
    async listen(port) {
      await server.listen(port);
    },
    async shutdown() {
      await server.gracefullyShutdown(false);
      await closeDb();
    },
  };
}
