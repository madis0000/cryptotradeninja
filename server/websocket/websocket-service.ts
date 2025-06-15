import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import crypto from 'crypto';
import { TickerStreamManager } from './streams/ticker-stream-manager';
import { KlineStreamManager } from './streams/kline-stream-manager';
import { TradingOperationsManager } from './managers/trading-operations-manager';
import { MessageHandler } from './handlers/message-handler';

export class WebSocketService {
  private wss?: WebSocketServer;
  private server?: Server;
  
  // Stream managers
  private tickerStreamManager: TickerStreamManager;
  private klineStreamManager: KlineStreamManager;
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
