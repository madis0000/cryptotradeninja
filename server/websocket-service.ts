import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import { storage } from './storage';
import { decryptApiCredentials } from './encryption';
import { BotCycle, CycleOrder, tradingBots } from '@shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { symbolFilterService, SymbolFilters } from './symbol-filters';
import { getBinanceSymbolFilters, adjustPrice, adjustQuantity } from './binance-filters';
import { BotLoggerManager } from './bot-logger';
import config from './config';

interface UserConnection {
  ws: WebSocket;
  userId: number;
  listenKey?: string;
}

interface MarketSubscription {
  ws: WebSocket;
  symbols: Set<string>;
  dataType?: string;
  interval?: string;
  clientId?: string;
}

interface TickerClient {
  ws: WebSocket;
  clientId: string;
  symbols: Set<string>;
  isActive: boolean;
}

interface KlineClient {
  ws: WebSocket;
  clientId: string;
  symbol: string;
  interval: string;
  isActive: boolean;
}

interface BalanceSubscription {
  ws: WebSocket;
  userId: number;
  exchangeId: number;
  symbol: string;
  clientId?: string;
}

interface OrderRequest {
  type: 'place_order';
  userId: number;
  exchangeId: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  clientOrderId?: string;
}

interface OrderResponse {
  type: 'order_result';
  orderId?: string;
  status: string;
  symbol: string;
  side: string;
  quantity: string;
  price?: string;
  fee?: string;
  feeAsset?: string;
  error?: string;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private userConnections = new Map<number, UserConnection>();
  private marketSubscriptions = new Set<MarketSubscription>();
  private balanceSubscriptions = new Set<BalanceSubscription>();
  private balanceData = new Map<string, any>();
  private balanceUpdateInterval: NodeJS.Timeout | null = null;
  private marketData = new Map<string, any>();
  private historicalData = new Map<string, Map<string, any[]>>();
  private binancePublicWs: WebSocket | null = null;
  private binanceUserStreams = new Map<string, WebSocket>();
  private mockDataInterval: NodeJS.Timeout | null = null;
  private isStreamsActive = false;
  private currentStreamType: string = 'ticker';
  private currentInterval: string = '1m';
  private currentSubscriptions: string[] = [];
  private currentKlineSubscriptions: string[] = [];
  private binanceKlineWs: WebSocket | null = null;
  private marketRefreshInterval: NodeJS.Timeout | null = null;
  private pendingOrderRequests = new Map<string, { resolve: Function, reject: Function, timestamp: number }>();
  private binanceOrderWs: WebSocket | null = null;
  private binanceTickerWs: WebSocket | null = null;
  private orderMonitoringInterval: NodeJS.Timeout | null = null;
  private userDataStreams = new Map<number, WebSocket>();
  private listenKeys = new Map<number, string>();
  private marketDataClients = new Set<WebSocket>();
  private isConnectionInProgress = false;
  private connectionLock = false;
  
  // Dedicated client managers for better data flow
  private tickerClients = new Map<string, TickerClient>();
  private klineClients = new Map<string, KlineClient>();
  private tickerBinanceWs: WebSocket | null = null;
  private klineBinanceWs: WebSocket | null = null;
  
  // Cycle management optimization for concurrent operations
  private cycleOperationLocks = new Map<number, Promise<void>>();
  private pendingCycleStarts = new Map<number, NodeJS.Timeout>();

  constructor(server: Server) {
    const wsPath = config.websocket.path;
    console.log(`[WEBSOCKET] Initializing WebSocket server on path: ${wsPath}`);
    console.log(`[WEBSOCKET] Deployment mode: ${config.isDeployment ? 'enabled' : 'disabled'}`);
    console.log(`[WEBSOCKET] Production mode: ${config.isProduction ? 'enabled' : 'disabled'}`);
    
    this.wss = new WebSocketServer({ 
      server: server,
      path: wsPath,
      perMessageDeflate: false,
    });

    this.setupWebSocketServer();
    this.startOrderMonitoring();
    this.startStuckCycleRecovery();
  }

  // Dedicated ticker client management
  private async setupTickerClient(ws: WebSocket, clientId: string, symbols: string[]) {
    console.log(`[TICKER CLIENT] Setting up ticker client ${clientId} for symbols: ${symbols.join(', ')}`);
    
    // Remove existing client if it exists
    if (this.tickerClients.has(clientId)) {
      this.tickerClients.delete(clientId);
    }
    
    // Create new ticker client
    const tickerClient: TickerClient = {
      ws,
      clientId,
      symbols: new Set(symbols.map(s => s.toUpperCase())),
      isActive: true
    };
    
    this.tickerClients.set(clientId, tickerClient);
    
    // Ensure ticker stream is active
    await this.ensureTickerStream();
    
    // Send current market data to the new client
    this.sendCurrentMarketData(ws, symbols);
  }

