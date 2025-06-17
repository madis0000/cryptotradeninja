import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import crypto from 'crypto';
import { TickerStreamManager } from './streams/ticker-stream-manager';
import { KlineStreamManager } from './streams/kline-stream-manager';
import { UserDataStreamManager } from './streams/user-data-stream-manager';
import { TradingOperationsManager } from './managers/trading-operations-manager';
import { MessageHandler } from './handlers/message-handler';

// Global WebSocket service singleton for broadcasting
let globalWebSocketService: WebSocketService | null = null;

export function setGlobalWebSocketService(service: WebSocketService): void {
  globalWebSocketService = service;
}

export function getGlobalWebSocketService(): WebSocketService | null {
  return globalWebSocketService;
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

  // Client tracking
  private activeConnections = new Map<string, WebSocket>();
  constructor() {
    console.log('[UNIFIED WS] [WEBSOCKET SERVICE] Initializing modular WebSocket service');
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
      console.log('[UNIFIED WS] [WEBSOCKET SERVICE] All managers initialized');
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

    this.wss.on('connection', (ws, request) => {
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

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        message: 'Connected to backend WebSocket server'
      }));

      // Handle messages
      ws.on('message', async (data) => {
        await this.messageHandler.handleMessage(ws, data, clientId);
      });      // Handle connection close
      ws.on('close', () => {
        console.log(`[UNIFIED WS] [WEBSOCKET] Client ${clientId} disconnected`);
        this.activeConnections.delete(clientId);
        this.messageHandler.handleClientDisconnect(clientId);
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
  }

  // Broadcast order fill notification to all connected clients
  broadcastOrderFillNotification(orderData: any): void {
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
          console.error(`[UNIFIED WS] [ORDER BROADCAST] Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });

    console.log(`[UNIFIED WS] [ORDER BROADCAST] ✅ Sent order fill notification to ${sentCount} clients for ${orderData.symbol} ${orderData.orderType}`);
  }

  // Broadcast bot status update to all connected clients
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

    let sentCount = 0;
    this.activeConnections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS] [BOT BROADCAST] Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });

    console.log(`[UNIFIED WS] [BOT BROADCAST] ✅ Sent bot status update to ${sentCount} clients for bot ${botData.id} (${botData.status})`);
  }

  // Broadcast bot cycle update to all connected clients
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

    let sentCount = 0;
    this.activeConnections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`[UNIFIED WS] [CYCLE BROADCAST] Failed to send to client ${clientId}:`, error);
          this.activeConnections.delete(clientId);
        }
      } else {
        this.activeConnections.delete(clientId);
      }
    });

    console.log(`[UNIFIED WS] [CYCLE BROADCAST] ✅ Sent cycle update to ${sentCount} clients for bot ${cycleData.botId} cycle ${cycleData.cycleNumber}`);
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
  }
  // Initialize user data streams for all configured exchanges
  private async initializeUserDataStreams(): Promise<void> {
    try {
      console.log('[UNIFIED WS] [USER DATA STREAMS] Initializing user data streams...');
      
      // Get all configured exchanges from storage
      const { storage } = await import('../storage');
      
      // Since we don't have getAllExchanges, we'll need to iterate through users
      // For now, let's start with a simple approach - we'll add a proper method later
      // This is a temporary solution to get user data streams working
      
      console.log('[UNIFIED WS] [USER DATA STREAMS] ✅ User data stream manager initialized (manual exchange setup required)');
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
}
