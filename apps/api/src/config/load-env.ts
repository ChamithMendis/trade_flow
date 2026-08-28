import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * The repo keeps a single .env at the workspace root. Every API entrypoint
 * (nest start, node dist/main, jest) runs with `apps/api` as the working
 * directory, so the root file is two levels up.
 *
 * Import this module for its side effect *before* anything that reads
 * `process.env` (e.g. PrismaService).
 */
loadEnv({ path: resolve(process.cwd(), '../../.env') });