  // Dedicated kline client management
  private async setupKlineClient(ws: WebSocket, clientId: string, symbol: string, interval: string) {
    console.log(`[KLINE CLIENT] Setting up kline client ${clientId} for ${symbol} at ${interval}`);
    
    // Remove existing client if it exists
    if (this.klineClients.has(clientId)) {
      this.klineClients.delete(clientId);
    }
    
    // Create new kline client
    const klineClient: KlineClient = {
      ws,
      clientId,
      symbol: symbol.toUpperCase(),
      interval,
      isActive: true
    };
    
    this.klineClients.set(clientId, klineClient);
    
    // Ensure kline stream is active for this symbol and interval
    await this.ensureKlineStream(symbol, interval);
    
    // Send historical data to the new client
    this.sendHistoricalKlineData(ws, symbol, interval);
  }

  // Ensure ticker stream is running
  private async ensureTickerStream() {
    if (this.tickerBinanceWs && this.tickerBinanceWs.readyState === WebSocket.OPEN) {
      console.log('[TICKER STREAM] Ticker stream already active');
      return;
    }
    
    console.log('[TICKER STREAM] Starting ticker stream');
    
    // Get all unique symbols from ticker clients
    const allSymbols = new Set<string>();
    this.tickerClients.forEach(client => {
      client.symbols.forEach(symbol => allSymbols.add(symbol));
    });
    
    if (allSymbols.size === 0) {
      console.log('[TICKER STREAM] No symbols to subscribe to');
      return;
    }
    
    // Create ticker WebSocket connection
    const wsUrl = 'wss://stream.testnet.binance.vision/stream';
    this.tickerBinanceWs = new WebSocket(wsUrl);
    
    this.tickerBinanceWs.on('open', () => {
      console.log('[TICKER STREAM] Connected to Binance ticker stream');
      
      const tickerStreams = Array.from(allSymbols).map(symbol => `${symbol.toLowerCase()}@ticker`);
      const subscribeMessage = {
        method: 'SUBSCRIBE',
        params: tickerStreams,
        id: Date.now()
      };
      
      console.log(`[TICKER STREAM] Subscribing to: ${tickerStreams.join(', ')}`);
      this.tickerBinanceWs!.send(JSON.stringify(subscribeMessage));
    });
    
    this.tickerBinanceWs.on('message', (data) => {
      this.handleTickerMessage(data);
    });
    
    this.tickerBinanceWs.on('error', (error) => {
      console.error('[TICKER STREAM] WebSocket error:', error);
    });
    
    this.tickerBinanceWs.on('close', () => {
      console.log('[TICKER STREAM] Connection closed, reconnecting...');
      this.tickerBinanceWs = null;
      setTimeout(() => this.ensureTickerStream(), 5000);
    });
  }

  // Ensure kline stream is running for specific symbol and interval
  private async ensureKlineStream(symbol: string, interval: string) {
    if (this.klineBinanceWs && this.klineBinanceWs.readyState === WebSocket.OPEN) {
      console.log('[KLINE STREAM] Kline stream already active, adding subscription');
      this.addKlineSubscription(symbol, interval);
      return;
    }
    
    console.log(`[KLINE STREAM] Starting kline stream for ${symbol} at ${interval}`);
    
    // Create kline WebSocket connection
    const wsUrl = 'wss://stream.testnet.binance.vision/stream';
    this.klineBinanceWs = new WebSocket(wsUrl);
    
    this.klineBinanceWs.on('open', () => {
      console.log('[KLINE STREAM] Connected to Binance kline stream');
      this.addKlineSubscription(symbol, interval);
    });
    
    this.klineBinanceWs.on('message', (data) => {
      this.handleKlineMessage(data);
    });
    
    this.klineBinanceWs.on('error', (error) => {
      console.error('[KLINE STREAM] WebSocket error:', error);
    });
    
    this.klineBinanceWs.on('close', () => {
      console.log('[KLINE STREAM] Connection closed, reconnecting...');
      this.klineBinanceWs = null;
      setTimeout(() => this.ensureKlineStream(symbol, interval), 5000);
    });
  }

