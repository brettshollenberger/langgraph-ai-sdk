import { pgTable, uuid, timestamp, jsonb, text } from 'drizzle-orm/pg-core';

export const threads = pgTable('threads', {
  threadId: uuid('thread_id').primaryKey().defaultRandom().unique('unique_thread_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  metadata: jsonb('metadata').notNull().default({}),
  status: text('status').notNull().default('idle'),
  config: jsonb('config').notNull().default({}),
  values: jsonb('values'),
  interrupts: jsonb('interrupts').default({}),
});

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
