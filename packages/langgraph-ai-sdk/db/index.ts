import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.ts';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost/langgraph_backend_test';

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
export { pool };