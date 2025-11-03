import { Pool } from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

async function setup() {
  try {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(`DATABASE_URL environment variable is not set, don't know where to migrate!`);
    }

    const pool = new Pool({ connectionString });
    const checkpointer = new PostgresSaver(pool);

    await checkpointer.setup();
  } catch (error) {
    throw error;
  }
}

setup()
  .then(() => {
    console.log('Checkpointer setup complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Checkpointer setup failed:', err);
    process.exit(1);
  });
