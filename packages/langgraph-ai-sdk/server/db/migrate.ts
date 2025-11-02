import { pool } from './index.js';

const SCHEMA_TABLES = {
  threads: 'threads'
};

async function migrate() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_TABLES.threads} (
        thread_id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY CONSTRAINT unique_thread_id UNIQUE,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
        status text DEFAULT 'idle'::text NOT NULL,
        config jsonb DEFAULT '{}'::jsonb NOT NULL,
        "values" jsonb,
        interrupts jsonb DEFAULT '{}'::jsonb
      );
    `);
    
    console.log('Threads table created successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => {
    console.log('Migration complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