  // Add kline subscription to existing connection
  private addKlineSubscription(symbol: string, interval: string) {
    if (!this.klineBinanceWs || this.klineBinanceWs.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const klineStream = `${symbol.toLowerCase()}@kline_${interval}`;
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: [klineStream],
      id: Date.now()
    };
    
    console.log(`[KLINE STREAM] Adding subscription: ${klineStream}`);
    this.klineBinanceWs.send(JSON.stringify(subscribeMessage));
  }

  // Handle ticker messages
  private handleTickerMessage(data: any) {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.result !== undefined && message.id !== undefined) {
        console.log('[TICKER STREAM] Subscription confirmation');
        return;
      }
      
      let streamName = '';
      let tickerData = message;
      
      if (message.stream && message.data) {
        streamName = message.stream;
        tickerData = message.data;
      } else if (message.e === '24hrTicker') {
        streamName = `${message.s.toLowerCase()}@ticker`;
        tickerData = message;
      }
      
      if (streamName.includes('@ticker') && tickerData.s) {
        const marketUpdate = {
          symbol: tickerData.s,
          price: parseFloat(tickerData.c),
          priceChange: parseFloat(tickerData.p),
          priceChangePercent: parseFloat(tickerData.P),
          highPrice: parseFloat(tickerData.h),
          lowPrice: parseFloat(tickerData.l),
          volume: parseFloat(tickerData.v),
          quoteVolume: parseFloat(tickerData.q),
          timestamp: tickerData.E || Date.now()
        };
        
        this.marketData.set(tickerData.s, marketUpdate);
        this.broadcastToTickerClients(marketUpdate);
        
        console.log(`[WEBSOCKET] Live price update: ${tickerData.s} = $${tickerData.c}`);
      }
    } catch (error) {
      console.error('[TICKER STREAM] Error processing message:', error);
    }
  }

  // Handle kline messages
  private handleKlineMessage(data: any) {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.result !== undefined && message.id !== undefined) {
        console.log('[KLINE STREAM] Subscription confirmation');
        return;
      }
      
      let klineData = null;
      
      if (message.stream && message.data && message.data.k) {
        klineData = message.data.k;
      } else if (message.e === 'kline' && message.k) {
        klineData = message.k;
      }
      
      if (klineData) {
        const klineUpdate = {
          symbol: klineData.s,
          interval: klineData.i,
          openTime: klineData.t,
          closeTime: klineData.T,
          open: parseFloat(klineData.o),
          high: parseFloat(klineData.h),
          low: parseFloat(klineData.l),
          close: parseFloat(klineData.c),
          volume: parseFloat(klineData.v),
          isFinal: klineData.x,
          timestamp: Date.now()
        };
        
        console.log(`[KLINE STREAM] Kline update: ${klineUpdate.symbol} ${klineUpdate.interval} - OHLC: ${klineUpdate.open}/${klineUpdate.high}/${klineUpdate.low}/${klineUpdate.close}`);
        
        this.storeHistoricalKlineData(klineUpdate);
        this.broadcastToKlineClients(klineUpdate);
      }
    } catch (error) {
      console.error('[KLINE STREAM] Error processing message:', error);
    }
  }

  // Broadcast market updates to ticker clients
  private broadcastToTickerClients(marketUpdate: any) {
    const message = JSON.stringify({
      type: 'market_update',
      data: marketUpdate
    });
    
    let sentCount = 0;
    this.tickerClients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN && client.isActive) {
        if (client.symbols.size === 0 || client.symbols.has(marketUpdate.symbol)) {
          client.ws.send(message);
          sentCount++;
        }
      }
    });
    
    console.log(`[TICKER BROADCAST] Sent to ${sentCount} ticker clients for ${marketUpdate.symbol}`);
  }

  // Broadcast kline updates to kline clients
  private broadcastToKlineClients(klineUpdate: any) {
    const message = JSON.stringify({
      type: 'kline_update',
      data: klineUpdate
    });
    
    let sentCount = 0;
    this.klineClients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN && client.isActive) {
        if (client.symbol === klineUpdate.symbol && client.interval === klineUpdate.interval) {
          client.ws.send(message);
          sentCount++;
        }
      }
    });
    
    console.log(`[KLINE BROADCAST] Sent to ${sentCount} kline clients for ${klineUpdate.symbol} ${klineUpdate.interval}`);
  }

  // Store historical kline data
  private storeHistoricalKlineData(klineUpdate: any) {
    const key = `${klineUpdate.symbol}_${klineUpdate.interval}`;
    
    if (!this.historicalData.has(klineUpdate.symbol)) {
      this.historicalData.set(klineUpdate.symbol, new Map());
    }
    
    const symbolData = this.historicalData.get(klineUpdate.symbol)!;
    if (!symbolData.has(klineUpdate.interval)) {
      symbolData.set(klineUpdate.interval, []);
    }
    
    const intervalData = symbolData.get(klineUpdate.interval)!;
    const existingIndex = intervalData.findIndex(k => k.openTime === klineUpdate.openTime);
    
    if (existingIndex >= 0) {
      intervalData[existingIndex] = klineUpdate;
    } else {
      intervalData.push(klineUpdate);
      intervalData.sort((a, b) => a.openTime - b.openTime);
      
      // Keep only last 1000 candles
      if (intervalData.length > 1000) {
        intervalData.splice(0, intervalData.length - 1000);
      }
    }
  }

  // Send current market data to new ticker client
  private sendCurrentMarketData(ws: WebSocket, symbols: string[]) {
    symbols.forEach(symbol => {
      const marketData = this.marketData.get(symbol.toUpperCase());
      if (marketData) {
        ws.send(JSON.stringify({
          type: 'market_update',
          data: marketData
        }));
      }
    });
  }

  // Send historical kline data to new kline client
  private sendHistoricalKlineData(ws: WebSocket, symbol: string, interval: string) {
    const symbolData = this.historicalData.get(symbol.toUpperCase());
    if (symbolData) {
      const intervalData = symbolData.get(interval);
      if (intervalData && intervalData.length > 0) {
        ws.send(JSON.stringify({
          type: 'historical_klines',
          data: {
            symbol,
            interval,
            klines: intervalData.slice(-500) // Send last 500 candles
          }
        }));
      }
    }
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const url = req.url || '';
      console.log(`[WEBSOCKET] Connection attempt - URL: ${url}, Valid: ${url.includes('/api/ws')}`);
      
      if (!url.includes('/api/ws')) {
        ws.close(1000, 'Invalid endpoint');
        return;
      }
      
      console.log(`[WEBSOCKET] Accepting connection to: ${url}`);
      
      const clientId = crypto.randomBytes(4).toString('hex');
      let subscription: MarketSubscription = {
        ws,
        symbols: new Set(),
        clientId
      };
      
      this.marketSubscriptions.add(subscription);
      
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        message: 'Connected to backend WebSocket server'
      }));
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`[UNIFIED WS SERVER] Received raw message: ${data.toString()}`);
          console.log(`[UNIFIED WS SERVER] Parsed message:`, message);
          
          if (message.type === 'test') {
            ws.send(JSON.stringify({ type: 'test_response', message: 'Test received' }));
            return;
          }
          
          if (message.type === 'subscribe') {
            await this.setupTickerClient(ws, clientId, message.symbols || []);
            return;
          }
          
          if (message.type === 'configure_stream') {
            console.log(`[UNIFIED WS SERVER] Configure stream request: dataType=${message.dataType}, symbols=${JSON.stringify(message.symbols)}, interval=${message.interval}`);
            
            const requestedDataType = message.dataType || 'ticker';
            const requestedSymbols = message.symbols || [];
            const requestedInterval = message.interval || '1m';
            
            if (requestedDataType === 'ticker') {
              await this.setupTickerClient(ws, clientId, requestedSymbols);
            } else if (requestedDataType === 'kline') {
              await this.setupKlineClient(ws, clientId, requestedSymbols[0], requestedInterval);
            }
            
            return;
          }
          
        } catch (error) {
          console.error('[UNIFIED WS SERVER] Error processing message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message: ' + (error as Error).message
          }));
        }
      });
      
      ws.on('close', () => {
        console.log(`[WEBSOCKET] Client ${clientId} disconnected`);
        
        // Clean up ticker client
        if (this.tickerClients.has(clientId)) {
          this.tickerClients.delete(clientId);
        }
        
        // Clean up kline client
        if (this.klineClients.has(clientId)) {
          this.klineClients.delete(clientId);
        }
        
        // Clean up market subscription
        this.marketSubscriptions.delete(subscription);
      });
      
      ws.on('error', (error) => {
        console.error(`[WEBSOCKET] Client ${clientId} error:`, error);
      });
    });
  }

  private startOrderMonitoring() {
    console.log('[ORDER MONITOR] Starting order monitoring for Martingale cycles');
    // Order monitoring implementation would go here
  }

  private startStuckCycleRecovery() {
    console.log('[RECOVERY] Starting stuck cycle recovery monitoring');
    // Stuck cycle recovery implementation would go here
  }
}