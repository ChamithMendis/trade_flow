import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolve } from 'node:path';

// The repo keeps a single .env at the workspace root.
loadEnv({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // The production image ships only `dist`, so the seed has to run from the
    // compiled output there. In development tsx runs the source directly.
    seed:
      process.env.NODE_ENV === 'production'
        ? 'node dist/prisma/seed.js'
        : 'tsx src/prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
