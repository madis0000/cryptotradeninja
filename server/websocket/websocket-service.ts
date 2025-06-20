import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { TickerStreamManager } from './streams/ticker-stream-manager';
import { KlineStreamManager } from './streams/kline-stream-manager';
import { UserDataStreamManager } from './streams/user-data-stream-manager';
import { TradingOperationsManager } from './managers/trading-operations-manager';
import { MessageHandler } from './handlers/message-handler';
import { broadcastManager } from './services/broadcast-manager';

// Global WebSocket service singleton for broadcasting
let globalWebSocketService: WebSocketService | null = null;

export function setGlobalWebSocketService(service: WebSocketService): void {
  globalWebSocketService = service;
}

export function getGlobalWebSocketService(): WebSocketService | null {
  return globalWebSocketService;
}

// Enhanced broadcast queue system for high-performance messaging
interface QueuedMessage {
  message: any;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
  targetClientIds?: string[];
}

// Connection tracking with performance metrics
interface ConnectionMetrics {
  messagesReceived: number;
  messagesSent: number;
  lastActivity: number;
  latency: number;
  isHealthy: boolean;
}

export class WebSocketService {
  private wss?: WebSocketServer;
  private server?: Server;
  
  // Stream managers
  private tickerStreamManager: TickerStreamManager;
  private klineStreamManager: KlineStreamManager;
  private userDataStreamManager: UserDataStreamManager;
  private tradingOperationsManager: TradingOperationsManager;
  private messageHandler: MessageHandler;

  // Enhanced client tracking with performance metrics
  private activeConnections = new Map<string, WebSocket>();
  private connectionMetrics = new Map<string, ConnectionMetrics>();
  
  // Add missing properties
  private clients = new Map<string, WebSocket>();
  private clientRoles = new Map<string, string>();
  private userDataStreams = new Map<string, any>();
  
  // High-performance message queue system
  private messageQueue: QueuedMessage[] = [];
  private isProcessingQueue = false;
  private maxQueueSize = 1000;
    // Performance optimization flags - Enhanced for real-time trading
  private enableBatchProcessing = true;
  private batchSize = 5; // Reduced from 10 for better responsiveness
  private maxBatchDelay = 2; // Reduced from 10ms to 2ms for minimal latency
  private criticalEventDelay = 1; // Immediate processing for critical events
  
  // Connection pools for different message types
  private criticalConnections = new Set<string>(); // For order fills, bot alerts
  private regularConnections = new Set<string>(); // For general updates
  private lowPriorityConnections = new Set<string>(); // For stats, non-critical updates

  // Client tracking
  private activeConnectionsLegacy = new Map<string, WebSocket>();  constructor(server: Server) {
    console.log('[UNIFIED WS] [WEBSOCKET SERVICE] Initializing enhanced WebSocket service with performance optimizations');
      // Initialize managers
    this.tickerStreamManager = new TickerStreamManager();
    this.klineStreamManager = new KlineStreamManager();
    this.tradingOperationsManager = new TradingOperationsManager();
    this.userDataStreamManager = new UserDataStreamManager(this.tradingOperationsManager);
    
    // Initialize message handler
    this.messageHandler = new MessageHandler(
      this.tickerStreamManager,
      this.klineStreamManager,
      this.tradingOperationsManager
    );
    
    // Create channels for different broadcast types
    broadcastManager.createChannel('order_updates', 'order');
    broadcastManager.createChannel('balance_updates', 'balance');
    
    // Start high-performance message processing
    this.startMessageQueueProcessor();
    
    console.log('[UNIFIED WS] [WEBSOCKET SERVICE] All managers initialized with performance enhancements');
  }

  // Public method to access TradingOperationsManager
  public getTradingOperationsManager(): TradingOperationsManager {
    return this.tradingOperationsManager;
  }

