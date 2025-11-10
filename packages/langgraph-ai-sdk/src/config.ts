import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from '../db/schema.ts';

type DrizzleDb = NodePgDatabase<typeof schema>;

interface LanggraphConfig {
  db: DrizzleDb | null;
  pool: Pool | null;
}

const config: LanggraphConfig = {
  db: null,
  pool: null,
};

/**
 * Initialize the library with your database connection
 * This should be called once at app startup before using any API functions
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg';
 * import { initializeLanggraph } from 'langgraph-ai-sdk';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * initializeLanggraph({ pool });
 * ```
 */
export function initializeLanggraph({ pool }: { pool: Pool }): void {
  config.pool = pool;
  config.db = drizzle(pool, { schema });
}

/**
 * Get the configured database instance
 * Throws an error if the library hasn't been initialized
 */
export function getDb(): DrizzleDb {
  if (!config.db) {
    throw new Error(
      'Database not initialized. Call initializeLanggraph({ pool }) before using any API functions.'
    );
  }
  return config.db;
}

/**
 * Get the configured pool instance
 * Throws an error if the library hasn't been initialized
 */
export function getPool(): Pool {
  if (!config.pool) {
    throw new Error(
      'Database not initialized. Call initializeLanggraph({ pool }) before using any API functions.'
    );
  }
  return config.pool;
}

/**
 * Check if the library has been initialized
 */
export function isInitialized(): boolean {
  return config.db !== null && config.pool !== null;
}
