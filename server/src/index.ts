import { SERVER_PORT } from '@study/shared';
import { createServer } from './createServer';
import { dbStatus } from './db/client';

const port = Number(process.env.PORT ?? SERVER_PORT);

try {
  const server = createServer();
  await server.listen(port);
  console.log(`Study Space server listening on http://localhost:${port}  (ws://localhost:${port})`);
  console.log(`  GET  /api/servers   POST /api/join   GET /health`);
  console.log(`  POST /api/auth/register|login   GET /api/me /api/stats   PUT /api/profile   POST /api/sessions/import`);
  // Guests never need the database, so a missing one is a warning, not a failure.
  void dbStatus().then((status) => {
    if (status === 'up') console.log('Database: connected (accounts are on)');
    else console.warn('Database: not reachable. Guests can play, accounts are off. Start it with: docker compose up -d db');
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
