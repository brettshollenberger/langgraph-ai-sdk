import { eq } from 'drizzle-orm';
import { getDb } from './config.ts';
import { threads as threadsTable } from '../db/schema.ts';

/**
 * Ensure a thread exists in the database
 * Creates a new thread if it doesn't already exist
 */
export async function ensureThread(threadId: string) {
  const db = getDb();
  const existing = await db.select().from(threadsTable).where(eq(threadsTable.threadId, threadId)).limit(1);

  if (existing.length === 0) {
    console.log(`inserting thread ${threadId}`);
    await db.insert(threadsTable).values({
      threadId,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
      status: 'idle',
      config: {},
      values: null,
      interrupts: {},
    });
  }

  return threadId;
}
