import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExchangeSchema, insertTradingBotSchema, insertTradeSchema, insertUserSchema, insertUserSettingsSchema, updateUserSettingsSchema } from "@shared/schema";
import { z } from "zod";
import WebSocket, { WebSocketServer } from "ws";
import { requireAuth, AuthenticatedRequest, generateToken, hashPassword, comparePassword } from "./auth";
import { encryptApiCredentials, decryptApiCredentials } from "./encryption";
import { WebSocketService, setGlobalWebSocketService } from "./websocket";
import { BotLoggerManager } from "./bot-logger";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import config from "./config";

// Global WebSocket service instance
let wsService: WebSocketService;

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize WebSocket service with deployment-aware configuration
  if (config.websocket.useSeparatePort && !config.isDeployment) {
    // Development mode with separate WebSocket port to avoid Vite HMR conflicts
    const wsServer = createServer();
    wsService = new WebSocketService();
    wsService.init(wsServer, '/api/ws');
    setGlobalWebSocketService(wsService); // Set global reference
    
    wsServer.listen(config.wsPort, config.host, () => {
      console.log(`[UNIFIED WS] [WEBSOCKET] Trading WebSocket server listening on port ${config.wsPort}`);
    });
  } else {
    // Production/deployment mode - use same HTTP server for WebSocket
    console.log(`[UNIFIED WS] [WEBSOCKET] Using shared HTTP server for WebSocket on port ${config.port}`);
    wsService = new WebSocketService();
    wsService.init(httpServer, '/api/ws');
    setGlobalWebSocketService(wsService); // Set global reference
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
          // TODO: Move to TradingOperationsManager
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
      
      // Broadcast bot creation to all connected clients
      console.log(`[WEBSOCKET] Broadcasting bot creation for bot ${bot.id}`);
      wsService.broadcastBotDataUpdate({
        action: 'created',
        bot: bot
      });
      
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
          
          // Broadcast cycle creation
          wsService.broadcastBotCycleUpdate({
            action: 'created',
            cycle: cycle
          });
          
          // Place the initial base order to start the cycle
          console.log(`[BOT CREATION] Calling placeInitialBaseOrder for bot ${bot.id}, cycle ${cycle.id}`);
          // TODO: Move to TradingOperationsManager
          await wsService.placeInitialBaseOrder(bot.id, cycle.id);
          console.log(`[BOT CREATION] placeInitialBaseOrder completed for bot ${bot.id}`);
          
          // Update WebSocket market data subscription for the new trading pair
          // TODO: Handle market subscriptions in new architecture
          await wsService.updateMarketSubscriptions([bot.tradingPair]);
          console.log(`[WEBSOCKET] Updated market data subscription to ${bot.tradingPair}`);
          
          // Mark bot as active after successful order placement
          await storage.updateTradingBot(bot.id, {
            status: 'active',
            isActive: true
          });
          console.log(`[MARTINGALE] Bot ${bot.id} marked as active after successful order placement`);
          
          // Broadcast bot status update
          wsService.broadcastBotStatusUpdate({
            botId: bot.id,
            status: 'active',
            isActive: true,
            message: 'Bot started successfully'
          });
          
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
          
          // Broadcast bot failure status
          wsService.broadcastBotStatusUpdate({
            botId: bot.id,
            status: 'failed',
            isActive: false,
            message: errorMessage
          });
          
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
      
      // Broadcast bot update to all connected clients
      console.log(`[WEBSOCKET] Broadcasting bot update for bot ${id}`);
      wsService.broadcastBotDataUpdate({
        action: 'updated',
        bot: updatedBot
      });
      
      // If status was updated, also broadcast status change
      if (updateData.status || updateData.isActive !== undefined) {
        wsService.broadcastBotStatusUpdate({
          botId: id,
          status: updatedBot.status,
          isActive: updatedBot.isActive,
          message: 'Bot status updated'
        });
      }
      
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
      
      console.log(`\n[BOT STOP] ===== STARTING BOT STOP PROCESS =====`);
      console.log(`[BOT STOP] 🛑 Bot ID: ${botId}, User ID: ${userId}`);
      console.log(`[BOT STOP] 📝 Request Details: ${JSON.stringify({ botId, userId, timestamp: new Date().toISOString() })}`);
      
      // Verify bot ownership
      const bot = await storage.getTradingBot(botId);
      if (!bot || bot.userId !== userId) {
        console.log(`[BOT STOP] ❌ AUTHORIZATION FAILED - Bot ${botId} not found or access denied for user ${userId}`);
        return res.status(404).json({ error: "Bot not found" });
      }

      console.log(`[BOT STOP] ✅ AUTHORIZATION PASSED - Bot Details:`);
      console.log(`[BOT STOP]    Name: ${bot.name}`);
      console.log(`[BOT STOP]    Trading Pair: ${bot.tradingPair}`);
      console.log(`[BOT STOP]    Strategy: ${bot.strategy}`);
      console.log(`[BOT STOP]    Current Status: ${bot.status}`);
      console.log(`[BOT STOP]    Is Active: ${bot.isActive}`);
      console.log(`[BOT STOP]    Exchange ID: ${bot.exchangeId}`);
      
      // Get active cycle and cancellable orders
      const activeCycle = await storage.getActiveBotCycle(botId);
      
      // Get ALL orders for this bot and filter cancellable ones
      const allBotOrders = await storage.getCycleOrdersByBotId(botId);
      const cancellableOrders = allBotOrders.filter(order => 
        order.exchangeOrderId && 
        !['filled', 'cancelled', 'failed'].includes(order.status)
      );
      console.log(`[BOT STOP] � DEBUG - ALL ORDERS FOR BOT ${botId}:`);
      if (allBotOrders.length > 0) {
        allBotOrders.forEach((order, index) => {
          console.log(`[BOT STOP]      ${index + 1}. Order ${order.id} - ${order.orderType} (${order.side}) - Status: ${order.status} - Exchange ID: ${order.exchangeOrderId || 'N/A'} - Created: ${order.createdAt}`);
        });
      } else {
        console.log(`[BOT STOP]      No orders found in database for bot ${botId}`);
      }
      
      console.log(`[BOT STOP] �📊 CURRENT BOT STATE:`);
      console.log(`[BOT STOP]    Active Cycle: ${activeCycle ? `#${activeCycle.id} (${activeCycle.cycleNumber})` : 'none'}`);
      console.log(`[BOT STOP]    Total Orders: ${allBotOrders.length}`);
      console.log(`[BOT STOP]    Cancellable Orders: ${cancellableOrders.length}`);
      
      if (cancellableOrders.length > 0) {
        console.log(`[BOT STOP] 📋 CANCELLABLE ORDERS TO CANCEL:`);
        cancellableOrders.forEach((order, index) => {
          console.log(`[BOT STOP]      ${index + 1}. Order ${order.id} (${order.orderType}) - ${order.status} - Exchange ID: ${order.exchangeOrderId || 'N/A'}`);
        });
      }
      
      let cancelledOrders = 0;
      let liquidated = false;
      
      // Step 1: Cancel all cancellable safety orders using the same proven logic as Trading page
      if (cancellableOrders.length > 0) {
        console.log(`[BOT STOP] 🚫 ===== STARTING ORDER CANCELLATION =====`);
        console.log(`[BOT STOP] 🚫 Using Trading page logic to cancel ${cancellableOrders.length} cancellable orders for bot ${botId}`);
        
        const cancelErrors: string[] = [];
        
        for (const order of cancellableOrders) {
          if (order.exchangeOrderId) {
            try {
              console.log(`[BOT STOP] 🚫 Cancelling order ${order.exchangeOrderId} (Order ID: ${order.id}, Type: ${order.orderType}, Status: ${order.status})`);
              
              // Use the same proven cancellation logic as Trading page
              await wsService.getTradingOperationsManager().cancelManualOrder(
                bot.exchangeId, 
                order.exchangeOrderId, 
                bot.tradingPair
              );
              
              // Update order status in database
              await storage.updateCycleOrder(order.id, { 
                status: 'cancelled',
                filledAt: new Date()
              });
              
              cancelledOrders++;
              console.log(`[BOT STOP] ✅ Order ${order.exchangeOrderId} cancelled successfully`);
              
            } catch (orderError) {
              const errorMsg = `Failed to cancel order ${order.exchangeOrderId}: ${orderError instanceof Error ? orderError.message : 'Unknown error'}`;
              cancelErrors.push(errorMsg);
              console.error(`[BOT STOP] ❌ ${errorMsg}`);
            }
          } else {
            console.warn(`[BOT STOP] ⚠️ Skipping order ${order.id} - no exchange order ID`);
          }
        }
        
        console.log(`[BOT STOP] ✅ ORDER CANCELLATION COMPLETED:`);
        console.log(`[BOT STOP]    Total Orders Processed: ${cancellableOrders.length}`);
        console.log(`[BOT STOP]    Successfully Cancelled: ${cancelledOrders} orders`);
        console.log(`[BOT STOP]    Failed to Cancel: ${cancelErrors.length} orders`);
        
        if (cancelErrors.length > 0) {
          console.warn(`[BOT STOP] ⚠️ CANCELLATION ERRORS:`);
          cancelErrors.forEach((error, index) => {
            console.warn(`[BOT STOP]      ${index + 1}. ${error}`);
          });
        }
      } else {
        console.log(`[BOT STOP] ℹ️ No cancellable orders to cancel for bot ${botId}`);
      }
      
      // Step 2: Calculate total position to liquidate
      console.log(`[BOT STOP] 💰 ===== CHECKING POSITION FOR LIQUIDATION =====`);
      if (activeCycle && activeCycle.totalQuantity && parseFloat(activeCycle.totalQuantity) > 0) {
        const totalQuantity = parseFloat(activeCycle.totalQuantity);
        console.log(`[BOT STOP] 💰 POSITION FOUND TO LIQUIDATE:`);
        console.log(`[BOT STOP]    Quantity: ${totalQuantity} ${bot.tradingPair?.replace('USDT', '')}`);
        console.log(`[BOT STOP]    Cycle: #${activeCycle.id} (${activeCycle.cycleNumber})`);
        console.log(`[BOT STOP]    Estimated Value: Calculating from orders...`);
        
        try {
          // Place market sell order to liquidate position
          console.log(`[BOT STOP] 🔴 Initiating liquidation order...`);
          await wsService.getTradingOperationsManager().placeLiquidationOrder(bot.id, activeCycle.id);
          liquidated = true;
          console.log(`[BOT STOP] ✅ LIQUIDATION COMPLETED - Position successfully liquidated for cycle ${activeCycle.id}`);
          
          // Complete the cycle
          await storage.completeBotCycle(activeCycle.id);
          console.log(`[BOT STOP] ✅ CYCLE COMPLETED - Cycle ${activeCycle.id} marked as completed`);
        } catch (liquidationError) {
          console.error(`[BOT STOP] ❌ LIQUIDATION FAILED:`, liquidationError);
          console.error(`[BOT STOP] ❌ Liquidation Error Details:`, {
            message: liquidationError instanceof Error ? liquidationError.message : 'Unknown error',
            stack: liquidationError instanceof Error ? liquidationError.stack : 'No stack trace'
          });
        }
      } else {
        console.log(`[BOT STOP] ℹ️ NO POSITION TO LIQUIDATE:`);
        if (!activeCycle) {
          console.log(`[BOT STOP]    Reason: No active cycle found`);
        } else if (!activeCycle.totalQuantity) {
          console.log(`[BOT STOP]    Reason: No quantity in active cycle`);
        } else {
          console.log(`[BOT STOP]    Reason: Zero quantity (${activeCycle.totalQuantity})`);
        }
      }
      
      // Step 3: Deactivate bot
      console.log(`[BOT STOP] 🔄 ===== DEACTIVATING BOT =====`);
      console.log(`[BOT STOP] 🔄 Updating bot ${botId} status...`);
      await storage.updateTradingBot(botId, {
        isActive: false,
        status: 'inactive'
      });
      console.log(`[BOT STOP] ✅ BOT DEACTIVATED - Bot ${botId} status updated to inactive`);
      
      // Clean up any pending cycle start timers for stopped bot
      console.log(`[BOT STOP] 🧹 ===== CLEANING UP RESOURCES =====`);
      console.log(`[BOT STOP] 🧹 Cleaning up pending timers and resources for bot ${botId}...`);
      await wsService.getTradingOperationsManager().cleanupBot(botId);
      console.log(`[BOT STOP] ✅ CLEANUP COMPLETED - All resources cleaned up for bot ${botId}`);
      
      // Log bot stop
      const logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      const stopMessage = `Manual stop - ${cancelledOrders} orders cancelled${liquidated ? ', position liquidated' : ''}`;
      logger.logBotStopped(stopMessage);
      console.log(`[BOT STOP] 📝 LOGGED - Bot stop event recorded: ${stopMessage}`);
      
      // Broadcast bot stop status to all connected clients
      console.log(`[BOT STOP] 📡 ===== BROADCASTING STATUS UPDATES =====`);
      console.log(`[BOT STOP] 📡 Broadcasting bot stop status to WebSocket clients...`);
      wsService.broadcastBotStatusUpdate({
        botId: botId,
        status: 'inactive',
        isActive: false,
        message: `Bot stopped - ${cancelledOrders} orders cancelled${liquidated ? ', position liquidated' : ''}`
      });
      
      // Also broadcast general bot data update
      const updatedBot = await storage.getTradingBot(botId);
      wsService.broadcastBotDataUpdate({
        action: 'stopped',
        bot: updatedBot
      });
      
      console.log(`[BOT STOP] ✅ WEBSOCKET BROADCASTS COMPLETED`);
      
      const responseMessage = `Bot stopped successfully - ${cancelledOrders} orders cancelled${liquidated ? ', position liquidated' : ''}`;
      console.log(`[BOT STOP] ===== BOT STOP PROCESS COMPLETED =====`);
      console.log(`[BOT STOP] 📊 FINAL SUMMARY:`);
      console.log(`[BOT STOP]    Bot ID: ${botId}`);
      console.log(`[BOT STOP]    Orders Cancelled: ${cancelledOrders}`);
      console.log(`[BOT STOP]    Position Liquidated: ${liquidated ? 'YES' : 'NO'}`);
      console.log(`[BOT STOP]    Final Status: inactive`);
      console.log(`[BOT STOP]    Response: ${responseMessage}`);
      console.log(`[BOT STOP] ===== PROCESS COMPLETE =====\n`);
      
      res.json({
        success: true,
        cancelledOrders,
        liquidated,
        message: responseMessage
      });
      
    } catch (error) {
      console.error('\n[BOT STOP] ===== CRITICAL ERROR =====');
      console.error('[BOT STOP] ❌ Error stopping trading bot:', error);
      console.error('[BOT STOP] ❌ Error Details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      console.error('[BOT STOP] ===== ERROR END =====\n');
      res.status(500).json({ error: "Failed to stop trading bot" });
    }
  });

  app.delete("/api/bots/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log(`\n[DELETE BOT] 🔥 ===== ENDPOINT HIT - REQUEST RECEIVED =====`);
    console.log(`[DELETE BOT] 🔥 Request method: ${req.method}`);
    console.log(`[DELETE BOT] 🔥 Request URL: ${req.url}`);
    console.log(`[DELETE BOT] 🔥 Request params:`, req.params);
    console.log(`[DELETE BOT] 🔥 Request headers:`, req.headers);
    console.log(`[DELETE BOT] 🔥 User from auth:`, req.user);
    
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      
      console.log(`\n[DELETE BOT] ===== STARTING BOT DELETION PROCESS =====`);
      console.log(`[DELETE BOT] 🗑️ Bot ID: ${id}, User ID: ${userId}`);
      console.log(`[DELETE BOT] 📝 Request Details: ${JSON.stringify({ botId: id, userId, timestamp: new Date().toISOString() })}`);
      
      // Verify bot belongs to user
      const bot = await storage.getTradingBot(id);
      if (!bot || bot.userId !== userId) {
        console.log(`[DELETE BOT] ❌ AUTHORIZATION FAILED - Bot ${id} not found or access denied for user ${userId}`);
        return res.status(404).json({ error: "Trading bot not found" });
      }
      
      console.log(`[DELETE BOT] ✅ AUTHORIZATION PASSED - Bot Details:`);
      console.log(`[DELETE BOT]    Name: ${bot.name}`);
      console.log(`[DELETE BOT]    Trading Pair: ${bot.tradingPair}`);
      console.log(`[DELETE BOT]    Strategy: ${bot.strategy}`);
      console.log(`[DELETE BOT]    Current Status: ${bot.status}`);
      console.log(`[DELETE BOT]    Is Active: ${bot.isActive}`);
      console.log(`[DELETE BOT]    Exchange ID: ${bot.exchangeId}`);
      
      // Get counts of related data before deletion
      const cycles = await storage.getBotCyclesByBotId(id);
      const orders = await storage.getCycleOrdersByBotId(id);
      const trades = await storage.getTradesByBotId(id);
      
      console.log(`[DELETE BOT] 📊 DATA TO BE DELETED:`);
      console.log(`[DELETE BOT]    Bot Cycles: ${cycles.length}`);
      console.log(`[DELETE BOT]    Cycle Orders: ${orders.length}`);
      console.log(`[DELETE BOT]    Trades: ${trades.length}`);
      
      // Get active cycle and cancellable orders for cancellation
      const activeCycle = await storage.getActiveBotCycle(id);
      
      // Get ALL orders for this bot and filter cancellable ones
      const allBotOrders = await storage.getCycleOrdersByBotId(id);
      const cancellableOrders = allBotOrders.filter(order => 
        order.exchangeOrderId && 
        !['filled', 'cancelled', 'failed'].includes(order.status)
      );
      console.log(`[DELETE BOT] 🔍 DEBUG - ALL ORDERS FOR BOT ${id}:`);
      if (allBotOrders.length > 0) {
        allBotOrders.forEach((order, index) => {
          console.log(`[DELETE BOT]      ${index + 1}. Order ${order.id} - ${order.orderType} (${order.side}) - Status: ${order.status} - Exchange ID: ${order.exchangeOrderId || 'N/A'} - Created: ${order.createdAt}`);
        });
      } else {
        console.log(`[DELETE BOT]      No orders found in database for bot ${id}`);
      }
      
      console.log(`[DELETE BOT] 📊 CURRENT BOT STATE:`);
      console.log(`[DELETE BOT]    Active Cycle: ${activeCycle ? `#${activeCycle.id} (${activeCycle.cycleNumber})` : 'none'}`);
      console.log(`[DELETE BOT]    Total Orders: ${allBotOrders.length}`);
      console.log(`[DELETE BOT]    Cancellable Orders: ${cancellableOrders.length}`);
      
      if (cancellableOrders.length > 0) {
        console.log(`[DELETE BOT] 📋 CANCELLABLE ORDERS TO CANCEL:`);
        cancellableOrders.forEach((order, index) => {
          console.log(`[DELETE BOT]      ${index + 1}. Order ${order.id} (${order.orderType}) - ${order.status} - Exchange ID: ${order.exchangeOrderId || 'N/A'}`);
        });
      }
      
      let cancelledOrders = 0;
      let liquidated = false;
      
      // Step 1: Cancel all cancellable orders using the same proven logic as Trading page
      if (cancellableOrders.length > 0) {
        console.log(`[DELETE BOT] 🚫 ===== STARTING ORDER CANCELLATION =====`);
        console.log(`[DELETE BOT] 🚫 Using Trading page logic to cancel ${cancellableOrders.length} cancellable orders for bot ${id}`);
        
        const cancelErrors: string[] = [];
        
        for (const order of cancellableOrders) {
          if (order.exchangeOrderId) {
            try {
              console.log(`[DELETE BOT] 🚫 Cancelling order ${order.exchangeOrderId} (Order ID: ${order.id}, Type: ${order.orderType}, Status: ${order.status})`);
              
              // Use the same proven cancellation logic as Trading page
              await wsService.getTradingOperationsManager().cancelManualOrder(
                bot.exchangeId, 
                order.exchangeOrderId, 
                bot.tradingPair
              );
              
              // Update order status in database
              await storage.updateCycleOrder(order.id, { 
                status: 'cancelled',
                filledAt: new Date()
              });
              
              cancelledOrders++;
              console.log(`[DELETE BOT] ✅ Order ${order.exchangeOrderId} cancelled successfully`);
              
            } catch (orderError) {
              const errorMsg = `Failed to cancel order ${order.exchangeOrderId}: ${orderError instanceof Error ? orderError.message : 'Unknown error'}`;
              cancelErrors.push(errorMsg);
              console.error(`[DELETE BOT] ❌ ${errorMsg}`);
            }
          } else {
            console.warn(`[DELETE BOT] ⚠️ Skipping order ${order.id} - no exchange order ID`);
          }
        }
        
        console.log(`[DELETE BOT] ✅ ORDER CANCELLATION COMPLETED:`);
        console.log(`[DELETE BOT]    Total Orders Processed: ${cancellableOrders.length}`);
        console.log(`[DELETE BOT]    Successfully Cancelled: ${cancelledOrders} orders`);
        console.log(`[DELETE BOT]    Failed to Cancel: ${cancelErrors.length} orders`);
        
        if (cancelErrors.length > 0) {
          console.warn(`[DELETE BOT] ⚠️ CANCELLATION ERRORS:`);
          cancelErrors.forEach((error, index) => {
            console.warn(`[DELETE BOT]      ${index + 1}. ${error}`);
          });
        }
      } else {
        console.log(`[DELETE BOT] ℹ️ No cancellable orders to cancel for bot ${id}`);
      }
      
      // Step 2: Calculate total position to liquidate (same as stop bot logic)
      console.log(`[DELETE BOT] 💰 ===== CHECKING POSITION FOR LIQUIDATION =====`);
      if (activeCycle && activeCycle.totalQuantity && parseFloat(activeCycle.totalQuantity) > 0) {
        const totalQuantity = parseFloat(activeCycle.totalQuantity);
        console.log(`[DELETE BOT] 💰 POSITION FOUND TO LIQUIDATE:`);
        console.log(`[DELETE BOT]    Quantity: ${totalQuantity} ${bot.tradingPair?.replace('USDT', '')}`);
        console.log(`[DELETE BOT]    Cycle: #${activeCycle.id} (${activeCycle.cycleNumber})`);
        console.log(`[DELETE BOT]    Estimated Value: Calculating from orders...`);
        
        try {
          // Place market sell order to liquidate position
          console.log(`[DELETE BOT] 🔴 Initiating liquidation order before deletion...`);
          await wsService.getTradingOperationsManager().placeLiquidationOrder(bot.id, activeCycle.id);
          liquidated = true;
          console.log(`[DELETE BOT] ✅ LIQUIDATION COMPLETED - Position successfully liquidated for cycle ${activeCycle.id}`);
          
          // Complete the cycle
          await storage.completeBotCycle(activeCycle.id);
          console.log(`[DELETE BOT] ✅ CYCLE COMPLETED - Cycle ${activeCycle.id} marked as completed`);
        } catch (liquidationError) {
          console.error(`[DELETE BOT] ❌ LIQUIDATION FAILED:`, liquidationError);
          console.error(`[DELETE BOT] ❌ Liquidation Error Details:`, {
            message: liquidationError instanceof Error ? liquidationError.message : 'Unknown error',
            stack: liquidationError instanceof Error ? liquidationError.stack : 'No stack trace'
          });
          // Continue with deletion even if liquidation fails
          console.log(`[DELETE BOT] ⚠️ Continuing with deletion despite liquidation failure`);
        }
      } else {
        console.log(`[DELETE BOT] ℹ️ NO POSITION TO LIQUIDATE:`);
        if (!activeCycle) {
          console.log(`[DELETE BOT]    Reason: No active cycle found`);
        } else if (!activeCycle.totalQuantity) {
          console.log(`[DELETE BOT]    Reason: No quantity in active cycle`);
        } else {
          console.log(`[DELETE BOT]    Reason: Zero quantity (${activeCycle.totalQuantity})`);
        }
      }
      
      console.log(`[DELETE BOT] 🗑️ ===== STARTING DATA DELETION =====`);
      console.log(`[DELETE BOT] 🗑️ Deleting bot ${id} with ${cycles.length} cycles, ${orders.length} orders, ${trades.length} trades`);
      
      // Step 3: Clean up any pending timers and resources for this bot
      console.log(`[DELETE BOT] 🧹 ===== CLEANING UP RESOURCES =====`);
      console.log(`[DELETE BOT] 🧹 Cleaning up bot resources for bot ${id}...`);
      await wsService.getTradingOperationsManager().cleanupBot(id);
      console.log(`[DELETE BOT] ✅ RESOURCE CLEANUP COMPLETED`);
      
      // Step 4: Delete the bot and all related data
      console.log(`[DELETE BOT] 🗑️ Executing database deletion...`);
      await storage.deleteTradingBot(id);
      console.log(`[DELETE BOT] ✅ DATABASE DELETION COMPLETED - Bot and all related data deleted`);
      
      // Log deletion action
      const logger = BotLoggerManager.getLogger(id, bot.tradingPair);
      logger.logBotDeleted();
      const deletionMessage = `Bot deletion completed - ${cancelledOrders} orders cancelled${liquidated ? ', position liquidated' : ''}`;
      logger.logCustom('INFO', 'BOT_LIFECYCLE', deletionMessage, {
        botId: id,
        cancelledOrders,
        liquidated,
        cyclesDeleted: cycles.length,
        ordersDeleted: orders.length,
        tradesDeleted: trades.length
      });
      
      // Broadcast bot deletion to all connected clients
      console.log(`[WEBSOCKET] Broadcasting bot deletion for bot ${id}`);
      wsService.broadcastBotDataUpdate({
        action: 'deleted',
        bot: { id: id, userId: userId } // Only send minimal data since bot is deleted
      });
      
      console.log(`[DELETE BOT] Bot ${id} deleted successfully. Cancelled: ${cancelledOrders} orders, Liquidated: ${liquidated}`);
      
      res.json({ 
        success: true,
        cancelledOrders,
        liquidated,
        message: `Bot deleted. ${cancelledOrders} orders cancelled${liquidated ? ', position liquidated' : ''}.`,
        deletedData: {
          cycles: cycles.length,
          orders: orders.length,
          trades: trades.length
        }
      });
    } catch (error) {
      console.error(`\n[DELETE BOT] 💥 ===== FATAL ERROR IN DELETE ENDPOINT =====`);
      console.error('[DELETE BOT] 💥 Error deleting trading bot:', error);
      console.error(`[DELETE BOT] 💥 Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      console.error(`[DELETE BOT] 💥 Request details:`, {
        params: req.params,
        userId: req.user?.id,
        method: req.method,
        url: req.url
      });
      console.error(`[DELETE BOT] 💥 ===== ERROR END =====\n`);
      
      res.status(500).json({ 
        error: "Failed to delete trading bot",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
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

  // Bulk Bot Cycles API for multiple bots - Secured
  app.post("/api/bot-cycles/bulk", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { botIds } = req.body;
      
      if (!Array.isArray(botIds) || botIds.length === 0) {
        return res.status(400).json({ error: "botIds array is required" });
      }
      
      // Verify all bots belong to user
      const bots = await Promise.all(
        botIds.map(botId => storage.getTradingBot(botId))
      );
      
      // Filter out null bots and bots that don't belong to the user
      const validBots = bots.filter(bot => bot && bot.userId === userId);
      const validBotIds = validBots.map(bot => bot!.id);
      
      // Fetch cycles for all valid bots
      const allCycles = await Promise.all(
        validBotIds.map(botId => storage.getBotCyclesByBotId(botId))
      );
      
      // Flatten and return
      const flatCycles = allCycles.flat();
      res.json(flatCycles);
    } catch (error) {
      console.error('Error fetching bulk bot cycles:', error);
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

  app.get("/api/bot-logs/:botId/download", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

  // Order History API - Secured (database-only, no exchange calls)
  app.get("/api/orders/history", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      console.log(`[ORDER HISTORY] 📊 Fetching order history for user ${userId}, limit: ${limit}`);
      const orderHistory = await storage.getOrderHistoryByUserId(userId, limit);
      
      console.log(`[ORDER HISTORY] ✅ Retrieved ${orderHistory.length} orders from database`);
      res.json(orderHistory);
    } catch (error) {
      console.error('[ORDER HISTORY] ❌ Error fetching order history:', error);
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // Cancel Order API - Secured
  app.delete("/api/orders/:orderId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { orderId } = req.params;
      const { exchangeId, symbol } = req.body;
      
      if (!exchangeId || !symbol) {
        console.error(`[CANCEL ORDER] ❌ Missing required parameters: exchangeId=${exchangeId}, symbol=${symbol}`);
        return res.status(400).json({ error: "exchangeId and symbol are required" });
      }

      console.log(`[CANCEL ORDER] 🚫 ===== STARTING MANUAL ORDER CANCELLATION =====`);
      console.log(`[CANCEL ORDER] 🚫 Order ID: ${orderId}`);
      console.log(`[CANCEL ORDER] 🚫 Exchange ID: ${exchangeId}`);
      console.log(`[CANCEL ORDER] 🚫 Symbol: ${symbol}`);
      console.log(`[CANCEL ORDER] 🚫 User ID: ${req.user!.id}`);
      console.log(`[CANCEL ORDER] 🚫 Request Details: ${JSON.stringify({ orderId, exchangeId, symbol, userId: req.user!.id, timestamp: new Date().toISOString() })}`);
      
      console.log(`[CANCEL ORDER] 🚫 Using TradingOperationsManager.cancelManualOrder()...`);
      
      // Use the trading operations manager to cancel the order
      await wsService.getTradingOperationsManager().cancelManualOrder(exchangeId, orderId, symbol);
      
      console.log(`[CANCEL ORDER] ✅ ===== ORDER CANCELLATION COMPLETED =====`);
      console.log(`[CANCEL ORDER] ✅ Order ${orderId} cancelled successfully on ${symbol}`);
      console.log(`[CANCEL ORDER] ✅ Response: Order cancelled successfully`);
      
      res.json({ message: "Order cancelled successfully", orderId });
      
    } catch (error) {
      console.error(`[CANCEL ORDER] ❌ ===== ORDER CANCELLATION FAILED =====`);
      console.error('[CANCEL ORDER] ❌ Error cancelling order:', error);
      console.error(`[CANCEL ORDER] ❌ Error Details:`, {
        orderId: req.params.orderId,
        exchangeId: req.body.exchangeId,
        symbol: req.body.symbol,
        userId: req.user!.id,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      console.error(`[CANCEL ORDER] ❌ ===== ERROR END =====`);
      
      res.status(500).json({ 
        error: "Failed to cancel order",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
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
      // TODO: Implement user stream key generation
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

  // DEPRECATED: Configure stream connection endpoint removed
  // All stream configuration is now handled by the unified WebSocket server
  // This endpoint was causing redundant connections outside the unified system
  app.post("/api/websocket/configure-stream", async (req: Request, res: Response) => {
    res.json({ 
      message: "Stream configuration is now handled by WebSocket messages. Connect to /api/ws and send configure_stream messages.",
      deprecated: true,
      recommendation: "Use WebSocket messages: { type: 'configure_stream', dataType: 'ticker|kline', symbols: ['BTCUSDT'], interval: '1m' }"
    });
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
      // TODO: Move to TradingOperationsManager
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

  // Order placement endpoint
  app.post("/api/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { exchangeId, symbol, side, orderType, quantity, price, timeInForce } = req.body;
      const userId = req.user!.id;

      console.log(`[MANUAL ORDER] ===== ORDER PLACEMENT REQUEST =====`);
      console.log(`[MANUAL ORDER] User ID: ${userId}`);
      console.log(`[MANUAL ORDER] Exchange ID: ${exchangeId}`);
      console.log(`[MANUAL ORDER] Symbol: ${symbol}`);
      console.log(`[MANUAL ORDER] Side: ${side}`);
      console.log(`[MANUAL ORDER] Order Type: ${orderType}`);
      console.log(`[MANUAL ORDER] Quantity: ${quantity}`);
      console.log(`[MANUAL ORDER] Price: ${price || 'MARKET'}`);

      // Validate required fields
      if (!exchangeId || !symbol || !side || !orderType || !quantity) {
        console.log(`[MANUAL ORDER] ❌ Missing required fields`);
        return res.status(400).json({ 
          success: false, 
          error: "Missing required fields" 
        });
      }

      if (orderType === 'LIMIT' && !price) {
        console.log(`[MANUAL ORDER] ❌ Price required for limit orders`);
        return res.status(400).json({ 
          success: false, 
          error: "Price required for limit orders" 
        });
      }

      // Get exchange configuration
      const exchanges = await storage.getExchangesByUserId(userId);
      const exchange = exchanges.find(ex => ex.id === parseInt(exchangeId));
      
      if (!exchange) {
        console.log(`[MANUAL ORDER] ❌ Exchange not found`);
        return res.status(404).json({ 
          success: false, 
          error: "Exchange not found" 
        });
      }

      console.log(`[MANUAL ORDER] ✅ Exchange found: ${exchange.name} (${exchange.isTestnet ? 'Testnet' : 'Live'})`);

      // Check account balance before placing order
      console.log(`[MANUAL ORDER] 🔍 Checking account balance before order placement...`);
      
      try {
        // Get account balance using WebSocket service
        const balanceData = await wsService.getAccountBalance(parseInt(exchangeId), side === 'BUY' ? 'USDT' : symbol.replace('USDT', ''));
        
        if (!balanceData || !balanceData.data || !balanceData.data.balances) {
          console.log(`[MANUAL ORDER] ❌ Failed to fetch account balance`);
          return res.status(400).json({
            success: false,
            error: 'Failed to fetch account balance'
          });
        }

        const requiredAsset = side === 'BUY' ? 'USDT' : symbol.replace('USDT', '');
        const assetBalance = balanceData.data.balances.find((b: any) => b.asset === requiredAsset);
        const availableBalance = assetBalance ? parseFloat(assetBalance.free) : 0;

        console.log(`[MANUAL ORDER] 💰 Available ${requiredAsset} Balance: ${availableBalance.toFixed(8)}`);

        // Calculate required balance
        let requiredBalance: number;
        if (side === 'BUY') {
          // For buy orders, we need USDT
          if (orderType === 'MARKET') {
            // For market buy, quantity is in USDT (quote currency)
            requiredBalance = parseFloat(quantity);
          } else {
            // For limit buy, quantity is in base currency, multiply by price to get USDT needed
            requiredBalance = parseFloat(quantity) * parseFloat(price);
          }
        } else {
          // For sell orders, we need base currency
          requiredBalance = parseFloat(quantity);
        }

        console.log(`[MANUAL ORDER] 💰 Required ${requiredAsset}: ${requiredBalance.toFixed(8)}`);

        // Check if we have sufficient balance (with small buffer for fees)
        const feeBuffer = requiredBalance * 0.001; // 0.1% buffer for fees
        const totalRequired = requiredBalance + feeBuffer;

        if (availableBalance < totalRequired) {
          console.log(`[MANUAL ORDER] ❌ Insufficient balance:`);
          console.log(`[MANUAL ORDER]    Available: ${availableBalance.toFixed(8)} ${requiredAsset}`);
          console.log(`[MANUAL ORDER]    Required: ${requiredBalance.toFixed(8)} ${requiredAsset}`);
          console.log(`[MANUAL ORDER]    Fee Buffer: ${feeBuffer.toFixed(8)} ${requiredAsset}`);
          console.log(`[MANUAL ORDER]    Total Required: ${totalRequired.toFixed(8)} ${requiredAsset}`);
          
          return res.status(400).json({
            success: false,
            error: `Insufficient balance. Available: ${availableBalance.toFixed(8)} ${requiredAsset}, Required: ${totalRequired.toFixed(8)} ${requiredAsset}`
          });
        }

        console.log(`[MANUAL ORDER] ✅ Sufficient balance available`);
        console.log(`[MANUAL ORDER]    Available: ${availableBalance.toFixed(8)} ${requiredAsset}`);
        console.log(`[MANUAL ORDER]    Required: ${totalRequired.toFixed(8)} ${requiredAsset}`);

      } catch (balanceError) {
        console.error(`[MANUAL ORDER] ❌ Balance check failed:`, balanceError);
        return res.status(400).json({
          success: false,
          error: `Balance check failed: ${balanceError instanceof Error ? balanceError.message : 'Unknown error'}`
        });
      }

      // Place real order on exchange
      console.log(`[MANUAL ORDER] 📤 Placing real order on exchange...`);
      console.log(`[MANUAL ORDER]    Exchange: ${exchange.name} (${exchange.isTestnet ? 'Testnet' : 'Live'})`);
      console.log(`[MANUAL ORDER]    Symbol: ${symbol}`);
      console.log(`[MANUAL ORDER]    Side: ${side}`);
      console.log(`[MANUAL ORDER]    Type: ${orderType}`);
      console.log(`[MANUAL ORDER]    Quantity: ${quantity}`);
      console.log(`[MANUAL ORDER]    Price: ${price || 'MARKET'}`);
      
      try {
        // Decrypt API credentials
        const decryptedCredentials = decryptApiCredentials(exchange.apiKey, exchange.apiSecret, exchange.encryptionIv);
        const { apiKey, apiSecret } = decryptedCredentials;

        // Prepare order parameters
        const orderParams = new URLSearchParams({
          symbol: symbol,
          side: side,
          type: orderType,
          quantity: quantity,
          timestamp: Date.now().toString()
        });

        // Add price for LIMIT orders
        if (orderType === 'LIMIT' && price) {
          orderParams.append('price', price);
          orderParams.append('timeInForce', 'GTC');
        }

        // Create signature for Binance API
        const signature = crypto
          .createHmac('sha256', apiSecret)
          .update(orderParams.toString())
          .digest('hex');
        
        orderParams.append('signature', signature);

        // Make API call to place order
        const orderResponse = await fetch(`${exchange.restApiEndpoint}/api/v3/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: orderParams
        });

        const orderResult = await orderResponse.json();
        
        console.log(`[MANUAL ORDER] � Exchange API Response:`, orderResult);
        
        if (!orderResponse.ok) {
          console.log(`[MANUAL ORDER] ❌ Order failed:`, orderResult);
          throw new Error(`Order failed: ${orderResult.msg || orderResult.message || 'Unknown error'}`);
        }

        if (!orderResult || !orderResult.orderId) {
          console.log(`[MANUAL ORDER] ❌ Invalid order response:`, orderResult);
          throw new Error('Invalid order response from exchange');
        }

        const exchangeOrderId = orderResult.orderId.toString();
        
        // For market orders, get the actual fill price from the fills array
        let filledPrice = '0';
        if (orderType === 'MARKET' && orderResult.fills && orderResult.fills.length > 0) {
          // Calculate weighted average price from fills
          let totalValue = 0;
          let totalQty = 0;
          
          orderResult.fills.forEach((fill: any) => {
            const fillPrice = parseFloat(fill.price);
            const fillQty = parseFloat(fill.qty);
            totalValue += fillPrice * fillQty;
            totalQty += fillQty;
          });
          
          filledPrice = totalQty > 0 ? (totalValue / totalQty).toFixed(8) : '0';
          console.log(`[MANUAL ORDER] 📊 Market order fill calculation:`);
          console.log(`[MANUAL ORDER]    Total fills: ${orderResult.fills.length}`);
          console.log(`[MANUAL ORDER]    Total value: $${totalValue.toFixed(8)}`);
          console.log(`[MANUAL ORDER]    Total quantity: ${totalQty.toFixed(8)}`);
          console.log(`[MANUAL ORDER]    Average price: $${filledPrice}`);
        } else {
          // For limit orders, use the order price or fills
          filledPrice = orderResult.price || price || orderResult.fills?.[0]?.price || '0';
        }
        
        const filledQuantity = orderResult.executedQty || orderResult.origQty || quantity;
        const orderStatus = orderResult.status || 'NEW';

        console.log(`[MANUAL ORDER] ✅ Order placed successfully on exchange!`);
        console.log(`[MANUAL ORDER]    Exchange Order ID: ${exchangeOrderId}`);
        console.log(`[MANUAL ORDER]    Status: ${orderStatus}`);
        console.log(`[MANUAL ORDER]    Filled Price: $${filledPrice}`);
        console.log(`[MANUAL ORDER]    Filled Quantity: ${filledQuantity}`);

        // Store trade record in database
        await storage.createTrade({
          userId: userId,
          botId: null,
          tradingPair: symbol,
          side: side.toLowerCase(),
          orderType: orderType.toLowerCase(),
          orderCategory: "manual",
          amount: filledQuantity,
          quoteAmount: orderType === 'MARKET' ? 
            (parseFloat(filledQuantity) * parseFloat(filledPrice)).toFixed(8) : 
            (parseFloat(filledQuantity) * parseFloat(filledPrice)).toFixed(8),
          price: filledPrice,
          status: orderStatus.toLowerCase(),
          pnl: "0",
          fee: orderResult.fills ? 
            orderResult.fills.reduce((total: number, fill: any) => total + parseFloat(fill.commission || '0'), 0).toFixed(8) :
            (parseFloat(filledQuantity) * 0.001).toFixed(8), // 0.1% estimated fee
          feeAsset: orderResult.fills?.[0]?.commissionAsset || "USDT",
          exchangeOrderId: exchangeOrderId
        });

        // Broadcast order fill notification to WebSocket clients (similar to martingale strategy)
        try {
          console.log(`[MANUAL ORDER] 📢 Broadcasting order fill notification...`);
          
          const orderFillData = {
            exchangeOrderId: exchangeOrderId,
            symbol: symbol,
            side: side,
            quantity: filledQuantity,
            price: filledPrice,
            status: orderStatus,
            exchangeId: parseInt(exchangeId),
            userId: userId,
            timestamp: Date.now()
          };

          // Broadcast to all connected clients
          wsService.broadcastOrderFillNotification(orderFillData);

          console.log(`[MANUAL ORDER] ✅ Order fill notification broadcasted`);
        } catch (broadcastError) {
          console.error(`[MANUAL ORDER] ⚠️ Failed to broadcast order fill notification:`, broadcastError);
          // Don't fail the order placement if broadcast fails
        }

        console.log(`[MANUAL ORDER] ===== ORDER PLACEMENT COMPLETE =====`);

        // Return successful response
        res.json({
          success: true,
          orderId: exchangeOrderId,
          symbol: symbol,
          side: side,
          orderType: orderType,
          quantity: filledQuantity,
          price: filledPrice,
          status: orderStatus,
          message: "Order placed successfully"
        });

      } catch (orderError) {
        console.error(`[MANUAL ORDER] ❌ Order placement failed:`, orderError);
        
        res.status(500).json({
          success: false,
          error: `Order placement failed: ${orderError instanceof Error ? orderError.message : 'Unknown error'}`
        });
        return;
      }

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
        // Fetch real balance from exchange API using WebSocket service
        console.log(`[BALANCE API SYMBOL] 🔍 Fetching real balance data for ${quoteCurrency}...`);
        const balanceData = await wsService.getAccountBalance(parseInt(exchangeId), 'ALL');
        
        if (!balanceData || !balanceData.data || !balanceData.data.balances) {
          console.log(`[BALANCE API SYMBOL] ❌ Failed to fetch balance data from exchange`);
          throw new Error('Failed to fetch balance data from exchange');
        }

        console.log(`[BALANCE API SYMBOL] ✅ Successfully fetched balance data for ${quoteCurrency}`);
        
        if (balanceData && balanceData.data && balanceData.data.balances) {
          // Find the specific asset balance
          const assetBalance = balanceData.data.balances.find((balance: any) => balance.asset === quoteCurrency);
          
          console.log(`[BALANCE API SYMBOL] 💰 ${quoteCurrency} Balance:`, assetBalance || 'Not found');
          
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

  // Get all balances for an exchange (used by trading page)
  app.get("/api/exchanges/:exchangeId/balance", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { exchangeId } = req.params;
      const userId = req.user!.id;

      console.log(`[BALANCE API] ===== FETCHING ALL BALANCES =====`);
      console.log(`[BALANCE API] Exchange ID: ${exchangeId}`);
      console.log(`[BALANCE API] User ID: ${userId}`);

      // Get exchange credentials
      const exchanges = await storage.getExchangesByUserId(userId);
      const targetExchange = exchanges.find(ex => ex.id === parseInt(exchangeId));
      
      if (!targetExchange) {
        console.log(`[BALANCE API] ❌ Exchange not found`);
        return res.status(404).json({ error: "Exchange not found" });
      }

      console.log(`[BALANCE API] ✅ Exchange found: ${targetExchange.name} (${targetExchange.isTestnet ? 'Testnet' : 'Live'})`);

      try {
        // Fetch real balance from exchange API using WebSocket service
        console.log(`[BALANCE API] 🔍 Fetching real balance data...`);
        const balanceData = await wsService.getAccountBalance(parseInt(exchangeId), 'ALL');
        
        if (!balanceData || !balanceData.data || !balanceData.data.balances) {
          console.log(`[BALANCE API] ❌ Failed to fetch balance data from exchange`);
          throw new Error('Failed to fetch balance data from exchange');
        }

        console.log(`[BALANCE API] ✅ Successfully fetched balance data`);
        console.log(`[BALANCE API] Total assets: ${balanceData.data.balances.length}`);
        
        // Filter out zero balances and format response
        const nonZeroBalances = balanceData.data.balances.filter((balance: any) => 
          parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
        );

        console.log(`[BALANCE API] Non-zero balances: ${nonZeroBalances.length}`);
        
        // Log some example balances
        const importantAssets = ['USDT', 'BTC', 'ETH', 'BNB'];
        importantAssets.forEach(asset => {
          const balance = balanceData.data.balances.find((b: any) => b.asset === asset);
          if (balance) {
            console.log(`[BALANCE API] 💰 ${asset}: Free=${balance.free}, Locked=${balance.locked}`);
          }
        });

        console.log(`[BALANCE API] ===== BALANCE FETCH COMPLETED =====`);

        return res.json({
          success: true,
          balances: balanceData.data.balances,
          timestamp: Date.now()
        });
        
      } catch (apiError) {
        console.error(`[BALANCE API] ❌ API request failed:`, apiError);
        
        // Fallback to testnet mock data only if real API fails
        if (targetExchange.isTestnet) {
          console.log(`[BALANCE API] 🔄 Using testnet mock data fallback`);
          const mockBalances = [
            { asset: 'USDT', free: '127247.18000000', locked: '0.00000000' },
            { asset: 'BTC', free: '0.05000000', locked: '0.00000000' },
            { asset: 'ETH', free: '2.50000000', locked: '0.00000000' },
            { asset: 'BNB', free: '10.00000000', locked: '0.00000000' },
            { asset: 'ICP', free: '0.00000000', locked: '0.00000000' }
          ];
          
          return res.json({ 
            success: true,
            balances: mockBalances,
            timestamp: Date.now(),
            note: 'Using testnet mock data'
          });
        }
        
        throw apiError;
      }
    } catch (error) {
      console.error(`[BALANCE API] ❌ Balance fetch failed:`, error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch balances",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Open Orders API - Get open orders for a specific exchange and symbol
  app.get("/api/exchanges/:exchangeId/orders/open", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const exchangeId = parseInt(req.params.exchangeId);
      const { symbol } = req.query;
      
      console.log(`[OPEN ORDERS API] 🔍 Fetching open orders for exchange ${exchangeId}, symbol: ${symbol || 'all'}`);
      
      if (!exchangeId || isNaN(exchangeId)) {
        return res.status(400).json({ 
          success: false,
          error: "Invalid exchange ID" 
        });
      }

      // Get exchange details
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        return res.status(404).json({ 
          success: false,
          error: "Exchange not found" 
        });
      }

      // Verify user owns this exchange
      if (exchange.userId !== req.user!.id) {
        return res.status(403).json({ 
          success: false,
          error: "Unauthorized access to exchange" 
        });
      }

      try {
        // Use the TradingOperationsManager to get open orders
        if (wsService) {
          const openOrders = await wsService.getTradingOperationsManager().getOpenOrders(exchangeId, symbol as string);
          
          return res.json({
            success: true,
            orders: openOrders,
            exchangeId: exchangeId,
            symbol: symbol || null,
            timestamp: Date.now()
          });
        } else {
          return res.status(500).json({
            success: false,
            error: "Trading operations manager not available"
          });
        }
      } catch (apiError) {
        console.error(`[OPEN ORDERS API] ❌ Failed to fetch open orders:`, apiError);
        
        // Return empty array if API call fails
        return res.json({
          success: true,
          orders: [],
          exchangeId: exchangeId,
          symbol: symbol || null,
          timestamp: Date.now(),
          warning: "Could not fetch open orders from exchange API"
        });
      }
    } catch (error) {
      console.error(`[OPEN ORDERS API] ❌ Open orders fetch failed:`, error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch open orders"
      });
    }
  });

  // Ticker API - Get current price for a symbol from a specific exchange
  app.get("/api/ticker/:symbol", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { symbol } = req.params;
      const { exchangeId } = req.query;
      
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }

      // Get default exchange if not specified
      let targetExchangeId = exchangeId ? parseInt(exchangeId as string) : null;
      if (!targetExchangeId) {
        const userId = req.user!.id;
        const exchanges = await storage.getExchangesByUserId(userId);
        const activeExchange = exchanges.find(ex => ex.isActive);
        if (!activeExchange) {
          return res.status(400).json({ error: "No active exchange found" });
        }
        targetExchangeId = activeExchange.id;
      }

      const exchange = await storage.getExchange(targetExchangeId);
      if (!exchange) {
        return res.status(404).json({ error: "Exchange not found" });
      }

      // Fetch current price from exchange API
      const baseUrl = exchange.restApiEndpoint || (exchange.isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');
      const priceResponse = await fetch(`${baseUrl}/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`);
      
      if (!priceResponse.ok) {
        return res.status(400).json({ error: `Failed to fetch price for ${symbol}` });
      }

      const priceData = await priceResponse.json();
      res.json({
        symbol: priceData.symbol,
        price: priceData.price,
        exchangeId: targetExchangeId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error fetching ticker price:', error);
      res.status(500).json({ error: "Failed to fetch ticker price" });
    }
  });

  // Market data is now served through WebSocket-only communication
  // Frontend connects directly to the main WebSocket service

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      environment: config.isProduction ? "production" : "development"
    });
  });

  return httpServer;
}
