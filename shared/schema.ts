import { pgTable, text, serial, integer, boolean, decimal, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const exchanges = pgTable("exchanges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(), // binance, coinbase, kraken, etc.
  apiKey: text("api_key").notNull(), // encrypted
  apiSecret: text("api_secret").notNull(), // encrypted
  encryptionIv: text("encryption_iv").notNull(), // initialization vector for decryption
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tradingBots = pgTable("trading_bots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  exchangeId: integer("exchange_id").notNull(),
  name: text("name").notNull(),
  strategy: text("strategy").notNull(), // grid, martingale, dca
  tradingPair: text("trading_pair").notNull(), // BTC/USDT, ETH/USDT, etc.
  investmentAmount: decimal("investment_amount", { precision: 20, scale: 8 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  configuration: jsonb("configuration").notNull(), // strategy-specific config
  totalPnl: decimal("total_pnl", { precision: 20, scale: 8 }).default("0").notNull(),
  totalTrades: integer("total_trades").default(0).notNull(),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull(),
  userId: integer("user_id").notNull(),
  tradingPair: text("trading_pair").notNull(),
  side: text("side").notNull(), // buy, sell
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  status: text("status").notNull(), // filled, pending, cancelled
  pnl: decimal("pnl", { precision: 20, scale: 8 }).default("0").notNull(),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

export const portfolio = pgTable("portfolio", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  asset: text("asset").notNull(), // BTC, ETH, USDT, etc.
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  averagePrice: decimal("average_price", { precision: 20, scale: 8 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  exchanges: many(exchanges),
  tradingBots: many(tradingBots),
  trades: many(trades),
  portfolio: many(portfolio),
}));

export const exchangesRelations = relations(exchanges, ({ one, many }) => ({
  user: one(users, {
    fields: [exchanges.userId],
    references: [users.id],
  }),
  tradingBots: many(tradingBots),
}));

export const tradingBotsRelations = relations(tradingBots, ({ one, many }) => ({
  user: one(users, {
    fields: [tradingBots.userId],
    references: [users.id],
  }),
  exchange: one(exchanges, {
    fields: [tradingBots.exchangeId],
    references: [exchanges.id],
  }),
  trades: many(trades),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  bot: one(tradingBots, {
    fields: [trades.botId],
    references: [tradingBots.id],
  }),
  user: one(users, {
    fields: [trades.userId],
    references: [users.id],
  }),
}));

export const portfolioRelations = relations(portfolio, ({ one }) => ({
  user: one(users, {
    fields: [portfolio.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertExchangeSchema = createInsertSchema(exchanges).omit({
  id: true,
  createdAt: true,
});

export const insertTradingBotSchema = createInsertSchema(tradingBots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalPnl: true,
  totalTrades: true,
  winRate: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  executedAt: true,
});

export const insertPortfolioSchema = createInsertSchema(portfolio).omit({
  id: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Exchange = typeof exchanges.$inferSelect;
export type InsertExchange = z.infer<typeof insertExchangeSchema>;

export type TradingBot = typeof tradingBots.$inferSelect;
export type InsertTradingBot = z.infer<typeof insertTradingBotSchema>;

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

export type Portfolio = typeof portfolio.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
