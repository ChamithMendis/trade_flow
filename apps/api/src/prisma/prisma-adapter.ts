import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7's `prisma-client` generator requires a driver adapter (the connection
 * URL is no longer read from the schema). This builds the Postgres adapter from
 * DATABASE_URL for both the Nest app and the seed script.
 */
export function createPrismaAdapter(): PrismaPg {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set — copy .env.example to .env at the repo root.',
    );
  }
  return new PrismaPg({ connectionString });
}