  // Initialize WebSocket server
  init(server: Server, wsPath: string = '/api/ws'): void {
    console.log(`[UNIFIED WS] [WEBSOCKET] Initializing WebSocket server on path: ${wsPath}`);
    
    this.server = server;
    
    this.wss = new WebSocketServer({
      server: this.server,
      path: wsPath,
    });

    this.setupWebSocketServer();
    
    // Start user data streams for all exchanges
    this.initializeUserDataStreams();
    
    console.log('[UNIFIED WS] [WEBSOCKET] WebSocket server initialized successfully');
  }

  // Setup WebSocket server
  private setupWebSocketServer(): void {
    if (!this.wss) {
      console.error('[UNIFIED WS] [WEBSOCKET] WebSocket server not initialized');
      return;
    }

    this.wss.on('connection', async (ws, request) => {
      const url = request.url || '';
      console.log(`[UNIFIED WS] [WEBSOCKET] Connection attempt - URL: ${url}, Valid: ${url === '/api/ws'}`);

      if (url !== '/api/ws') {
        console.log(`[UNIFIED WS] [WEBSOCKET] Rejecting connection to: ${url}`);
        ws.close(1008, 'Invalid path');
        return;
      }

      console.log(`[UNIFIED WS] [WEBSOCKET] Accepting connection to: ${url}`);
        // Generate unique client ID
      const clientId = crypto.randomBytes(4).toString('hex');
      this.activeConnections.set(clientId, ws);
      
      // Initialize connection metrics
      this.connectionMetrics.set(clientId, {
        messagesReceived: 0,
        messagesSent: 0,
        lastActivity: Date.now(),
        latency: 0,
        isHealthy: true
      });
      
      // Add to regular connections by default
      this.regularConnections.add(clientId);      // Send connection confirmation with performance info
      await this.sendImmediateMessage({
        type: 'connected',
        clientId,
        serverTime: new Date().toISOString(),
        performanceMode: 'optimized',
        features: ['batch_processing', 'priority_queue', 'connection_pooling'],
        message: 'Connected to backend WebSocket server'
      }, [clientId]);

      // Handle messages
      ws.on('message', async (data) => {
        await this.messageHandler.handleMessage(ws, data, clientId);
      });      // Handle connection close
      ws.on('close', () => {
        this.handleClientDisconnection(ws, clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[UNIFIED WS] [WEBSOCKET] Client ${clientId} error:`, error);
        this.activeConnections.delete(clientId);
        this.messageHandler.handleClientDisconnect(clientId);
      });
    });

    this.wss.on('error', (error) => {
      console.error('[UNIFIED WS] [WEBSOCKET] Server error:', error);
    });
  }
  // Get service status
  getStatus(): any {
    const connectionCount = this.activeConnections.size;
    const handlerStatus = this.messageHandler.getStatus();
    
    return {
      connections: connectionCount,
      ...handlerStatus,
      uptime: process.uptime()
    };
  }

  // Proxy methods for legacy compatibility
  async validateMartingaleOrderPlacement(botData: any): Promise<void> {
    return this.tradingOperationsManager.validateMartingaleOrderPlacement(botData);
  }

  async placeInitialBaseOrder(botId: number, cycleId: number): Promise<void> {
    return this.tradingOperationsManager.placeInitialBaseOrder(botId, cycleId);
  }

  async updateMarketSubscriptions(symbols: string[]): Promise<void> {
    return this.tradingOperationsManager.updateMarketSubscriptions(symbols);
  }

  async cancelOrder(botId: number, orderId: string): Promise<void> {
    return this.tradingOperationsManager.cancelOrder(botId, orderId);
  }

  async placeLiquidationOrder(botId: number, cycleId: number): Promise<void> {
    return this.tradingOperationsManager.placeLiquidationOrder(botId, cycleId);
  }

  async generateListenKey(exchangeId: number): Promise<string> {
    return this.tradingOperationsManager.generateListenKey(exchangeId);
  }

  async getAccountBalance(exchangeId: number, asset: string): Promise<any> {
    return this.tradingOperationsManager.getAccountBalance(exchangeId, asset);
  }
  // User Data Stream Management methods
  async startUserDataStreamForExchange(exchangeId: number): Promise<void> {
    return this.userDataStreamManager.startUserDataStream(exchangeId);
  }

  async stopUserDataStreamForExchange(exchangeId: number): Promise<void> {
    return this.userDataStreamManager.stopUserDataStream(exchangeId);
  }  // Enhanced broadcast order fill notification with ULTRA-LOW LATENCY for martingale strategies
  broadcastOrderFillNotification(orderData: any): void {
    const startTime = performance.now();
    
    const message = {
      type: 'order_fill_notification',
      data: {
        orderId: orderData.id,
        exchangeOrderId: orderData.exchangeOrderId,
        botId: orderData.botId,
        orderType: orderData.orderType,
        orderSubType: orderData.orderType, // Map orderType to orderSubType for compatibility
        symbol: orderData.symbol,
        side: orderData.side,
        quantity: orderData.quantity || orderData.filledQuantity,
        price: orderData.price || orderData.filledPrice,
        status: 'filled',
        filledAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        // Add latency tracking
        broadcastStartTime: startTime
      }
    };

    // Order fills are CRITICAL for martingale strategies - send IMMEDIATELY with ZERO queueing
    this.sendUltraFastMessage(message).then((endTime) => {
      const totalLatency = endTime - startTime;
      console.log(`[UNIFIED WS] [ORDER BROADCAST] ⚡ ULTRA-FAST sent order fill in ${totalLatency.toFixed(2)}ms for ${orderData.symbol} ${orderData.orderType}`);
      
      if (totalLatency > 10) {
        console.warn(`[UNIFIED WS] [ORDER BROADCAST] ⚠️  HIGH LATENCY WARNING: ${totalLatency.toFixed(2)}ms for order fill`);
      }
    }).catch(error => {
      console.error(`[UNIFIED WS] [ORDER BROADCAST] Failed to send immediate order fill:`, error);
    });
  }  // Enhanced broadcast bot status update with HIGH PRIORITY for martingale monitoring
  broadcastBotStatusUpdate(botData: any): void {
    const message = {
      type: 'bot_status_update',
      data: {
        botId: botData.id,
        status: botData.status,
        name: botData.name,
        tradingPair: botData.tradingPair,
        strategy: botData.strategy,
        direction: botData.direction,
        updatedAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      }
    };

    // Bot status updates are high priority - send via fast path
    this.sendImmediateMessage(message).then(() => {
      console.log(`[UNIFIED WS] [BOT BROADCAST] 📢 HIGH PRIORITY bot status update sent for bot ${botData.id} (${botData.status})`);
    }).catch((error: any) => {
      console.error(`[UNIFIED WS] [BOT BROADCAST] Failed to send bot status update:`, error);
    });
  }
  // Broadcast bot cycle update with HIGH PRIORITY for martingale monitoring
  broadcastBotCycleUpdate(cycleData: any): void {
    const message = {
      type: 'bot_cycle_update',
      data: {
        botId: cycleData.botId,
        cycleId: cycleData.id,
        cycleNumber: cycleData.cycleNumber,
        status: cycleData.status,
        baseOrderFilled: cycleData.baseOrderFilled,
        currentPrice: cycleData.currentPrice,
        averagePrice: cycleData.averagePrice,
        totalQuantity: cycleData.totalQuantity,
        totalCost: cycleData.totalCost,
        unrealizedPnL: cycleData.unrealizedPnL,
        updatedAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      }
    };

    // Cycle updates are critical for martingale monitoring - use fast path
    this.sendImmediateMessage(message).then(() => {
      console.log(`[UNIFIED WS] [CYCLE BROADCAST] ⚡ HIGH PRIORITY cycle update sent for bot ${cycleData.botId} cycle ${cycleData.cycleNumber}`);
    }).catch((error: any) => {
      console.error(`[UNIFIED WS] [CYCLE BROADCAST] Failed to send cycle update:`, error);
    });
  }

  // Broadcast bot statistics update to all connected clients
  broadcastBotStatsUpdate(statsData: any): void {
    const message = {
      type: 'bot_stats_update',
      data: {
        botId: statsData.botId,
        completedCycles: statsData.completedCycles,
        totalPnL: statsData.totalPnL,
        totalInvested: statsData.totalInvested,
        winRate: statsData.winRate,
        averageCycleDuration: statsData.averageCycleDuration,
        updatedAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      }
    };

    let sentCount = 0;
    this.activeConnections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS] [STATS BROADCAST] Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });

    console.log(`[UNIFIED WS] [STATS BROADCAST] ✅ Sent stats update to ${sentCount} clients for bot ${statsData.botId}`);
  }

  // Broadcast bot data update (general bot information)
  broadcastBotDataUpdate(botData: any): void {
    const message = {
      type: 'bot_data_update',
      data: {
        ...botData,
        updatedAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      }
    };

    let sentCount = 0;
    this.activeConnections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS] [BOT DATA BROADCAST] Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });

    console.log(`[UNIFIED WS] [BOT DATA BROADCAST] ✅ Sent bot data update to ${sentCount} clients for bot ${botData.id}`);
  }  // Initialize user data streams for all configured exchanges
  private async initializeUserDataStreams(): Promise<void> {
    try {
      console.log('[UNIFIED WS] [USER DATA STREAMS] Initializing user data streams...');
      
      // Get all configured exchanges from storage
      const { storage } = await import('../storage');
      
      // Get all active bot cycles to determine which exchanges are in use
      const activeCycles = await storage.getActiveCycles();
      const activeExchanges = new Set<number>();
      
      for (const cycle of activeCycles) {
        try {
          const bot = await storage.getTradingBot(cycle.botId);
          if (bot && bot.isActive) {
            activeExchanges.add(bot.exchangeId);
          }
        } catch (error) {
          console.error(`[USER DATA STREAMS] Error getting bot for cycle ${cycle.id}:`, error);
        }
      }
      
      console.log(`[UNIFIED WS] [USER DATA STREAMS] Found ${activeExchanges.size} active exchanges to monitor`);
      
      // Start user data streams for all active exchanges
      const exchangeIds = Array.from(activeExchanges);
      for (const exchangeId of exchangeIds) {
        try {
          // Verify the exchange exists and has valid credentials
          const exchange = await storage.getExchange(exchangeId);
          if (exchange && exchange.isActive && exchange.apiKey && exchange.apiSecret) {
            console.log(`[USER DATA STREAMS] Starting user data stream for exchange ${exchangeId} (${exchange.name})...`);
            await this.userDataStreamManager.startUserDataStream(exchangeId);
            console.log(`[USER DATA STREAMS] ✅ User data stream started for exchange ${exchangeId}`);
          } else {
            console.log(`[USER DATA STREAMS] ⚠️ Skipping exchange ${exchangeId} - not active or missing credentials`);
          }
        } catch (error) {
          console.error(`[USER DATA STREAMS] ❌ Failed to start user data stream for exchange ${exchangeId}:`, error);
        }
      }
      
      console.log('[UNIFIED WS] [USER DATA STREAMS] ✅ User data stream initialization complete');
    } catch (error) {
      console.error('[UNIFIED WS] [USER DATA STREAMS] ❌ Failed to initialize user data streams:', error);
    }
  }

  // Shutdown the service
  async shutdown(): Promise<void> {
    console.log('[UNIFIED WS] [WEBSOCKET SERVICE] Shutting down...');
    
    // Close all client connections
    this.activeConnections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down');
      }
    });
    
    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }
    
    console.log('[UNIFIED WS] [WEBSOCKET SERVICE] Shutdown complete');
  }

  async cleanupBot(botId: number): Promise<void> {
    return this.tradingOperationsManager.cleanupBot(botId);
  }

  // Place order via REST API with proper error handling and logging
  async placeOrderViaRest(exchangeId: number, orderParams: any): Promise<any> {
    console.log(`[WEBSOCKET SERVICE] placeOrderViaRest called with exchangeId: ${exchangeId}`);
    console.log(`[WEBSOCKET SERVICE] Order params:`, orderParams);
    
    try {
      // Use the trading operations manager's placeOrder method
      const orderRequest = {
        symbol: orderParams.symbol,
        side: orderParams.side,
        type: orderParams.type,
        quantity: orderParams.quantity,
        price: orderParams.price,
        timeInForce: orderParams.timeInForce || 'GTC'
      };
      
      const result = await this.tradingOperationsManager.placeOrder(exchangeId, orderRequest);
      
      if (!result) {
        throw new Error('Order placement failed - no response from exchange');
      }
      
      console.log(`[WEBSOCKET SERVICE] Order placed successfully:`, result);
      return result;
      
    } catch (error) {
      console.error(`[WEBSOCKET SERVICE] placeOrderViaRest failed:`, error);
      throw error;
    }
  }  // Broadcast open orders update to subscribed clients
  broadcastOpenOrdersUpdate(exchangeId: number, symbol: string | undefined, orders: any[]): void {
    const message = {
      type: 'open_orders_update',
      data: {
        exchangeId,
        symbol,
        orders,
        timestamp: Date.now()
      }
    };

    let sentCount = 0;
    this.activeConnections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS OPEN ORDERS] [BROADCAST] ❌ Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });

    console.log(`[UNIFIED WS OPEN ORDERS] [BROADCAST] ✅ Sent open orders update (${orders.length} orders) to ${sentCount} clients for exchange ${exchangeId}${symbol ? ` symbol ${symbol}` : ''}`);
  }
  // Enhanced broadcast order status update with immediate delivery
  broadcastOrderStatusUpdate(orderData: any): void {
    const message = {
      type: 'order_status_update',
      data: {
        exchangeOrderId: orderData.exchangeOrderId || orderData.orderId,
        symbol: orderData.symbol,
        side: orderData.side,
        type: orderData.type || orderData.orderType,
        quantity: orderData.quantity || orderData.origQty,
        price: orderData.price,
        status: orderData.status,
        executedQty: orderData.executedQty || orderData.filledQuantity || '0',
        cummulativeQuoteQty: orderData.cummulativeQuoteQty || orderData.cummulativeQuoteVolume || '0',
        timeInForce: orderData.timeInForce || 'GTC',
        clientOrderId: orderData.clientOrderId,
        updateTime: orderData.updateTime || Date.now(),
        timestamp: Date.now(),
        // Additional fields for better monitoring
        isManualTrade: orderData.isManualTrade || false,
        botId: orderData.botId,
        exchangeId: orderData.exchangeId
      }
    };

    // Order status updates are critical - send immediately
    this.sendImmediateMessage(message).then(() => {
      console.log(`[UNIFIED WS ORDER STATUS] [BROADCAST] ⚡ IMMEDIATE sent order status update (${orderData.status}) for ${orderData.symbol} order ${orderData.exchangeOrderId || orderData.orderId}`);
    }).catch(error => {
      console.error(`[UNIFIED WS ORDER STATUS] [BROADCAST] Failed to send immediate order status:`, error);
    });
  }

  // Broadcast comprehensive order update for both bot and manual trades
  broadcastOrderUpdate(orderUpdateData: any): void {
    const message = {
      type: 'order_update',
      data: {
        ...orderUpdateData,
        timestamp: Date.now(),
        broadcastTime: new Date().toISOString()
      }
    };

    let sentCount = 0;
    this.activeConnections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS ORDER UPDATE] [BROADCAST] ❌ Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });

    console.log(`[UNIFIED WS ORDER UPDATE] [BROADCAST] ✅ Sent comprehensive order update to ${sentCount} clients for ${orderUpdateData.symbol || 'unknown symbol'}`);
  }

  // Get open orders via trading operations manager
  async getOpenOrders(exchangeId: number, symbol?: string): Promise<any[]> {
    return this.tradingOperationsManager.getOpenOrders(exchangeId, symbol);
  }

  // Broadcast manual order placement notification to all connected clients
  broadcastManualOrderPlacementNotification(orderData: any): void {
    const message = {
      type: 'manual_order_placement_notification',
      data: {
        exchangeOrderId: orderData.exchangeOrderId,
        symbol: orderData.symbol,
        side: orderData.side,
        quantity: orderData.quantity,
        price: orderData.price,
        status: orderData.status,
        exchangeId: orderData.exchangeId,
        userId: orderData.userId,
        timestamp: orderData.timestamp,
        isManualOrder: true
      }
    };

    let sentCount = 0;
    this.activeConnections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS] [MANUAL ORDER BROADCAST] Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });    console.log(`[UNIFIED WS] [MANUAL ORDER BROADCAST] ✅ Sent manual order placement notification to ${sentCount} clients for ${orderData.symbol} ${orderData.side}`);
  }

  // Broadcast ticker update (market price data)
  broadcastTickerUpdate(tickerData: any): void {
    const message = {
      type: 'ticker_update',
      data: {
        symbol: tickerData.symbol,
        price: tickerData.price,
        priceChange: tickerData.priceChange,
        priceChangePercent: tickerData.priceChangePercent,
        volume: tickerData.volume,
        timestamp: new Date().toISOString()
      }
    };

    // Ticker updates can be batched for efficiency but still prioritized
    this.queueMessage(message, 'normal');
  }

  // Broadcast market update (comprehensive market data)
  broadcastMarketUpdate(marketData: any): void {
    const message = {
      type: 'market_update',
      data: {
        ...marketData,
        timestamp: new Date().toISOString()
      }
    };

    // Market updates are normal priority but frequent
    this.queueMessage(message, 'normal');
  }
  // Start high-performance message queue processor with optimized intervals
  private startMessageQueueProcessor(): void {
    console.log('[UNIFIED WS] [PERFORMANCE] Starting ultra-fast message queue processor (2ms intervals)');
    
    // Use more frequent processing for better real-time performance
    setInterval(() => {
      this.processMessageQueue();
    }, this.maxBatchDelay);
    
    // Additional high-priority processor for critical events
    setInterval(() => {
      this.processHighPriorityQueue();
    }, this.criticalEventDelay);
  }
  
  // Enhanced message queue processing with batching and priority
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    try {
      // Sort by priority and timestamp
      this.messageQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          const priorityOrder = { 'high': 0, 'normal': 1, 'low': 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.timestamp - b.timestamp;
      });
      
      const batchesToProcess = this.messageQueue.splice(0, this.enableBatchProcessing ? this.batchSize : 1);
      
      for (const queuedMessage of batchesToProcess) {
        await this.sendMessageToClients(queuedMessage);
      }
      
    } catch (error) {
      console.error('[UNIFIED WS] [PERFORMANCE] Error processing message queue:', error);
    } finally {
      this.isProcessingQueue = false;
    }  }
  
  // High-priority queue processor for critical events (order fills, bot alerts)
  private async processHighPriorityQueue(): Promise<void> {
    if (this.messageQueue.length === 0) {
      return;
    }
    
    // Process only high-priority messages immediately
    const highPriorityMessages = this.messageQueue.filter(msg => msg.priority === 'high');
    if (highPriorityMessages.length === 0) {
      return;
    }
    
    // Remove processed messages from main queue
    this.messageQueue = this.messageQueue.filter(msg => msg.priority !== 'high');
    
    // Send high-priority messages immediately
    for (const queuedMessage of highPriorityMessages) {
      await this.sendMessageToClients(queuedMessage);
    }
  }
  
  // Optimized message sending with connection pooling
  private async sendMessageToClients(queuedMessage: QueuedMessage): Promise<void> {
    const { message, targetClientIds } = queuedMessage;
    let sentCount = 0;
    let failedCount = 0;
    
    const clientsToSend = targetClientIds 
      ? Array.from(this.activeConnections.entries()).filter(([id]) => targetClientIds.includes(id))
      : Array.from(this.activeConnections.entries());
    
    const messageStr = JSON.stringify(message);
    
    // Batch send to all clients with error handling
    const sendPromises = clientsToSend.map(async ([clientId, ws]) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Update connection metrics
          const metrics = this.connectionMetrics.get(clientId);
          if (metrics) {
            metrics.messagesSent++;
            metrics.lastActivity = Date.now();
          }
          
          ws.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS] [PERFORMANCE] Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
          this.connectionMetrics.delete(clientId);
          failedCount++;
        }
      } else {
        this.activeConnections.delete(clientId);
        this.connectionMetrics.delete(clientId);
        failedCount++;
      }
    });
    
    await Promise.allSettled(sendPromises);
    
    if (sentCount > 0) {
      console.log(`[UNIFIED WS] [PERFORMANCE] ⚡ Sent ${message.type} to ${sentCount} clients${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
    }
  }  
  // Ultra-fast message sending (completely bypasses all queues and processing)
  private async sendUltraFastMessage(message: any, targetClientIds?: string[]): Promise<number> {
    const startTime = performance.now();
    let sentCount = 0;
    const messageStr = JSON.stringify(message);
    
    const clientsToSend = targetClientIds 
      ? Array.from(this.activeConnections.entries()).filter(([id]) => targetClientIds.includes(id))
      : Array.from(this.activeConnections.entries());
    
    // Send to all clients in parallel with maximum speed
    const sendPromises = clientsToSend.map(async ([clientId, ws]) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS] [ULTRA-FAST] Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });
    
    await Promise.allSettled(sendPromises);
    return performance.now();
  }
  
  // Immediate send for critical messages (bypasses queue)
  private async sendImmediateMessage(message: any, targetClientIds?: string[]): Promise<void> {
    const queuedMessage: QueuedMessage = {
      message,
      priority: 'high',
      timestamp: Date.now(),
      targetClientIds
    };
    
    await this.sendMessageToClients(queuedMessage);
  }
  
  // Queue message for batch processing
  private queueMessage(message: any, priority: 'high' | 'normal' | 'low' = 'normal', targetClientIds?: string[]): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      // Remove oldest low-priority messages to make room
      const lowPriorityIndex = this.messageQueue.findIndex(m => m.priority === 'low');
      if (lowPriorityIndex !== -1) {
        this.messageQueue.splice(lowPriorityIndex, 1);
      } else {
        // If no low priority messages, remove oldest normal priority
        const normalPriorityIndex = this.messageQueue.findIndex(m => m.priority === 'normal');
        if (normalPriorityIndex !== -1) {
          this.messageQueue.splice(normalPriorityIndex, 1);
        }
      }
    }
    
    const queuedMessage: QueuedMessage = {
      message,
      priority,
      timestamp: Date.now(),
      targetClientIds
    };
    
    this.messageQueue.push(queuedMessage);
  }

  private handleClientDisconnection(ws: WebSocket, clientId: string): void {
    console.log(`[WEBSOCKET] Client ${clientId} disconnected`);
    
    // Remove from all tracking maps
    this.activeConnections.delete(clientId);
    this.connectionMetrics.delete(clientId);
    this.clients.delete(clientId);
    this.clientRoles.delete(clientId);
    
    // Remove from all managers
    this.tickerStreamManager.removeClient(clientId);
    this.klineStreamManager.removeClient(clientId);
    this.messageHandler.handleClientDisconnect(clientId);
    
    // Remove from broadcast manager
    broadcastManager.removeClient(clientId);
    
    // Clean up user data stream if exists
    const userStream = this.userDataStreams.get(clientId);
    if (userStream) {
      userStream.stop();
      this.userDataStreams.delete(clientId);
    }
  }
    // Remove duplicate broadcastOrderUpdate method at line 836
  // Remove duplicate broadcastOrderFillNotification method at line 843
  
  public broadcastBalanceUpdate(exchangeId: number, balance: any): void {
    broadcastManager.broadcast('balance_updates', {
      type: 'balance_update',
      exchangeId,
      data: balance
    }, 'normal');
  }
  
  // Get broadcast statistics
  public getBroadcastStats(): any {
    return {
      connectedClients: this.clients.size,
      tickerClients: this.tickerStreamManager.getActiveClientsCount(),
      klineClients: this.klineStreamManager.getActiveClientsCount(),
      userDataStreams: this.userDataStreams.size,
      broadcastStats: broadcastManager.getStats()
    };
  }
}
