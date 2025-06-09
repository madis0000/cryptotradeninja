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
  // WebSocket endpoints
  wsApiEndpoint: text("ws_api_endpoint"), // wss://ws-api.testnet.binance.vision/ws-api/v3
  wsStreamEndpoint: text("ws_stream_endpoint"), // wss://stream.binance.com:9443/ws/
  // REST API endpoints
  restApiEndpoint: text("rest_api_endpoint"), // https://api.binance.com or https://testnet.binance.vision
  // Exchange specific settings
  exchangeType: text("exchange_type").default("binance"), // binance, coinbase, kraken
  isTestnet: boolean("is_testnet").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tradingBots = pgTable("trading_bots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  exchangeId: integer("exchange_id").notNull(),
  name: text("name").notNull(),
  strategy: text("strategy").notNull(), // grid, martingale, dca
  tradingPair: text("trading_pair").notNull(), // BTCUSDT, ETHUSDT, etc.
  direction: text("direction").notNull(), // long, short (for martingale)
  
  // Investment Settings
  baseOrderAmount: decimal("base_order_amount", { precision: 20, scale: 8 }).notNull(), // Quote currency amount
  safetyOrderAmount: decimal("safety_order_amount", { precision: 20, scale: 8 }).notNull(), // First safety order amount
  maxSafetyOrders: integer("max_safety_orders").notNull(),
  activeSafetyOrdersEnabled: boolean("active_safety_orders_enabled").default(false).notNull(),
  activeSafetyOrders: integer("active_safety_orders").default(1).notNull(),
  
  // Price Settings
  priceDeviation: decimal("price_deviation", { precision: 10, scale: 4 }).notNull(), // % deviation for safety orders
  takeProfitPercentage: decimal("take_profit_percentage", { precision: 10, scale: 4 }).notNull(), // % profit target
  takeProfitType: text("take_profit_type").notNull().default("fix"), // fix, trailing
  trailingProfitPercentage: decimal("trailing_profit_percentage", { precision: 10, scale: 4 }),
  
  // Advanced Settings
  triggerType: text("trigger_type").notNull().default("market"), // market, limit
  triggerPrice: decimal("trigger_price", { precision: 20, scale: 8 }),
  priceDeviationMultiplier: decimal("price_deviation_multiplier", { precision: 10, scale: 2 }).notNull().default("1.0"),
  safetyOrderSizeMultiplier: decimal("safety_order_size_multiplier", { precision: 10, scale: 2 }).notNull().default("1.0"),
  cooldownBetweenRounds: integer("cooldown_between_rounds").default(60).notNull(), // seconds
  
  // Risk Management
  lowerPriceLimit: decimal("lower_price_limit", { precision: 20, scale: 8 }),
  upperPriceLimit: decimal("upper_price_limit", { precision: 20, scale: 8 }),
  
  // Bot Status
  isActive: boolean("is_active").default(false).notNull(),
  currentBasePrice: decimal("current_base_price", { precision: 20, scale: 8 }), // Entry price for current round
  averageEntryPrice: decimal("average_entry_price", { precision: 20, scale: 8 }), // Weighted average of filled orders
  totalInvested: decimal("total_invested", { precision: 20, scale: 8 }).default("0").notNull(),
  
  // Performance Tracking
  totalPnl: decimal("total_pnl", { precision: 20, scale: 8 }).default("0").notNull(),
  totalTrades: integer("total_trades").default(0).notNull(),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id"), // Optional for manual trades
  userId: integer("user_id").notNull(),
  exchangeOrderId: text("exchange_order_id"), // Binance order ID
  tradingPair: text("trading_pair").notNull(),
  side: text("side").notNull(), // buy, sell
  orderType: text("order_type").notNull(), // market, limit
  orderCategory: text("order_category").notNull(), // base_order, safety_order, take_profit
  safetyOrderLevel: integer("safety_order_level"), // 1, 2, 3... for safety orders
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(), // Base asset amount
  quoteAmount: decimal("quote_amount", { precision: 20, scale: 8 }).notNull(), // Quote currency amount
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  status: text("status").notNull(), // filled, pending, cancelled, partially_filled
  pnl: decimal("pnl", { precision: 20, scale: 8 }).default("0").notNull(),
  fee: decimal("fee", { precision: 20, scale: 8 }).default("0").notNull(),
  feeAsset: text("fee_asset"), // BNB, USDT, etc.
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

// Bot cycles for tracking Martingale rounds
export const botCycles = pgTable("bot_cycles", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull(),
  userId: integer("user_id").notNull(),
  cycleNumber: integer("cycle_number").notNull().default(1),
  status: text("status").notNull().default("active"), // active, completed, failed, cancelled
  baseOrderId: text("base_order_id"), // Exchange order ID for base order
  takeProfitOrderId: text("take_profit_order_id"), // Exchange order ID for take profit
  activeOrderIds: text("active_order_ids").array().default([]), // All active order IDs
  
  // Cycle metrics
  baseOrderPrice: decimal("base_order_price", { precision: 20, scale: 8 }),
  currentAveragePrice: decimal("current_average_price", { precision: 20, scale: 8 }),
  totalInvested: decimal("total_invested", { precision: 20, scale: 8 }).default("0"),
  totalQuantity: decimal("total_quantity", { precision: 20, scale: 8 }).default("0"),
  
  // Safety order tracking
  filledSafetyOrders: integer("filled_safety_orders").default(0),
  maxSafetyOrders: integer("max_safety_orders").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Individual orders within cycles
export const cycleOrders = pgTable("cycle_orders", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull(),
  botId: integer("bot_id").notNull(),
  userId: integer("user_id").notNull(),
  
  exchangeOrderId: text("exchange_order_id"), // Binance order ID
  clientOrderId: text("client_order_id"), // Our internal tracking ID
  orderType: text("order_type").notNull(), // base_order, safety_order, take_profit
  safetyOrderLevel: integer("safety_order_level"), // 1, 2, 3... for safety orders
  
  side: text("side").notNull(), // BUY, SELL
  orderCategory: text("order_category").notNull(), // MARKET, LIMIT
  symbol: text("symbol").notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }),
  stopPrice: decimal("stop_price", { precision: 20, scale: 8 }),
  
  status: text("status").notNull().default("pending"), // pending, filled, cancelled, partially_filled, failed
  filledQuantity: decimal("filled_quantity", { precision: 20, scale: 8 }).default("0"),
  filledPrice: decimal("filled_price", { precision: 20, scale: 8 }),
  errorMessage: text("error_message"), // Store detailed error messages for failed orders
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  filledAt: timestamp("filled_at"),
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
  cycles: many(botCycles),
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

export const botCyclesRelations = relations(botCycles, ({ one, many }) => ({
  bot: one(tradingBots, {
    fields: [botCycles.botId],
    references: [tradingBots.id],
  }),
  user: one(users, {
    fields: [botCycles.userId],
    references: [users.id],
  }),
  orders: many(cycleOrders),
}));

export const cycleOrdersRelations = relations(cycleOrders, ({ one }) => ({
  cycle: one(botCycles, {
    fields: [cycleOrders.cycleId],
    references: [botCycles.id],
  }),
  bot: one(tradingBots, {
    fields: [cycleOrders.botId],
    references: [tradingBots.id],
  }),
  user: one(users, {
    fields: [cycleOrders.userId],
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
}).extend({
  wsApiEndpoint: z.string().url().optional(),
  wsStreamEndpoint: z.string().url().optional(),
  restApiEndpoint: z.string().url().optional(),
  exchangeType: z.string().optional(),
  isTestnet: z.boolean().optional(),
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

export const insertBotCycleSchema = createInsertSchema(botCycles).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertCycleOrderSchema = createInsertSchema(cycleOrders).omit({
  id: true,
  createdAt: true,
  filledAt: true,
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

export type BotCycle = typeof botCycles.$inferSelect;
export type InsertBotCycle = z.infer<typeof insertBotCycleSchema>;

export type CycleOrder = typeof cycleOrders.$inferSelect;
export type InsertCycleOrder = z.infer<typeof insertCycleOrderSchema>;
