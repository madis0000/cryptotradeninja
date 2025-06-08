import { 
  users, exchanges, tradingBots, trades, portfolio, botCycles, cycleOrders,
  type User, type InsertUser,
  type Exchange, type InsertExchange,
  type TradingBot, type InsertTradingBot,
  type Trade, type InsertTrade,
  type Portfolio, type InsertPortfolio,
  type BotCycle, type InsertBotCycle,
  type CycleOrder, type InsertCycleOrder
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sum, count } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLastLogin(id: number): Promise<void>;

  // Exchanges
  getExchangesByUserId(userId: number): Promise<Exchange[]>;
  createExchange(exchange: InsertExchange): Promise<Exchange>;
  updateExchange(id: number, exchange: Partial<InsertExchange>): Promise<Exchange>;
  deleteExchange(id: number): Promise<void>;

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
  updateBotCycle(cycleId: number, updates: Partial<InsertBotCycle>): Promise<BotCycle>;
  completeBotCycle(cycleId: number): Promise<void>;

  // Cycle Order Management
  createCycleOrder(order: InsertCycleOrder): Promise<CycleOrder>;
  getCycleOrders(cycleId: number): Promise<CycleOrder[]>;
  updateCycleOrder(orderId: number, updates: Partial<InsertCycleOrder>): Promise<CycleOrder>;
  getCycleOrderByExchangeId(exchangeOrderId: string): Promise<CycleOrder | undefined>;
  getPendingCycleOrders(botId: number): Promise<CycleOrder[]>;
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

    // Get total P&L from bots
    const [pnlResult] = await db
      .select({ totalPnl: sum(tradingBots.totalPnl) })
      .from(tradingBots)
      .where(eq(tradingBots.userId, userId));

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
}

export const storage = new DatabaseStorage();
