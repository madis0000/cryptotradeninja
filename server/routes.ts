import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExchangeSchema, insertTradingBotSchema, insertTradeSchema, insertUserSchema, insertUserSettingsSchema, updateUserSettingsSchema } from "@shared/schema";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest, generateToken, hashPassword, comparePassword } from "./auth";
import { encryptApiCredentials, decryptApiCredentials } from "./encryption";
import { MinimalWebSocket } from "./minimal-websocket";
import { BotLoggerManager } from "./bot-logger";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize minimal WebSocket using HTTP upgrade to avoid Vite HMR conflicts
  const wsManager = new MinimalWebSocket(httpServer);
  
  // Store reference for API routes
  (httpServer as any).wsManager = wsManager;
  
  // Configure trust proxy for Replit environment
  app.set('trust proxy', true);
  
  // Security middleware
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  }));

  app.use(cors({
    origin: true,
    credentials: true,
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000 // limit each IP to 1000 requests per windowMs
  });
  app.use('/api/', limiter);

  // Authentication routes
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, email, password } = insertUserSchema.omit({ id: true }).parse(req.body);
      const hashedPassword = await hashPassword(password);
      
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword
      });

      // Create default user settings
      await storage.createUserSettings({
        userId: user.id,
        notificationsEnabled: true,
        soundEnabled: true,
        volume: 0.5,
        orderFillSound: 'chin-chin',
        orderPartialFillSound: 'beep',
        orderCancelSound: 'notification'
      });

      const token = generateToken(user.id, user.username, user.email);
      
      res.json({ 
        message: "User registered successfully",
        token,
        user: { id: user.id, username: user.username, email: user.email }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = z.object({
        email: z.string().email(),
        password: z.string()
      }).parse(req.body);

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = generateToken(user.id, user.username, user.email);
      
      res.json({ 
        message: "Login successful",
        token,
        user: { id: user.id, username: user.username, email: user.email }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(400).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // User settings routes
  app.get("/api/user/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const settings = await storage.getUserSettings(userId);
      
      if (!settings) {
        // Create default settings if they don't exist
        const defaultSettings = await storage.createUserSettings({
          userId,
          notificationsEnabled: true,
          soundEnabled: true,
          volume: 0.5,
          orderFillSound: 'chin-chin',
          orderPartialFillSound: 'beep',
          orderCancelSound: 'notification'
        });
        return res.json(defaultSettings);
      }
      
      res.json(settings);
    } catch (error) {
      console.error('Get user settings error:', error);
      res.status(500).json({ error: "Failed to get user settings" });
    }
  });

  app.put("/api/user/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const settingsData = updateUserSettingsSchema.parse(req.body);
      
      const updatedSettings = await storage.updateUserSettings(userId, settingsData);
      res.json(updatedSettings);
    } catch (error) {
      console.error('Update user settings error:', error);
      res.status(400).json({ error: "Failed to update user settings" });
    }
  });

  // Exchange routes
  app.get("/api/exchanges", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const exchanges = await storage.getUserExchanges(userId);
      res.json(exchanges);
    } catch (error) {
      console.error('Get exchanges error:', error);
      res.status(500).json({ error: "Failed to get exchanges" });
    }
  });

  app.post("/api/exchanges", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const exchangeData = insertExchangeSchema.omit({ id: true, userId: true }).parse(req.body);
      
      const encryptedCredentials = encryptApiCredentials(exchangeData.apiKey, exchangeData.apiSecret);
      
      const exchange = await storage.createExchange({
        ...exchangeData,
        userId,
        apiKey: encryptedCredentials.encryptedApiKey,
        apiSecret: encryptedCredentials.encryptedApiSecret,
        encryptionIv: encryptedCredentials.iv
      });

      res.json(exchange);
    } catch (error) {
      console.error('Create exchange error:', error);
      res.status(400).json({ error: "Failed to create exchange" });
    }
  });

  app.put("/api/exchanges/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const exchangeId = parseInt(req.params.id);
      const userId = req.user!.id;
      const exchangeData = insertExchangeSchema.partial().omit({ id: true, userId: true }).parse(req.body);
      
      if (exchangeData.apiKey && exchangeData.apiSecret) {
        const encryptedCredentials = encryptApiCredentials(exchangeData.apiKey, exchangeData.apiSecret);
        exchangeData.apiKey = encryptedCredentials.encryptedApiKey;
        exchangeData.apiSecret = encryptedCredentials.encryptedApiSecret;
        (exchangeData as any).encryptionIv = encryptedCredentials.iv;
      }
      
      const exchange = await storage.updateExchange(exchangeId, exchangeData, userId);
      res.json(exchange);
    } catch (error) {
      console.error('Update exchange error:', error);
      res.status(400).json({ error: "Failed to update exchange" });
    }
  });

  app.delete("/api/exchanges/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const exchangeId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      await storage.deleteExchange(exchangeId, userId);
      res.json({ message: "Exchange deleted successfully" });
    } catch (error) {
      console.error('Delete exchange error:', error);
      res.status(400).json({ error: "Failed to delete exchange" });
    }
  });

  // Trading bot routes
  app.get("/api/bots", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const bots = await storage.getUserTradingBots(userId);
      res.json(bots);
    } catch (error) {
      console.error('Get bots error:', error);
      res.status(500).json({ error: "Failed to get bots" });
    }
  });

  app.post("/api/bots", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const botData = insertTradingBotSchema.parse({ ...req.body, userId });
      
      // Create the trading bot
      const bot = await storage.createTradingBot(botData);
      
      // Initialize bot logger
      const logger = BotLoggerManager.getLogger(bot.id, bot.tradingPair);
      logger.logBotCreated(bot);
      
      // For active Martingale bots, create initial cycle
      if (bot.strategy === 'martingale' && bot.status === 'active') {
        const cycle = await storage.createBotCycle({
          botId: bot.id,
          userId,
          cycleNumber: 1,
          status: 'active',
          maxSafetyOrders: bot.maxSafetyOrders
        });
        
        logger.logCycleStarted(1, cycle.id);
        console.log(`[MARTINGALE] Created initial cycle ${cycle.id} for bot ${bot.id}`);
        
        // Bot setup completed
        console.log(`[BOT CREATION] Bot ${bot.id} setup completed for ${bot.tradingPair}`);
        
        // Mark bot as active
        await storage.updateTradingBot(bot.id, {
          status: 'active',
          isActive: true
        });
        
        logger.logBotStarted();
      }

      res.json(bot);
    } catch (error) {
      console.error('Create bot error:', error);
      res.status(400).json({ error: "Failed to create bot" });
    }
  });

  app.put("/api/bots/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.id);
      const userId = req.user!.id;
      const botData = insertTradingBotSchema.partial().omit({ id: true, userId: true }).parse(req.body);
      
      const bot = await storage.updateTradingBot(botId, botData, userId);
      res.json(bot);
    } catch (error) {
      console.error('Update bot error:', error);
      res.status(400).json({ error: "Failed to update bot" });
    }
  });

  app.post("/api/bots/:id/stop", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const bot = await storage.getTradingBot(botId, userId);
      if (!bot) {
        return res.status(404).json({ error: "Bot not found" });
      }

      // Get bot logger
      const logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      
      // Update bot status to stopped
      await storage.updateTradingBot(botId, {
        status: 'stopped',
        isActive: false
      });

      logger.logBotStopped('Manual stop');
      console.log(`[BOT STOP] Bot ${botId} stopped successfully`);

      res.json({ 
        message: "Bot stopped successfully",
        cancelledOrders: 0,
        liquidated: false
      });
    } catch (error) {
      console.error('Stop bot error:', error);
      res.status(400).json({ error: "Failed to stop bot" });
    }
  });

  app.delete("/api/bots/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const bot = await storage.getTradingBot(botId, userId);
      if (bot) {
        const logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
        logger.logBotDeleted();
        BotLoggerManager.removeLogger(botId);
      }
      
      await storage.deleteTradingBot(botId, userId);
      res.json({ message: "Bot deleted successfully" });
    } catch (error) {
      console.error('Delete bot error:', error);
      res.status(400).json({ error: "Failed to delete bot" });
    }
  });

  // Bot cycles and orders
  app.get("/api/bot-cycles/:botId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.botId);
      const userId = req.user!.id;
      const cycles = await storage.getBotCycles(botId, userId);
      res.json(cycles);
    } catch (error) {
      console.error('Get bot cycles error:', error);
      res.status(500).json({ error: "Failed to get bot cycles" });
    }
  });

  app.get("/api/bot-orders/:botId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.botId);
      const userId = req.user!.id;
      const orders = await storage.getBotOrders(botId, userId);
      res.json(orders);
    } catch (error) {
      console.error('Get bot orders error:', error);
      res.status(500).json({ error: "Failed to get bot orders" });
    }
  });

  // Statistics routes
  app.get("/api/cycle-profits", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const profits = await storage.getCycleProfits(userId);
      res.json(profits);
    } catch (error) {
      console.error('Get cycle profits error:', error);
      res.status(500).json({ error: "Failed to get cycle profits" });
    }
  });

  app.get("/api/bot-stats", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const stats = await storage.getBotStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('Get bot stats error:', error);
      res.status(500).json({ error: "Failed to get bot stats" });
    }
  });

  // Bot logs routes
  app.get("/api/bot-logs/:botId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.botId);
      const lines = parseInt(req.query.lines as string) || 100;
      
      const logger = BotLoggerManager.getLogger(botId, 'SYSTEM');
      const logs = logger.getRecentLogs(lines);
      
      res.json({ logs });
    } catch (error) {
      console.error('Get bot logs error:', error);
      res.status(500).json({ error: "Failed to get bot logs" });
    }
  });

  app.get("/api/bot-logs/:botId/download", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.botId);
      
      const logger = BotLoggerManager.getLogger(botId, 'SYSTEM');
      const logFilePath = logger.getLogFilePath();
      
      if (fs.existsSync(logFilePath)) {
        res.download(logFilePath, `bot-${botId}-logs.txt`);
      } else {
        res.status(404).json({ error: "Log file not found" });
      }
    } catch (error) {
      console.error('Download bot logs error:', error);
      res.status(500).json({ error: "Failed to download bot logs" });
    }
  });

  app.delete("/api/bot-logs/:botId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.botId);
      
      const logger = BotLoggerManager.getLogger(botId, 'SYSTEM');
      logger.clearLogs();
      
      res.json({ message: "Bot logs cleared successfully" });
    } catch (error) {
      console.error('Clear bot logs error:', error);
      res.status(500).json({ error: "Failed to clear bot logs" });
    }
  });

  app.get("/api/system-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const logDirectory = path.join(process.cwd(), 'logs');
      const systemLogPath = path.join(logDirectory, 'system.log');
      
      if (fs.existsSync(systemLogPath)) {
        const logs = fs.readFileSync(systemLogPath, 'utf-8').split('\n').slice(-100);
        res.json({ logs });
      } else {
        res.json({ logs: [] });
      }
    } catch (error) {
      console.error('Get system logs error:', error);
      res.status(500).json({ error: "Failed to get system logs" });
    }
  });

  // Simple API routes for basic functionality
  app.get("/api/bots/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.id);
      const userId = req.user!.id;
      const bot = await storage.getTradingBot(botId, userId);
      
      if (!bot) {
        return res.status(404).json({ error: "Bot not found" });
      }
      
      res.json(bot);
    } catch (error) {
      console.error('Get bot error:', error);
      res.status(500).json({ error: "Failed to get bot" });
    }
  });

  app.get("/api/trades", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const trades = await storage.getUserTrades(userId);
      res.json(trades);
    } catch (error) {
      console.error('Get trades error:', error);
      res.status(500).json({ error: "Failed to get trades" });
    }
  });

  app.post("/api/trades", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const tradeData = insertTradeSchema.parse({ ...req.body, userId });
      
      const trade = await storage.createTrade(tradeData);
      res.json(trade);
    } catch (error) {
      console.error('Create trade error:', error);
      res.status(400).json({ error: "Failed to create trade" });
    }
  });

  app.get("/api/portfolio", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const portfolio = await storage.getPortfolio(userId);
      res.json(portfolio);
    } catch (error) {
      console.error('Get portfolio error:', error);
      res.status(500).json({ error: "Failed to get portfolio" });
    }
  });

  app.get("/api/stats", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const stats = await storage.getStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // WebSocket management routes (simplified)
  app.post("/api/websocket/listen-key", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // Generate a simple listen key for client identification
      const listenKey = Math.random().toString(36).substr(2, 16);
      res.json({ listenKey });
    } catch (error) {
      console.error('Generate listen key error:', error);
      res.status(500).json({ error: "Failed to generate listen key" });
    }
  });

  app.post("/api/websocket/configure-stream", async (req: Request, res: Response) => {
    try {
      const { dataType, symbols, interval, depth } = req.body;
      console.log(`[API] Stream configuration request: ${dataType}, symbols: ${symbols?.join(',')}`);
      
      // Broadcast configuration to connected WebSocket clients
      wsManager.broadcast({
        type: 'stream_configured',
        dataType,
        symbols,
        interval,
        depth,
        timestamp: Date.now()
      });
      
      res.json({ message: "Stream configured successfully" });
    } catch (error) {
      console.error('Configure stream error:', error);
      res.status(500).json({ error: "Failed to configure stream" });
    }
  });

  app.post("/api/bots/:id/trigger-cycle", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const botId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      console.log(`[API] Manual cycle trigger for bot ${botId}`);
      res.json({ message: "Cycle trigger initiated" });
    } catch (error) {
      console.error('Trigger cycle error:', error);
      res.status(500).json({ error: "Failed to trigger cycle" });
    }
  });

  app.post("/api/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { exchangeId, symbol, side, quantity, orderType, price } = req.body;
      console.log(`[API] Order placement request: ${side} ${quantity} ${symbol} at ${price || 'market'}`);
      
      // Simple order response for testing
      const orderId = Math.random().toString(36).substr(2, 9);
      
      res.json({
        success: true,
        orderId,
        symbol,
        side,
        quantity,
        orderType,
        price,
        status: 'placed',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Place order error:', error);
      res.status(500).json({ error: "Failed to place order" });
    }
  });

  app.get("/api/exchanges/:exchangeId/balance/:symbol", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { exchangeId, symbol } = req.params;
      console.log(`[API] Balance request for ${symbol} on exchange ${exchangeId}`);
      
      // Return mock balance for testing
      const balanceData = {
        symbol,
        free: "1000.00000000",
        locked: "0.00000000",
        total: "1000.00000000"
      };
      
      res.json(balanceData);
    } catch (error) {
      console.error('Get balance error:', error);
      res.status(500).json({ error: "Failed to get balance" });
    }
  });

  app.get("/api/demo-martingale", async (req: Request, res: Response) => {
    res.json({
      message: "Demo Martingale API endpoint",
      timestamp: Date.now(),
      status: "active"
    });
  });

  return httpServer;
}