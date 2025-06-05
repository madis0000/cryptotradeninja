import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExchangeSchema, insertTradingBotSchema, insertTradeSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import WebSocket, { WebSocketServer } from "ws";
import { requireAuth, AuthenticatedRequest, generateToken, hashPassword, comparePassword } from "./auth";
import { encryptApiCredentials, decryptApiCredentials } from "./encryption";
import { WebSocketService } from "./websocket-service";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize WebSocket service
  const wsService = new WebSocketService(httpServer);
  
  // Configure trust proxy for Replit environment
  app.set('trust proxy', true);
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
    crossOriginEmbedderPolicy: false
  }));
  
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? ['https://yourdomain.com'] : true,
    credentials: true
  }));

  // Rate limiting with proper trust proxy configuration
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs (increased for development)
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true, // Explicitly trust proxy for Replit
    skipSuccessfulRequests: true,
  });
  
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // increased for development
    message: { error: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true, // Explicitly trust proxy for Replit
    skipSuccessfulRequests: true,
  });

  app.use('/api/', limiter);
  
  // WebSocket server for real-time updates on a different port
  const wss = new WebSocketServer({ port: 8080 });
  
  // Mock market data broadcasting
  const marketData: Record<string, { price: number; change: number }> = {
    'BTC/USDT': { price: 43285.12, change: 2.34 },
    'ETH/USDT': { price: 2568.91, change: -1.12 },
    'ADA/USDT': { price: 0.4521, change: 0.87 },
    'BNB/USDT': { price: 312.67, change: 0.89 },
    'SOL/USDT': { price: 98.34, change: -2.67 },
  };

  // Broadcast market data updates
  setInterval(() => {
    Object.keys(marketData).forEach(pair => {
      const change = (Math.random() - 0.5) * 2; // Random price movement
      if (marketData[pair]) {
        marketData[pair].price += change;
        marketData[pair].change = change;
      }
    });

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'market_update',
          data: marketData
        }));
      }
    });
  }, 3000);

  // Authentication routes
  const registerSchema = insertUserSchema.extend({
    confirmPassword: z.string().min(8),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists with this email" });
      }

      const existingUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      // Hash password and create user
      const hashedPassword = await hashPassword(validatedData.password);
      const user = await storage.createUser({
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
      });

      // Generate token
      const token = generateToken(user.id, user.username, user.email);

      res.status(201).json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to register user" });
      }
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(validatedData.email);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await comparePassword(validatedData.password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Update last login
      await storage.updateUserLastLogin(user.id);

      // Generate token
      const token = generateToken(user.id, user.username, user.email);

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to login" });
      }
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthenticatedRequest, res) => {
    res.json({
      user: req.user,
    });
  });

  // Exchanges API - Secured with authentication
  app.get("/api/exchanges", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const exchanges = await storage.getExchangesByUserId(userId);
      
      // Decrypt API keys for display (masked)
      const exchangesWithMaskedKeys = exchanges.map(exchange => ({
        ...exchange,
        apiKey: exchange.apiKey.slice(0, 4) + '•'.repeat(Math.max(8, exchange.apiKey.length - 8)) + exchange.apiKey.slice(-4),
        apiSecret: '•'.repeat(20), // Never show secret
        encryptionIv: undefined, // Never expose IV
      }));
      
      res.json(exchangesWithMaskedKeys);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exchanges" });
    }
  });

  app.post("/api/exchanges", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { name, apiKey, apiSecret } = req.body;
      
      // Validate input
      if (!name || !apiKey || !apiSecret) {
        return res.status(400).json({ error: "Name, API key, and API secret are required" });
      }

      // Encrypt API credentials
      const encryptedCredentials = encryptApiCredentials(apiKey, apiSecret);
      
      const exchangeData = {
        userId,
        name,
        ...encryptedCredentials,
      };
      
      const exchange = await storage.createExchange(exchangeData);
      
      // Return masked data
      res.json({
        ...exchange,
        apiKey: apiKey.slice(0, 4) + '•'.repeat(Math.max(8, apiKey.length - 8)) + apiKey.slice(-4),
        apiSecret: '•'.repeat(20),
        encryptionIv: undefined,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to create exchange" });
    }
  });

  app.put("/api/exchanges/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      const { name, apiKey, apiSecret } = req.body;
      
      // Verify exchange belongs to user
      const exchange = await storage.getExchangesByUserId(userId);
      const userExchange = exchange.find(ex => ex.id === id);
      if (!userExchange) {
        return res.status(404).json({ error: "Exchange not found" });
      }

      let updateData: any = { name };
      
      // If new API credentials provided, encrypt them
      if (apiKey && apiSecret) {
        const encryptedCredentials = encryptApiCredentials(apiKey, apiSecret);
        updateData = { ...updateData, ...encryptedCredentials };
      }
      
      const updatedExchange = await storage.updateExchange(id, updateData);
      res.json({
        ...updatedExchange,
        apiKey: updatedExchange.apiKey.slice(0, 4) + '•'.repeat(20) + updatedExchange.apiKey.slice(-4),
        apiSecret: '•'.repeat(20),
        encryptionIv: undefined,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update exchange" });
    }
  });

  app.delete("/api/exchanges/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Verify exchange belongs to user
      const exchanges = await storage.getExchangesByUserId(userId);
      const userExchange = exchanges.find(ex => ex.id === id);
      if (!userExchange) {
        return res.status(404).json({ error: "Exchange not found" });
      }
      
      await storage.deleteExchange(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete exchange" });
    }
  });

  // Trading Bots API - Secured
  app.get("/api/bots", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const bots = await storage.getTradingBotsByUserId(userId);
      res.json(bots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trading bots" });
    }
  });

  app.post("/api/bots", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const botData = insertTradingBotSchema.parse({ ...req.body, userId });
      const bot = await storage.createTradingBot(botData);
      res.json(bot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid bot data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create trading bot" });
      }
    }
  });

  app.put("/api/bots/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Verify bot belongs to user
      const bot = await storage.getTradingBot(id);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Trading bot not found" });
      }
      
      const updateData = req.body;
      const updatedBot = await storage.updateTradingBot(id, updateData);
      res.json(updatedBot);
    } catch (error) {
      res.status(500).json({ error: "Failed to update trading bot" });
    }
  });

  app.delete("/api/bots/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Verify bot belongs to user
      const bot = await storage.getTradingBot(id);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Trading bot not found" });
      }
      
      await storage.deleteTradingBot(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete trading bot" });
    }
  });

  // Trades API - Secured
  app.get("/api/trades", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const trades = await storage.getTradesByUserId(userId, limit);
      res.json(trades);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  app.post("/api/trades", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const tradeData = insertTradeSchema.parse({ ...req.body, userId });
      const trade = await storage.createTrade(tradeData);
      res.json(trade);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid trade data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create trade" });
      }
    }
  });

  // Portfolio API - Secured
  app.get("/api/portfolio", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const portfolio = await storage.getPortfolioByUserId(userId);
      res.json(portfolio);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolio" });
    }
  });

  // User Stats API - Secured
  app.get("/api/stats", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  // WebSocket listen key generation for authenticated streams
  app.post("/api/websocket/listen-key", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const listenKey = await wsService.generateListenKey(userId);
      
      res.json({
        listenKey,
        message: "Listen key generated successfully"
      });

    } catch (error: any) {
      console.error("Error generating listen key:", error);
      res.status(500).json({ 
        error: error.message || "Failed to generate listen key. Please check your API credentials." 
      });
    }
  });

  // Configure stream connection
  app.post("/api/websocket/configure-stream", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { dataType, symbols, interval, depth } = req.body;
      
      if (!dataType || !symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ message: "Invalid stream configuration" });
      }

      wsService.connectConfigurableStream(dataType, symbols, interval, depth);
      res.json({ 
        message: "Stream configured successfully",
        configuration: { dataType, symbols, interval, depth }
      });
    } catch (error) {
      console.error("Error configuring stream:", error);
      res.status(500).json({ message: "Failed to configure stream" });
    }
  });

  // Market Data API
  app.get("/api/market", async (req, res) => {
    try {
      res.json(marketData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  return httpServer;
}
