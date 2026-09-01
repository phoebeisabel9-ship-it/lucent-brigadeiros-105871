import { integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const trades = pgTable('trades', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  ticker: text('ticker').notNull(),
  units: integer('units').notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 4 }).notNull(),
  amountInvested: numeric('amount_invested', { precision: 14, scale: 2 }).notNull(),
  brokerage: numeric('brokerage', { precision: 14, scale: 2 }).notNull(),
  cashUsed: numeric('cash_used', { precision: 14, scale: 2 }).notNull(),
  cashRemaining: numeric('cash_remaining', { precision: 14, scale: 2 }).notNull(),
  strategicScore: numeric('strategic_score', { precision: 7, scale: 2 }).notNull(),
  tacticalScore: numeric('tactical_score', { precision: 7, scale: 2 }).notNull(),
  overallScore: numeric('overall_score', { precision: 7, scale: 2 }).notNull(),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
