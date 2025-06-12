import { 
  users, exchanges, tradingBots, trades, portfolio, botCycles, cycleOrders, userSettings,
  type User, type InsertUser,
  type Exchange, type InsertExchange,
  type TradingBot, type InsertTradingBot,
  type Trade, type InsertTrade,
  type Portfolio, type InsertPortfolio,
  type BotCycle, type InsertBotCycle,
  type CycleOrder, type InsertCycleOrder,
  type UserSettings, type InsertUserSettings, type UpdateUserSettings
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sum, count, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLastLogin(id: number): Promise<void>;

  // User Settings
  getUserSettings(userId: number): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userId: number, settings: UpdateUserSettings): Promise<UserSettings>;

  // Exchanges
  getExchangesByUserId(userId: number): Promise<Exchange[]>;
  getUserExchanges(userId: number): Promise<Exchange[]>;
  createExchange(exchange: InsertExchange): Promise<Exchange>;
  updateExchange(id: number, exchange: Partial<InsertExchange>, userId?: number): Promise<Exchange>;
  deleteExchange(id: number, userId?: number): Promise<void>;

  // Trading Bots
  getTradingBotsByUserId(userId: number): Promise<TradingBot[]>;
  getTradingBot(id: number): Promise<TradingBot | undefined>;
  createTradingBot(bot: InsertTradingBot): Promise<TradingBot>;
  updateTradingBot(id: number, bot: Partial<InsertTradingBot>): Promise<TradingBot>;
  deleteTradingBot(id: number): Promise<void>;

  // Trades
  getTradesByUserId(userId: number, limit?: number): Promise<Trade[]>;
  getTradesByBotId(botId: number): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;

  // Portfolio
  getPortfolioByUserId(userId: number): Promise<Portfolio[]>;
  updatePortfolio(userId: number, asset: string, amount: string, averagePrice: string): Promise<Portfolio>;

  // Analytics
  getUserStats(userId: number): Promise<{
    totalBalance: string;
    totalPnl: string;
    activeBots: number;
    totalTrades: number;
    winRate: string;
  }>;

  // Bot Cycle Management
  createBotCycle(cycle: InsertBotCycle): Promise<BotCycle>;
  getActiveBotCycle(botId: number): Promise<BotCycle | undefined>;
  getActiveCycles(): Promise<BotCycle[]>;
  updateBotCycle(cycleId: number, updates: Partial<InsertBotCycle>): Promise<BotCycle>;
  completeBotCycle(cycleId: number): Promise<void>;
  getBotCyclesByBotId(botId: number): Promise<BotCycle[]>;
  getBotCyclesByUserId(userId: number): Promise<BotCycle[]>;

  // Cycle Order Management
  createCycleOrder(order: InsertCycleOrder): Promise<CycleOrder>;
  getCycleOrders(cycleId: number): Promise<CycleOrder[]>;
  updateCycleOrder(orderId: number, updates: Partial<InsertCycleOrder> & { filledAt?: Date }): Promise<CycleOrder>;
  getCycleOrderByExchangeId(exchangeOrderId: string): Promise<CycleOrder | undefined>;
  getPendingCycleOrders(botId: number): Promise<CycleOrder[]>;
  getCycleOrdersByBotId(botId: number): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserLastLogin(id: number): Promise<void> {
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, id));
  }

  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return settings || undefined;
  }

  async createUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const [newSettings] = await db
      .insert(userSettings)
      .values(settings)
      .returning();
    return newSettings;
  }

  async updateUserSettings(userId: number, settings: UpdateUserSettings): Promise<UserSettings> {
    const [updatedSettings] = await db
      .update(userSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();
    return updatedSettings;
  }

  async getExchangesByUserId(userId: number): Promise<Exchange[]> {
    return await db.select().from(exchanges).where(eq(exchanges.userId, userId));
  }

  async createExchange(exchange: InsertExchange): Promise<Exchange> {
    const [newExchange] = await db
      .insert(exchanges)
      .values(exchange)
      .returning();
    return newExchange;
  }

  async updateExchange(id: number, exchange: Partial<InsertExchange>): Promise<Exchange> {
    const [updatedExchange] = await db
      .update(exchanges)
      .set(exchange)
      .where(eq(exchanges.id, id))
      .returning();
    return updatedExchange;
  }

  async deleteExchange(id: number): Promise<void> {
    await db.delete(exchanges).where(eq(exchanges.id, id));
  }

  async getTradingBotsByUserId(userId: number): Promise<TradingBot[]> {
    return await db.select().from(tradingBots).where(eq(tradingBots.userId, userId));
  }

  async getTradingBot(id: number): Promise<TradingBot | undefined> {
    const [bot] = await db.select().from(tradingBots).where(eq(tradingBots.id, id));
    return bot || undefined;
  }

  async createTradingBot(bot: InsertTradingBot): Promise<TradingBot> {
    const [newBot] = await db
      .insert(tradingBots)
      .values(bot)
      .returning();
    return newBot;
  }

  async updateTradingBot(id: number, bot: Partial<InsertTradingBot>): Promise<TradingBot> {
    const [updatedBot] = await db
      .update(tradingBots)
      .set({ ...bot, updatedAt: new Date() })
      .where(eq(tradingBots.id, id))
      .returning();
    return updatedBot;
  }

  async deleteTradingBot(id: number): Promise<void> {
    // Delete all related data in proper order (foreign key constraints)
    
    // 1. Delete cycle orders first (references cycles)
    await db.delete(cycleOrders).where(eq(cycleOrders.botId, id));
    
    // 2. Delete bot cycles (references bot)
    await db.delete(botCycles).where(eq(botCycles.botId, id));
    
    // 3. Delete trades (references bot)
    await db.delete(trades).where(eq(trades.botId, id));
    
    // 4. Finally delete the bot itself
    await db.delete(tradingBots).where(eq(tradingBots.id, id));
  }

  async getTradesByUserId(userId: number, limit = 50): Promise<Trade[]> {
    return await db
      .select()
      .from(trades)
      .where(eq(trades.userId, userId))
      .orderBy(desc(trades.executedAt))
      .limit(limit);
  }

  async getTradesByBotId(botId: number): Promise<Trade[]> {
    return await db.select().from(trades).where(eq(trades.botId, botId));
  }

  async createTrade(trade: InsertTrade): Promise<Trade> {
    const [newTrade] = await db
      .insert(trades)
      .values(trade)
      .returning();
    return newTrade;
  }

  async getPortfolioByUserId(userId: number): Promise<Portfolio[]> {
    return await db.select().from(portfolio).where(eq(portfolio.userId, userId));
  }

  async updatePortfolio(userId: number, asset: string, amount: string, averagePrice: string): Promise<Portfolio> {
    const [existingPortfolio] = await db
      .select()
      .from(portfolio)
      .where(and(eq(portfolio.userId, userId), eq(portfolio.asset, asset)));

    if (existingPortfolio) {
      const [updatedPortfolio] = await db
        .update(portfolio)
        .set({ amount, averagePrice, updatedAt: new Date() })
        .where(and(eq(portfolio.userId, userId), eq(portfolio.asset, asset)))
        .returning();
      return updatedPortfolio;
    } else {
      const [newPortfolio] = await db
        .insert(portfolio)
        .values({ userId, asset, amount, averagePrice })
        .returning();
      return newPortfolio;
    }
  }

  async getUserStats(userId: number): Promise<{
    totalBalance: string;
    totalPnl: string;
    activeBots: number;
    totalTrades: number;
    winRate: string;
  }> {
    // Get portfolio total value (simplified calculation)
    const portfolioData = await db.select().from(portfolio).where(eq(portfolio.userId, userId));
    const totalBalance = portfolioData.reduce((acc, item) => {
      return acc + (parseFloat(item.amount) * parseFloat(item.averagePrice));
    }, 0);

    // Get total P&L from completed bot cycles
    const [pnlResult] = await db
      .select({ totalPnl: sum(botCycles.cycleProfit) })
      .from(botCycles)
      .where(and(eq(botCycles.userId, userId), sql`${botCycles.completedAt} IS NOT NULL`));

    // Get active bots count
    const [activeBotsResult] = await db
      .select({ count: count() })
      .from(tradingBots)
      .where(and(eq(tradingBots.userId, userId), eq(tradingBots.isActive, true)));

    // Get total trades count
    const [totalTradesResult] = await db
      .select({ count: count() })
      .from(trades)
      .where(eq(trades.userId, userId));

    // Calculate win rate
    const userTrades = await db.select().from(trades).where(eq(trades.userId, userId));
    const winningTrades = userTrades.filter(trade => parseFloat(trade.pnl) > 0).length;
    const winRate = userTrades.length > 0 ? (winningTrades / userTrades.length) * 100 : 0;

    return {
      totalBalance: totalBalance.toString(),
      totalPnl: pnlResult.totalPnl || "0",
      activeBots: activeBotsResult.count,
      totalTrades: totalTradesResult.count,
      winRate: winRate.toFixed(2),
    };
  }

  // Additional helper methods for API compatibility
  async getUserExchanges(userId: number): Promise<Exchange[]> {
    return this.getExchangesByUserId(userId);
  }

  async getUserTradingBots(userId: number): Promise<TradingBot[]> {
    return this.getTradingBotsByUserId(userId);
  }

  async getTradingBot(id: number, userId: number): Promise<TradingBot | undefined> {
    const [bot] = await db
      .select()
      .from(tradingBots)
      .where(and(eq(tradingBots.id, id), eq(tradingBots.userId, userId)));
    return bot || undefined;
  }

  async updateTradingBot(id: number, updates: Partial<InsertTradingBot>, userId?: number): Promise<TradingBot> {
    const whereClause = userId 
      ? and(eq(tradingBots.id, id), eq(tradingBots.userId, userId))
      : eq(tradingBots.id, id);

    const [updatedBot] = await db
      .update(tradingBots)
      .set(updates)
      .where(whereClause)
      .returning();
    return updatedBot;
  }

  async deleteTradingBot(id: number, userId?: number): Promise<void> {
    const whereClause = userId 
      ? and(eq(tradingBots.id, id), eq(tradingBots.userId, userId))
      : eq(tradingBots.id, id);

    await db.delete(tradingBots).where(whereClause);
  }

  async updateExchange(id: number, updates: Partial<InsertExchange>, userId?: number): Promise<Exchange> {
    const whereClause = userId 
      ? and(eq(exchanges.id, id), eq(exchanges.userId, userId))
      : eq(exchanges.id, id);

    const [updatedExchange] = await db
      .update(exchanges)
      .set(updates)
      .where(whereClause)
      .returning();
    return updatedExchange;
  }

  async deleteExchange(id: number, userId?: number): Promise<void> {
    const whereClause = userId 
      ? and(eq(exchanges.id, id), eq(exchanges.userId, userId))
      : eq(exchanges.id, id);

    await db.delete(exchanges).where(whereClause);
  }

  async getBotCycles(botId: number, userId: number): Promise<BotCycle[]> {
    const cycles = await db
      .select()
      .from(botCycles)
      .where(and(eq(botCycles.botId, botId), eq(botCycles.userId, userId)))
      .orderBy(desc(botCycles.createdAt));
    return cycles;
  }

  async getBotOrders(botId: number, userId: number): Promise<CycleOrder[]> {
    const orders = await db
      .select()
      .from(cycleOrders)
      .innerJoin(botCycles, eq(cycleOrders.cycleId, botCycles.id))
      .where(and(eq(botCycles.botId, botId), eq(botCycles.userId, userId)))
      .orderBy(desc(cycleOrders.createdAt));
    return orders.map(order => order.cycle_orders);
  }

  async getCycleProfits(userId: number): Promise<BotCycle[]> {
    const cycles = await db
      .select()
      .from(botCycles)
      .where(and(eq(botCycles.userId, userId), isNotNull(botCycles.cycleProfit)))
      .orderBy(desc(botCycles.completedAt));
    return cycles;
  }

  async getBotStats(userId: number): Promise<any> {
    // Get bot statistics
    const [activeBotsResult] = await db
      .select({ count: count() })
      .from(tradingBots)
      .where(and(eq(tradingBots.userId, userId), eq(tradingBots.isActive, true)));

    const [totalBotsResult] = await db
      .select({ count: count() })
      .from(tradingBots)
      .where(eq(tradingBots.userId, userId));

    const [completedCyclesResult] = await db
      .select({ count: count() })
      .from(botCycles)
      .where(and(eq(botCycles.userId, userId), eq(botCycles.status, 'completed')));

    const [totalProfitResult] = await db
      .select({ totalProfit: sum(botCycles.cycleProfit) })
      .from(botCycles)
      .where(and(eq(botCycles.userId, userId), isNotNull(botCycles.cycleProfit)));

    return {
      activeBots: activeBotsResult.count,
      totalBots: totalBotsResult.count,
      completedCycles: completedCyclesResult.count,
      totalProfit: totalProfitResult.totalProfit || "0"
    };
  }

  async getUserTrades(userId: number): Promise<Trade[]> {
    return this.getTradesByUserId(userId);
  }

  async getPortfolio(userId: number): Promise<Portfolio[]> {
    return this.getPortfolioByUserId(userId);
  }

  async getStats(userId: number): Promise<any> {
    return this.getUserStats(userId);
  }

  // Bot Cycle Management
  async createBotCycle(cycle: InsertBotCycle): Promise<BotCycle> {
    // Get the highest cycle number for this bot
    const [lastCycle] = await db
      .select({ cycleNumber: botCycles.cycleNumber })
      .from(botCycles)
      .where(eq(botCycles.botId, cycle.botId))
      .orderBy(desc(botCycles.cycleNumber))
      .limit(1);

    // Calculate next cycle number (start at 1 for first cycle)
    const nextCycleNumber = lastCycle ? lastCycle.cycleNumber + 1 : 1;

    const [newCycle] = await db
      .insert(botCycles)
      .values({
        ...cycle,
        cycleNumber: nextCycleNumber
      })
      .returning();
    return newCycle;
  }

  async getActiveBotCycle(botId: number): Promise<BotCycle | undefined> {
    const [cycle] = await db
      .select()
      .from(botCycles)
      .where(and(eq(botCycles.botId, botId), eq(botCycles.status, 'active')));
    return cycle || undefined;
  }

  async updateBotCycle(cycleId: number, updates: Partial<InsertBotCycle>): Promise<BotCycle> {
    const [updatedCycle] = await db
      .update(botCycles)
      .set(updates)
      .where(eq(botCycles.id, cycleId))
      .returning();
    return updatedCycle;
  }

  async completeBotCycle(cycleId: number): Promise<void> {
    await db
      .update(botCycles)
      .set({ 
        status: 'completed',
        completedAt: new Date()
      })
      .where(eq(botCycles.id, cycleId));
  }

  async getBotCyclesByUserId(userId: number): Promise<BotCycle[]> {
    const cycles = await db
      .select()
      .from(botCycles)
      .where(eq(botCycles.userId, userId))
      .orderBy(desc(botCycles.createdAt));
    return cycles;
  }

  async getActiveCycles(): Promise<BotCycle[]> {
    return await db
      .select()
      .from(botCycles)
      .where(eq(botCycles.status, 'active'))
      .orderBy(desc(botCycles.createdAt));
  }

  // Cycle Order Management
  async createCycleOrder(order: InsertCycleOrder): Promise<CycleOrder> {
    const [newOrder] = await db
      .insert(cycleOrders)
      .values(order)
      .returning();
    return newOrder;
  }

  async getCycleOrders(cycleId: number): Promise<CycleOrder[]> {
    return await db
      .select()
      .from(cycleOrders)
      .where(eq(cycleOrders.cycleId, cycleId))
      .orderBy(desc(cycleOrders.createdAt));
  }

  async updateCycleOrder(orderId: number, updates: Partial<InsertCycleOrder> & { filledAt?: Date }): Promise<CycleOrder> {
    const [updatedOrder] = await db
      .update(cycleOrders)
      .set({
        ...updates,
        ...(updates.filledAt && { filledAt: updates.filledAt })
      })
      .where(eq(cycleOrders.id, orderId))
      .returning();
    return updatedOrder;
  }

  async getCycleOrderByExchangeId(exchangeOrderId: string): Promise<CycleOrder | undefined> {
    const [order] = await db
      .select()
      .from(cycleOrders)
      .where(eq(cycleOrders.exchangeOrderId, exchangeOrderId));
    return order || undefined;
  }

  async getBotCyclesByBotId(botId: number): Promise<BotCycle[]> {
    return await db
      .select()
      .from(botCycles)
      .where(eq(botCycles.botId, botId))
      .orderBy(desc(botCycles.createdAt));
  }

  async getCycleOrdersByBotId(botId: number): Promise<any[]> {
    const results = await db
      .select({
        id: cycleOrders.id,
        cycleId: cycleOrders.cycleId,
        botId: cycleOrders.botId,
        userId: cycleOrders.userId,
        orderType: cycleOrders.orderType,
        side: cycleOrders.side,
        price: cycleOrders.price,
        quantity: cycleOrders.quantity,
        filledPrice: cycleOrders.filledPrice,
        filledQuantity: cycleOrders.filledQuantity,
        status: cycleOrders.status,
        exchangeOrderId: cycleOrders.exchangeOrderId,
        fee: cycleOrders.fee,
        feeAsset: cycleOrders.feeAsset,
        createdAt: cycleOrders.createdAt,
        filledAt: cycleOrders.filledAt,
        cycleNumber: botCycles.cycleNumber
      })
      .from(cycleOrders)
      .leftJoin(botCycles, eq(cycleOrders.cycleId, botCycles.id))
      .where(eq(cycleOrders.botId, botId))
      .orderBy(desc(cycleOrders.createdAt));
    
    return results;
  }

  async getPendingCycleOrders(botId: number): Promise<CycleOrder[]> {
    return await db
      .select()
      .from(cycleOrders)
      .where(and(
        eq(cycleOrders.botId, botId),
        eq(cycleOrders.status, 'placed')
      ))
      .orderBy(desc(cycleOrders.createdAt));
  }
}

export const storage = new DatabaseStorage();
