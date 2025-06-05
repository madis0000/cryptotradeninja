import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExchangeSchema, insertTradingBotSchema, insertTradeSchema } from "@shared/schema";
import { z } from "zod";
import WebSocket, { WebSocketServer } from "ws";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
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

  // Mock user ID (in a real app, this would come from authentication)
  const getCurrentUserId = () => 1;

  // Exchanges API
  app.get("/api/exchanges", async (req, res) => {
    try {
      const userId = getCurrentUserId();
      const exchanges = await storage.getExchangesByUserId(userId);
      res.json(exchanges);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exchanges" });
    }
  });

  app.post("/api/exchanges", async (req, res) => {
    try {
      const userId = getCurrentUserId();
      const exchangeData = insertExchangeSchema.parse({ ...req.body, userId });
      const exchange = await storage.createExchange(exchangeData);
      res.json(exchange);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid exchange data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create exchange" });
      }
    }
  });

  app.put("/api/exchanges/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = req.body;
      const exchange = await storage.updateExchange(id, updateData);
      res.json(exchange);
    } catch (error) {
      res.status(500).json({ error: "Failed to update exchange" });
    }
  });

  app.delete("/api/exchanges/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteExchange(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete exchange" });
    }
  });

  // Trading Bots API
  app.get("/api/bots", async (req, res) => {
    try {
      const userId = getCurrentUserId();
      const bots = await storage.getTradingBotsByUserId(userId);
      res.json(bots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trading bots" });
    }
  });

  app.post("/api/bots", async (req, res) => {
    try {
      const userId = getCurrentUserId();
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

  app.put("/api/bots/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = req.body;
      const bot = await storage.updateTradingBot(id, updateData);
      res.json(bot);
    } catch (error) {
      res.status(500).json({ error: "Failed to update trading bot" });
    }
  });

  app.delete("/api/bots/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTradingBot(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete trading bot" });
    }
  });

  // Trades API
  app.get("/api/trades", async (req, res) => {
    try {
      const userId = getCurrentUserId();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const trades = await storage.getTradesByUserId(userId, limit);
      res.json(trades);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  app.post("/api/trades", async (req, res) => {
    try {
      const userId = getCurrentUserId();
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

  // Portfolio API
  app.get("/api/portfolio", async (req, res) => {
    try {
      const userId = getCurrentUserId();
      const portfolio = await storage.getPortfolioByUserId(userId);
      res.json(portfolio);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolio" });
    }
  });

  // User Stats API
  app.get("/api/stats", async (req, res) => {
    try {
      const userId = getCurrentUserId();
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user stats" });
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
