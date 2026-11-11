import { SERVER_PORT } from '@study/shared';
import { createServer } from './createServer';

const port = Number(process.env.PORT ?? SERVER_PORT);

try {
  const server = createServer();
  await server.listen(port);
  console.log(`Study Space server listening on http://localhost:${port}  (ws://localhost:${port})`);
  console.log(`  GET  /api/servers   POST /api/join   GET /health`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
