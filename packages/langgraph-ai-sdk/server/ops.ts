import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { threads as threadsTable } from './db/schema.js';

export async function ensureThread(threadId: string) {
  const existing = await db.select().from(threadsTable).where(eq(threadsTable.threadId, threadId)).limit(1);
  
  if (existing.length === 0) {
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
