import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 keeps the connection string here instead of in schema.prisma. The
// fallback lets `prisma generate` run (it never connects) before .env exists.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://study:study@localhost:5432/study_space?schema=public',
  },
});
