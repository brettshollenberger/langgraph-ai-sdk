import { checkpointer } from '../api.js';

async function setup() {
  try {
    await checkpointer.setup();
    console.log('PostgresSaver checkpointer tables created successfully');
  } catch (error) {
    console.error('Checkpointer setup failed:', error);
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
