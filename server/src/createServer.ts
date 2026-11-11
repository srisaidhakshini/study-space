import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { MAX_PLAYERS_PER_ROOM, ROOM_NAME, SIGNAL_MAX_PAYLOAD, type ApiError } from '@study/shared';
import { registerRoutes } from './api/routes';
import { serverConfig } from './config';
import { WorldRoom } from './rooms/WorldRoom';
import { getWorld } from './world/maps';

export interface ServerSettings {
  /** Players per instance. Only tests change this. */
  maxPlayers?: number;
}

export interface GameServer {
  /** Starts listening and resolves once the port is open. */
  listen(port: number): Promise<void>;
  shutdown(): Promise<void>;
}

/** Builds the HTTP API and the Colyseus game server (not yet listening). */
export function createServer(settings: ServerSettings = {}): GameServer {
  serverConfig.maxPlayers = settings.maxPlayers ?? MAX_PLAYERS_PER_ROOM;
  getWorld(); // fail fast, with a readable message, if the assets are missing

  const server = new Server({
    transport: new WebSocketTransport({ maxPayload: SIGNAL_MAX_PAYLOAD }),
    gracefullyShutdown: false,
    greet: false,
    express: (app) => {
      app.use(cors());
      app.use(express.json({ limit: '4kb' }));
      registerRoutes(app);
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
    },
  };
}
