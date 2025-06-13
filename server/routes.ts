import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExchangeSchema, insertTradingBotSchema, insertTradeSchema, insertUserSchema, insertUserSettingsSchema, updateUserSettingsSchema } from "@shared/schema";
import { z } from "zod";
import WebSocket, { WebSocketServer } from "ws";
import { requireAuth, AuthenticatedRequest, generateToken, hashPassword, comparePassword } from "./auth";
import { encryptApiCredentials, decryptApiCredentials } from "./encryption";
import { WebSocketService } from "./websocket-service";
import { BotLoggerManager } from "./bot-logger";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import config from "./config";

// Global WebSocket service instance
let wsService: WebSocketService;

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize WebSocket service with deployment-aware configuration
  if (config.websocket.useSeparatePort && !config.isDeployment) {
    // Development mode with separate WebSocket port to avoid Vite HMR conflicts
    const wsServer = createServer();
    wsService = new WebSocketService(wsServer);
    
    wsServer.listen(config.wsPort, config.host, () => {
      console.log(`[WEBSOCKET] Trading WebSocket server listening on port ${config.wsPort}`);
    });
  } else {
    // Production/deployment mode - use same HTTP server for WebSocket
    console.log(`[WEBSOCKET] Using shared HTTP server for WebSocket on port ${config.port}`);
    wsService = new WebSocketService(httpServer);
  }
  
  // All market data is now handled by the unified WebSocket server
  // Old ticker stream disabled to prevent conflicts
  
  // Configure trust proxy for Replit environment
  app.set('trust proxy', true);
  
  // Middleware to skip WebSocket routes from Express routing
  app.use('/api/ws', (req, res, next) => {
    if (req.headers.upgrade === 'websocket') {
      // This is a WebSocket upgrade request, skip Express routing
      return;
    }
    next();
  });
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: config.isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "https:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    } : false,
    crossOriginEmbedderPolicy: config.isProduction
  }));
  
  app.use(cors({
    origin: config.isProduction ? 
      (config.allowedOrigins.length > 0 ? config.allowedOrigins : true) : 
      true,
    credentials: true
  }));

  // Disabled rate limiting for development
  
  // Market data is now handled by the unified WebSocket service

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

  app.post("/api/auth/register", async (req, res) => {
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

  app.post("/api/auth/login", async (req, res) => {
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

  // User settings API
  app.get("/api/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const settings = await storage.getUserSettings(userId);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user settings" });
    }
  });

  app.put("/api/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const validatedSettings = updateUserSettingsSchema.parse(req.body);
      const updatedSettings = await storage.updateUserSettings(userId, validatedSettings);
      res.json(updatedSettings);
    } catch (error) {
      res.status(400).json({ error: "Invalid settings data" });
    }
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
      
      console.log('Exchange update request:', { id, userId, body: req.body });
      
      // Handle both direct fields and nested data object
      const requestData = req.body.data || req.body;
      const { name, apiKey, apiSecret, wsApiEndpoint, wsStreamEndpoint, restApiEndpoint, isTestnet, exchangeType } = requestData;
      
      // Verify exchange belongs to user
      const exchange = await storage.getExchangesByUserId(userId);
      const userExchange = exchange.find(ex => ex.id === id);
      if (!userExchange) {
        return res.status(404).json({ error: "Exchange not found" });
      }

      let updateData: any = {};
      
      // Update basic fields if provided (check for null vs undefined)
      if (name !== undefined && name !== null) updateData.name = name;
      if (wsApiEndpoint !== undefined) updateData.wsApiEndpoint = wsApiEndpoint;
      if (wsStreamEndpoint !== undefined) updateData.wsStreamEndpoint = wsStreamEndpoint;
      if (restApiEndpoint !== undefined) updateData.restApiEndpoint = restApiEndpoint;
      if (isTestnet !== undefined && isTestnet !== null) updateData.isTestnet = isTestnet;
      if (exchangeType !== undefined && exchangeType !== null) updateData.exchangeType = exchangeType;
      
      // If new API credentials provided, encrypt them
      if (apiKey && apiSecret) {
        const encryptedCredentials = encryptApiCredentials(apiKey, apiSecret);
        updateData = { ...updateData, ...encryptedCredentials };
      }
      
      console.log('Update data prepared:', updateData);
      
      // Only proceed with update if there's data to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No update data provided" });
      }
      
      const updatedExchange = await storage.updateExchange(id, updateData);
      res.json({
        ...updatedExchange,
        apiKey: updatedExchange.apiKey.slice(0, 4) + '•'.repeat(Math.max(8, updatedExchange.apiKey.length - 8)) + updatedExchange.apiKey.slice(-4),
        apiSecret: '•'.repeat(20),
        encryptionIv: undefined,
      });
    } catch (error) {
      console.error('Error updating exchange:', error);
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
      
      // For Martingale bots, validate order placement first before creating the bot
      if (botData.strategy === 'martingale' && botData.status === 'active') {
        console.log(`[MARTINGALE] Validating order placement before creating bot`);
        
        try {
          // Validate order placement without creating the bot yet
          await wsService.validateMartingaleOrderPlacement(botData);
          console.log(`[MARTINGALE] Order placement validation successful`);
          
        } catch (validationError) {
          console.error(`[MARTINGALE] Order placement validation failed:`, validationError);
          const errorMessage = validationError instanceof Error ? validationError.message : 'Order placement validation failed';
          return res.status(400).json({ 
            error: `Bot creation failed: ${errorMessage}`,
            details: errorMessage
          });
        }
      }
      
      // Create the bot in database only after validation succeeds
      const bot = await storage.createTradingBot(botData);
      
      // Initialize bot logger and log creation
      const logger = BotLoggerManager.getLogger(bot.id, bot.tradingPair);
      logger.logBotCreated(bot);
      
      // If it's a Martingale bot and active, start the first cycle
      if (bot.strategy === 'martingale' && bot.status === 'active') {
        console.log(`[MARTINGALE] Starting new bot cycle for bot ${bot.id}`);
        logger.logBotStarted();
        
        try {
          // Create initial bot cycle
          const cycle = await storage.createBotCycle({
            botId: bot.id,
            userId: userId,
            cycleNumber: 1,
            status: 'active',
            totalInvested: '0',
            maxSafetyOrders: bot.maxSafetyOrders
          });
          
          logger.logCycleStarted(1, cycle.id);
          
          console.log(`[MARTINGALE] Created initial cycle ${cycle.id} for bot ${bot.id}`);
          
          // Place the initial base order to start the cycle
          console.log(`[BOT CREATION] Calling placeInitialBaseOrder for bot ${bot.id}, cycle ${cycle.id}`);
          await wsService.placeInitialBaseOrder(bot.id, cycle.id);
          console.log(`[BOT CREATION] placeInitialBaseOrder completed for bot ${bot.id}`);
          
          // Update WebSocket market data subscription for the new trading pair
          await wsService.updateMarketSubscriptions([bot.tradingPair]);
          console.log(`[WEBSOCKET] Updated market data subscription to ${bot.tradingPair}`);
          
          // Mark bot as active after successful order placement
          await storage.updateTradingBot(bot.id, {
            status: 'active',
            isActive: true
          });
          console.log(`[MARTINGALE] Bot ${bot.id} marked as active after successful order placement`);
          
        } catch (cycleError) {
          console.error(`[MARTINGALE] Error creating initial cycle for bot ${bot.id}:`, cycleError);
          
          // Mark bot as failed instead of deleting it
          const errorMessage = cycleError instanceof Error ? cycleError.message : 'Failed to place initial order';
          await storage.updateTradingBot(bot.id, {
            status: 'failed',
            isActive: false,
            errorMessage: errorMessage
          });
          console.log(`[MARTINGALE] Marked bot ${bot.id} as failed due to order placement failure`);
          
          return res.status(500).json({ 
            error: `Bot creation failed: ${errorMessage}`,
            details: errorMessage,
            botId: bot.id // Return bot ID so UI can track it
          });
        }
      }
      
      res.json(bot);
    } catch (error) {
      console.error('Error creating trading bot:', error);
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

  // Enhanced stop bot endpoint with order cancellation and liquidation
  app.post("/api/bots/:id/stop", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const botId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Verify bot ownership
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Bot not found" });
      }

      console.log(`[BOT STOP] Starting enhanced stop process for bot ${botId}`);
      
      // Get active cycle and pending orders
      const activeCycle = await storage.getActiveBotCycle(botId);
      const pendingOrders = await storage.getPendingCycleOrders(botId);
      
      let cancelledOrders = 0;
      let liquidated = false;
      
      // Step 1: Cancel all pending safety orders
      if (pendingOrders.length > 0) {
        console.log(`[BOT STOP] Cancelling ${pendingOrders.length} pending orders for bot ${botId}`);
        
        for (const order of pendingOrders) {
          if (order.exchangeOrderId && order.status === 'placed') {
            try {
              // Cancel order on exchange
              await wsService.cancelOrder(bot.id, order.exchangeOrderId);
              
              // Update order status in database
              await storage.updateCycleOrder(order.id, { 
                status: 'cancelled',
                filledAt: new Date()
              });
              
              cancelledOrders++;
              console.log(`[BOT STOP] Cancelled order ${order.exchangeOrderId}`);
            } catch (cancelError) {
              console.error(`[BOT STOP] Failed to cancel order ${order.exchangeOrderId}:`, cancelError);
            }
          }
        }
      }
      
      // Step 2: Calculate total position to liquidate
      if (activeCycle && activeCycle.totalQuantity && parseFloat(activeCycle.totalQuantity) > 0) {
        const totalQuantity = parseFloat(activeCycle.totalQuantity);
        console.log(`[BOT STOP] Liquidating position: ${totalQuantity} ${bot.tradingPair?.replace('USDT', '')}`);
        
        try {
          // Place market sell order to liquidate position
          await wsService.placeLiquidationOrder(bot.id, activeCycle.id);
          liquidated = true;
          console.log(`[BOT STOP] Liquidation order placed for cycle ${activeCycle.id}`);
          
          // Complete the cycle
          await storage.completeBotCycle(activeCycle.id);
        } catch (liquidationError) {
          console.error(`[BOT STOP] Failed to liquidate position:`, liquidationError);
        }
      }
      
      // Step 3: Deactivate bot
      await storage.updateTradingBot(botId, {
        isActive: false,
        status: 'inactive'
      });
      
      // Log bot stop
      const logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      logger.logBotStopped(`Manual stop - ${cancelledOrders} orders cancelled${liquidated ? ', position liquidated' : ''}`);
      
      console.log(`[BOT STOP] Bot ${botId} stopped successfully. Cancelled: ${cancelledOrders} orders, Liquidated: ${liquidated}`);
      
      res.json({
        success: true,
        cancelledOrders,
        liquidated,
        message: `Bot stopped. ${cancelledOrders} orders cancelled${liquidated ? ', position liquidated' : ''}.`
      });
      
    } catch (error) {
      console.error('Error stopping trading bot:', error);
      res.status(500).json({ error: "Failed to stop trading bot" });
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
      
      // Get counts of related data before deletion
      const cycles = await storage.getBotCyclesByBotId(id);
      const orders = await storage.getCycleOrdersByBotId(id);
      const trades = await storage.getTradesByBotId(id);
      
      console.log(`[DELETE BOT] Deleting bot ${id} with ${cycles.length} cycles, ${orders.length} orders, ${trades.length} trades`);
      
      await storage.deleteTradingBot(id);
      
      res.json({ 
        success: true,
        deletedData: {
          cycles: cycles.length,
          orders: orders.length,
          trades: trades.length
        }
      });
    } catch (error) {
      console.error('Error deleting trading bot:', error);
      res.status(500).json({ error: "Failed to delete trading bot" });
    }
  });

  // Bot Cycles API - Secured
  app.get("/api/bot-cycles/:botId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const botId = parseInt(req.params.botId);
      
      // Verify bot belongs to user
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Trading bot not found" });
      }
      
      const cycles = await storage.getBotCyclesByBotId(botId);
      res.json(cycles);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bot cycles" });
    }
  });

  // Bot Orders API - Secured  
  app.get("/api/bot-orders/:botId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const botId = parseInt(req.params.botId);
      
      // Verify bot belongs to user
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Trading bot not found" });
      }
      
      const orders = await storage.getCycleOrdersByBotId(botId);
      
      // Sort orders by priority: Base order first, Take profit second, Safety orders last
      const sortedOrders = orders.sort((a, b) => {
        // Define order priority
        const orderPriority = {
          'base_order': 1,
          'take_profit': 2,
          'safety_order': 3
        };
        
        const aPriority = orderPriority[a.orderType as keyof typeof orderPriority] || 999;
        const bPriority = orderPriority[b.orderType as keyof typeof orderPriority] || 999;
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        // For safety orders, sort by creation time (first created = Safety Order 1)
        if (a.orderType === 'safety_order' && b.orderType === 'safety_order') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        
        return 0;
      });
      
      // Add display names for orders
      let safetyOrderCounter = 1;
      const ordersWithNames = sortedOrders.map(order => {
        let displayName = '';
        
        switch (order.orderType) {
          case 'base_order':
            displayName = 'Base Order';
            break;
          case 'take_profit':
            displayName = 'Take Profit';
            break;
          case 'safety_order':
            displayName = `Safety Order ${safetyOrderCounter}`;
            safetyOrderCounter++;
            break;
          default:
            displayName = order.orderType;
        }
        
        return {
          ...order,
          displayName
        };
      });
      
      console.log(`[API] Found ${orders.length} orders for bot ${botId}, sorted and named`);
      res.json(ordersWithNames);
    } catch (error) {
      console.error('Error fetching bot orders:', error);
      res.status(500).json({ error: "Failed to fetch bot orders" });
    }
  });

  // Get completed cycle profits for user - Secured
  app.get("/api/cycle-profits", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      const completedCycles = await storage.getBotCyclesByUserId(userId);
      const cycleProfits = completedCycles
        .filter(cycle => cycle.completedAt)
        .map(cycle => ({
          botId: cycle.botId,
          cycleProfit: parseFloat(cycle.cycleProfit || '0')
        }));
      
      res.json(cycleProfits);
    } catch (error) {
      console.error('Error fetching cycle profits:', error);
      res.status(500).json({ error: "Failed to fetch cycle profits" });
    }
  });

  // Get active bot symbols for WebSocket optimization - Secured
  app.get("/api/active-bot-symbols", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get all active bots for the user
      const bots = await storage.getTradingBotsByUserId(userId);
      const activeBots = bots.filter(bot => bot.status === 'running' || bot.status === 'active');
      
      // Extract unique trading pairs
      const tradingPairs = activeBots.map(bot => bot.tradingPair);
      const uniquePairs = new Set(tradingPairs);
      const symbols = Array.from(uniquePairs);
      
      console.log(`[API] Found ${symbols.length} active symbols for user ${userId}: ${symbols.join(', ')}`);
      res.json({ symbols });
    } catch (error) {
      console.error('Error fetching active bot symbols:', error);
      res.status(500).json({ error: "Failed to fetch active bot symbols" });
    }
  });

  // Get bot statistics (cycles completed, total P&L, total invested) - Secured
  app.get("/api/bot-stats", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const bots = await storage.getTradingBotsByUserId(userId);
      
      const botStats = await Promise.all(bots.map(async (bot) => {
        // Get completed cycles count
        const cycles = await storage.getBotCyclesByBotId(bot.id);
        const completedCycles = cycles.filter(cycle => cycle.status === 'completed');
        
        // Calculate total P&L from completed cycles
        const totalPnL = completedCycles.reduce((sum, cycle) => {
          return sum + parseFloat(cycle.cycleProfit || '0');
        }, 0);
        
        // Calculate total invested from all filled orders (base + safety orders)
        const allOrders = await storage.getCycleOrdersByBotId(bot.id);
        const filledOrders = allOrders.filter((order: any) => order.status === 'filled');
        const totalInvested = filledOrders.reduce((sum: number, order: any) => {
          const price = parseFloat(order.filledPrice || order.price || '0');
          const quantity = parseFloat(order.filledQuantity || order.quantity || '0');
          return sum + (price * quantity);
        }, 0);
        
        return {
          botId: bot.id,
          completedCycles: completedCycles.length,
          totalPnL,
          totalInvested
        };
      }));
      
      res.json(botStats);
    } catch (error) {
      console.error('Error fetching bot stats:', error);
      res.status(500).json({ error: "Failed to fetch bot stats" });
    }
  });

  // Bot logging API endpoints - Secured
  app.get("/api/bot-logs/:botId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const botId = parseInt(req.params.botId);
      
      // Verify bot belongs to user
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Bot not found" });
      }
      
      const lines = parseInt(req.query.lines as string) || 100;
      
      // Construct log file path directly
      const logFilePath = path.join(process.cwd(), 'logs', `bot_${botId}_${bot.tradingPair}.log`);
      
      try {
        // Read log file directly from filesystem
        const content = fs.readFileSync(logFilePath, 'utf8');
        const allLines = content.split('\n').filter(line => line.trim());
        const logs = allLines.slice(-lines);
        
        res.json({
          botId,
          tradingPair: bot.tradingPair,
          logFilePath,
          totalLines: allLines.length,
          logs
        });
      } catch (fileError) {
        // If file doesn't exist, return empty logs
        console.log(`No log file found for bot ${botId} at ${logFilePath}`);
        res.json({
          botId,
          tradingPair: bot.tradingPair,
          logFilePath,
          totalLines: 0,
          logs: []
        });
      }
    } catch (error) {
      console.error('Error fetching bot logs:', error);
      res.status(500).json({ error: "Failed to fetch bot logs" });
    }
  });

  app.get("/api/bot-logs/:botId/download", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const botId = parseInt(req.params.botId);
      
      // Verify bot belongs to user
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Bot not found" });
      }
      
      // Construct log file path directly
      const logFilePath = path.join(process.cwd(), 'logs', `bot_${botId}_${bot.tradingPair}.log`);
      
      // Check if file exists
      if (!fs.existsSync(logFilePath)) {
        return res.status(404).json({ error: "Log file not found" });
      }
      
      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="bot_${botId}_${bot.tradingPair}.log"`);
      res.setHeader('Content-Type', 'text/plain');
      
      // Send file
      res.sendFile(path.resolve(logFilePath));
    } catch (error) {
      console.error('Error downloading bot logs:', error);
      res.status(500).json({ error: "Failed to download bot logs" });
    }
  });

  app.delete("/api/bot-logs/:botId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const botId = parseInt(req.params.botId);
      
      // Verify bot belongs to user
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Bot not found" });
      }
      
      // Construct log file path directly
      const logFilePath = path.join(process.cwd(), 'logs', `bot_${botId}_${bot.tradingPair}.log`);
      
      try {
        // Clear the log file by writing empty content
        fs.writeFileSync(logFilePath, '');
        console.log(`Cleared log file for bot ${botId}: ${logFilePath}`);
      } catch (fileError) {
        console.log(`No log file to clear for bot ${botId}: ${logFilePath}`);
      }
      
      res.json({ success: true, message: "Bot logs cleared successfully" });
    } catch (error) {
      console.error('Error clearing bot logs:', error);
      res.status(500).json({ error: "Failed to clear bot logs" });
    }
  });

  // System logs API - Secured  
  app.get("/api/system-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const systemLogPath = path.join(process.cwd(), 'logs', 'system.log');
      const lines = parseInt(req.query.lines as string) || 100;
      
      if (!fs.existsSync(systemLogPath)) {
        return res.json({ logs: [], totalLines: 0 });
      }
      
      const content = fs.readFileSync(systemLogPath, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      const logs = allLines.slice(-lines);
      
      res.json({
        totalLines: logs.length,
        logs
      });
    } catch (error) {
      console.error('Error fetching system logs:', error);
      res.status(500).json({ error: "Failed to fetch system logs" });
    }
  });

  // Individual bot API - Secured
  app.get("/api/bots/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const botId = parseInt(req.params.id);
      
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Trading bot not found" });
      }
      
      res.json(bot);
    } catch (error) {
      console.error('Error fetching individual bot:', error);
      res.status(500).json({ error: "Failed to fetch bot" });
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

  // Configure stream connection - Public endpoint for market data configuration
  app.post("/api/websocket/configure-stream", async (req: Request, res: Response) => {
    try {
      const { dataType, symbol, symbols, interval, depth } = req.body;
      
      // Handle both single symbol and legacy symbols array for backward compatibility
      const symbolsArray = symbol ? [symbol] : (symbols || []);
      
      if (!dataType || !symbolsArray || symbolsArray.length === 0) {
        return res.status(400).json({ message: "Invalid stream configuration" });
      }

      await wsService.connectConfigurableStream(1, dataType);
      res.json({ 
        message: "Stream configured successfully",
        configuration: { dataType, symbols: symbolsArray, interval, depth }
      });
    } catch (error) {
      console.error("Error configuring stream:", error);
      res.status(500).json({ message: "Failed to configure stream" });
    }
  });

  // Manual cycle trigger for debugging (temporary endpoint)
  app.post("/api/bots/:id/trigger-cycle", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const botId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Get the bot and verify ownership
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        return res.status(404).json({ error: "Bot not found" });
      }
      
      // Get the latest active cycle
      const activeCycle = await storage.getActiveBotCycle(botId);
      if (!activeCycle) {
        return res.status(400).json({ error: "No active cycle found" });
      }
      
      // Trigger base order placement
      await wsService.placeInitialBaseOrder(botId, activeCycle.id);
      
      res.json({ 
        message: "Cycle triggered successfully",
        cycleId: activeCycle.id,
        cycleNumber: activeCycle.cycleNumber
      });
      
    } catch (error: any) {
      console.error("Error triggering cycle:", error);
      res.status(500).json({ error: error.message || "Failed to trigger cycle" });
    }
  });

  // Get available balance for trading pair
  // Order placement endpoint
  app.post("/api/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { exchangeId, symbol, side, orderType, quantity, price, timeInForce } = req.body;
      const userId = req.user!.id;

      // Validate required fields
      if (!exchangeId || !symbol || !side || !orderType || !quantity) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing required fields" 
        });
      }

      if (orderType === 'LIMIT' && !price) {
        return res.status(400).json({ 
          success: false, 
          error: "Price required for limit orders" 
        });
      }

      // Get exchange configuration
      const exchanges = await storage.getExchangesByUserId(userId);
      const exchange = exchanges.find(ex => ex.id === parseInt(exchangeId));
      
      if (!exchange) {
        return res.status(404).json({ 
          success: false, 
          error: "Exchange not found" 
        });
      }

      // For development, simulate order placement
      const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const currentPrice = price || "106870.03"; // Use provided price or mock market price
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      // Simulate occasional failures (5% chance)
      if (Math.random() < 0.05) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient balance or market conditions'
        });
      }

      // Store trade record in database
      await storage.createTrade({
        userId: userId,
        botId: null,
        tradingPair: symbol,
        side: side.toLowerCase(),
        orderType: orderType.toLowerCase(),
        orderCategory: "manual",
        amount: quantity,
        quoteAmount: orderType === 'MARKET' ? 
          (parseFloat(quantity) * parseFloat(currentPrice)).toFixed(8) : 
          (parseFloat(quantity) * parseFloat(price || currentPrice)).toFixed(8),
        price: currentPrice,
        status: orderType === 'MARKET' ? 'filled' : 'filled', // Simulate immediate fill for demo
        pnl: "0",
        fee: (parseFloat(quantity) * 0.001).toFixed(8), // 0.1% fee
        feeAsset: "USDT",
        exchangeOrderId: orderId
      });

      // Return successful response
      res.json({
        success: true,
        orderId: orderId,
        symbol: symbol,
        side: side,
        quantity: quantity,
        price: currentPrice,
        status: orderType === 'MARKET' ? 'FILLED' : 'FILLED',
        fee: (parseFloat(quantity) * 0.001).toFixed(8),
        feeAsset: "USDT"
      });

    } catch (error) {
      console.error('Error placing order:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      });
    }
  });

  app.get("/api/exchanges/:exchangeId/balance/:symbol", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { exchangeId, symbol } = req.params;
      const userId = req.user!.id;

      // Get exchange credentials
      const exchanges = await storage.getExchangesByUserId(userId);
      const targetExchange = exchanges.find(ex => ex.id === parseInt(exchangeId));
      
      if (!targetExchange) {
        return res.status(404).json({ error: "Exchange not found" });
      }

      // For direct USDT requests, use symbol as-is, otherwise extract quote currency
      const quoteCurrency = symbol === 'USDT' ? 'USDT' : symbol.replace(/^[A-Z]+/, '');
      
      try {
        // Fetch real balance from Binance API using WebSocket service
        const balanceData = await wsService.getAccountBalance(parseInt(exchangeId), quoteCurrency);
        
        if (balanceData && balanceData.balances) {
          // Find the specific asset balance
          const assetBalance = balanceData.balances.find((balance: any) => balance.asset === quoteCurrency);
          
          if (assetBalance) {
            return res.json({
              asset: quoteCurrency,
              free: assetBalance.free,
              locked: assetBalance.locked
            });
          }
        }
        
        // If asset not found in balances, return zero
        return res.json({
          asset: quoteCurrency,
          free: '0.00000000',
          locked: '0.00000000'
        });
        
      } catch (apiError) {
        console.error("Error fetching real balance:", apiError);
        
        // Fallback to testnet mock data only if real API fails
        if (targetExchange.isTestnet) {
          const mockBalances: Record<string, string> = {
            'USDT': '127247.18000000',
            'BTC': '0.05000000',
            'ETH': '2.50000000',
            'BNB': '10.00000000'
          };
          
          const availableBalance = mockBalances[quoteCurrency] || '0.00000000';
          return res.json({ 
            asset: quoteCurrency,
            free: availableBalance,
            locked: '0.00000000'
          });
        }
        
        throw apiError;
      }
    } catch (error) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // Market Data API - REMOVED: Using WebSocket-only communication

  // Markets API - Fetch trading pairs from Binance
  app.get("/api/markets", async (req, res) => {
    const { quote } = req.query;
    
    try {
      // Use alternative endpoints or generate market data based on common trading pairs
      const commonMarkets = [
        // USDT pairs
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'MATICUSDT', baseAsset: 'MATIC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'LTCUSDT', baseAsset: 'LTC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'UNIUSDT', baseAsset: 'UNI', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ATOMUSDT', baseAsset: 'ATOM', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ICPUSDT', baseAsset: 'ICP', quoteAsset: 'USDT', status: 'TRADING' },
        
        // USDC pairs
        { symbol: 'BTCUSDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'TRADING' },
        { symbol: 'ETHUSDC', baseAsset: 'ETH', quoteAsset: 'USDC', status: 'TRADING' },
        { symbol: 'ADAUSDC', baseAsset: 'ADA', quoteAsset: 'USDC', status: 'TRADING' },
        { symbol: 'BNBUSDC', baseAsset: 'BNB', quoteAsset: 'USDC', status: 'TRADING' },
        { symbol: 'SOLUSDC', baseAsset: 'SOL', quoteAsset: 'USDC', status: 'TRADING' },
        { symbol: 'AVAXUSDC', baseAsset: 'AVAX', quoteAsset: 'USDC', status: 'TRADING' },
        
        // BTC pairs
        { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC', status: 'TRADING' },
        { symbol: 'ADABTC', baseAsset: 'ADA', quoteAsset: 'BTC', status: 'TRADING' },
        { symbol: 'BNBBTC', baseAsset: 'BNB', quoteAsset: 'BTC', status: 'TRADING' },
        { symbol: 'DOGEBTC', baseAsset: 'DOGE', quoteAsset: 'BTC', status: 'TRADING' },
        { symbol: 'LTCBTC', baseAsset: 'LTC', quoteAsset: 'BTC', status: 'TRADING' },
        { symbol: 'XRPBTC', baseAsset: 'XRP', quoteAsset: 'BTC', status: 'TRADING' }
      ];
      
      let markets = commonMarkets;
      
      // Filter by quote currency if specified
      if (quote && typeof quote === 'string') {
        markets = markets.filter((market: any) => 
          market.quoteAsset === quote.toUpperCase()
        );
      }
      
      // Format for frontend with additional market data
      const formattedMarkets = markets.map((market: any) => ({
        symbol: market.symbol,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        status: market.status,
        baseAssetPrecision: 8,
        quotePrecision: 8,
        quoteAssetPrecision: 8,
        orderTypes: ['LIMIT', 'MARKET'],
        icebergAllowed: true,
        ocoAllowed: true,
        isSpotTradingAllowed: true,
        isMarginTradingAllowed: false,
        displayName: `${market.baseAsset}/${market.quoteAsset}`
      }));
      
      // Sort by symbol name for consistent display
      formattedMarkets.sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));
      
      res.json({
        quote: quote || 'ALL',
        count: formattedMarkets.length,
        markets: formattedMarkets
      });
    } catch (error) {
      console.error("Error fetching markets:", error);
      res.status(500).json({ 
        error: "Failed to fetch markets data",
        quote: quote || 'ALL',
        count: 0,
        markets: []
      });
    }
  });

  // Historical klines data endpoint
  app.get("/api/klines", async (req, res) => {
    try {
      const { symbol = 'BTCUSDT', interval = '1m', limit = 100 } = req.query;
      
      // Fetch historical data from Binance testnet
      const binanceUrl = `https://testnet.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      
      const response = await fetch(binanceUrl);
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const rawData = await response.json();
      
      // Transform to match expected format
      const klineData = rawData.map((item: any[]) => ({
        openTime: parseInt(item[0]),
        closeTime: parseInt(item[6]),
        open: item[1],
        high: item[2],
        low: item[3],
        close: item[4],
        volume: item[5],
        trades: parseInt(item[8]),
        quoteVolume: item[7],
        isFinal: true
      }));
      
      res.json(klineData);
    } catch (error) {
      console.error("Failed to fetch klines:", error);
      res.status(500).json({ error: "Failed to fetch historical data" });
    }
  });

  // Demo Martingale Strategy Logging - No auth required for demonstration
  app.get("/api/demo-martingale", async (req: Request, res: Response) => {
    try {
      // Use hardcoded bot configuration for demonstration
      const bot = {
        id: 1,
        name: "Demo Martingale Bot - ETHUSDT",
        tradingPair: "ETHUSDT",
        direction: "long",
        baseOrderAmount: "7.5",
        takeProfitPercentage: "2.0",
        maxSafetyOrders: "3",
        priceDeviation: "1.5",
        priceDeviationMultiplier: "1.5"
      };
      
      console.log(`[MARTINGALE STRATEGY] ===== STARTING BOT EXECUTION DEMO =====`);
      console.log(`[MARTINGALE STRATEGY] Bot ID: ${bot.id}, User ID: 1`);
      console.log(`[MARTINGALE STRATEGY] ✓ Bot loaded: ${bot.name} (${bot.tradingPair}, ${bot.direction})`);
      
      // Get current market price
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${bot.tradingPair}`);
      const priceData = await response.json();
      const currentPrice = parseFloat(priceData.price);
      
      console.log(`[MARTINGALE STRATEGY] ===== STARTING BASE ORDER EXECUTION =====`);
      console.log(`[MARTINGALE STRATEGY] Bot ID: ${bot.id}, Cycle ID: 1`);
      console.log(`[MARTINGALE STRATEGY] 📊 BASE ORDER CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Investment Amount: $${bot.baseOrderAmount}`);
      console.log(`[MARTINGALE STRATEGY]    Current Price: $${currentPrice}`);
      
      const baseQuantity = parseFloat(bot.baseOrderAmount) / currentPrice;
      console.log(`[MARTINGALE STRATEGY]    Calculated Quantity: ${baseQuantity.toFixed(8)} ${bot.tradingPair.replace('USDT', '')}`);
      
      console.log(`[MARTINGALE STRATEGY] ✅ BASE ORDER SUCCESSFULLY PLACED!`);
      console.log(`[MARTINGALE STRATEGY]    Order ID: DEMO_${Date.now()}`);
      console.log(`[MARTINGALE STRATEGY]    Quantity: ${baseQuantity.toFixed(8)}`);
      console.log(`[MARTINGALE STRATEGY]    Price: $${currentPrice}`);
      
      // Calculate and display take profit order
      console.log(`[MARTINGALE STRATEGY] ===== PLACING TAKE PROFIT ORDER =====`);
      
      const takeProfitPercentage = parseFloat(bot.takeProfitPercentage);
      const takeProfitPrice = bot.direction === 'long' 
        ? currentPrice * (1 + takeProfitPercentage / 100)
        : currentPrice * (1 - takeProfitPercentage / 100);
      
      console.log(`[MARTINGALE STRATEGY] 📊 TAKE PROFIT CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Take Profit %: ${takeProfitPercentage}%`);
      console.log(`[MARTINGALE STRATEGY]    Target Price: $${takeProfitPrice.toFixed(4)}`);
      console.log(`[MARTINGALE STRATEGY]    Expected Profit: $${(baseQuantity * (takeProfitPrice - currentPrice)).toFixed(4)}`);
      
      console.log(`[MARTINGALE STRATEGY] ✅ TAKE PROFIT ORDER PLACED!`);
      console.log(`[MARTINGALE STRATEGY]    Order ID: DEMO_TP_${Date.now()}`);
      
      // Set up safety orders demonstration
      console.log(`[MARTINGALE STRATEGY] ===== SETTING UP SAFETY ORDER MONITORING =====`);
      
      const maxSafetyOrders = parseInt(bot.maxSafetyOrders);
      const priceDeviation = parseFloat(bot.priceDeviation);
      const deviationMultiplier = parseFloat(bot.priceDeviationMultiplier);
      
      console.log(`[MARTINGALE STRATEGY] 📊 SAFETY ORDER CONFIGURATION:`);
      console.log(`[MARTINGALE STRATEGY]    Max Safety Orders: ${maxSafetyOrders}`);
      console.log(`[MARTINGALE STRATEGY]    Price Deviation: ${priceDeviation}%`);
      console.log(`[MARTINGALE STRATEGY]    Deviation Multiplier: ${deviationMultiplier}x`);
      
      for (let i = 1; i <= maxSafetyOrders; i++) {
        const deviationPercent = priceDeviation * Math.pow(deviationMultiplier, i - 1);
        const triggerPrice = bot.direction === 'long' 
          ? currentPrice * (1 - deviationPercent / 100)
          : currentPrice * (1 + deviationPercent / 100);
        
        console.log(`[MARTINGALE STRATEGY]    Safety Order ${i}: Trigger at $${triggerPrice.toFixed(4)} (${deviationPercent.toFixed(2)}% deviation)`);
      }
      
      console.log(`[MARTINGALE STRATEGY] ===== STRATEGY EXECUTION COMPLETE =====`);
      console.log(`[MARTINGALE STRATEGY] Bot is now monitoring market conditions for order execution`);
      
      res.json({
        success: true,
        botId: bot.id,
        symbol: bot.tradingPair,
        basePrice: currentPrice,
        takeProfitPrice: takeProfitPrice,
        message: 'Martingale strategy demonstration completed - check server logs'
      });
      
    } catch (error) {
      console.error('Error testing Martingale strategy:', error);
      res.status(500).json({ error: 'Failed to test Martingale strategy' });
    }
  });

  // Market data is now served through WebSocket-only communication
  // Frontend connects directly to the main WebSocket service

  return httpServer;
}
