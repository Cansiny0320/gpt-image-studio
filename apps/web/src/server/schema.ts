import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Settings } from '../lib/contract';

export const requests = sqliteTable('requests', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  status: text('status').notNull(),
  prompt: text('prompt'),
  settings: text('settings', { mode: 'json' }).$type<Omit<Settings, 'prompt'>>(),
});
export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  requestId: text('request_id')
    .notNull()
    .references(() => requests.id),
  objectKey: text('object_key').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
});
