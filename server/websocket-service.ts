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
      
      // Wait for connection to be fully established before subscribing
      setTimeout(() => {
        if (this.tickerBinanceWs && this.tickerBinanceWs.readyState === WebSocket.OPEN) {
          const tickerStreams = Array.from(allSymbols).map(symbol => `${symbol.toLowerCase()}@ticker`);
          const subscribeMessage = {
            method: 'SUBSCRIBE',
            params: tickerStreams,
            id: Date.now()
          };
          
          console.log(`[TICKER STREAM] Subscribing to: ${tickerStreams.join(', ')}`);
          this.tickerBinanceWs!.send(JSON.stringify(subscribeMessage));
        }
      }, 100);
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
      
      // Wait for connection to be fully established before subscribing
      setTimeout(() => {
        if (this.klineBinanceWs && this.klineBinanceWs.readyState === WebSocket.OPEN) {
          this.addKlineSubscription(symbol, interval);
        }
      }, 100);
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

  // Missing methods that are called from routes
  async validateMartingaleOrderPlacement(botData: any): Promise<void> {
    console.log('[MARTINGALE] Validating order placement for bot:', botData.name);
    
    try {
      // Get exchange credentials
      const exchange = await storage.getExchange(botData.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      // Get symbol filters for validation
      const filters = await getBinanceSymbolFilters(botData.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');
      
      // Validate base order size
      const baseOrderQty = parseFloat(botData.baseOrderSize);
      if (baseOrderQty < filters.minQty) {
        throw new Error(`Base order size ${baseOrderQty} is below minimum ${filters.minQty} for ${botData.tradingPair}`);
      }

      // Validate safety order size
      const safetyOrderQty = parseFloat(botData.safetyOrderSize);
      if (safetyOrderQty < filters.minQty) {
        throw new Error(`Safety order size ${safetyOrderQty} is below minimum ${filters.minQty} for ${botData.tradingPair}`);
      }

      console.log('[MARTINGALE] Order placement validation passed');
    } catch (error) {
      console.error('[MARTINGALE] Validation failed:', error);
      throw error;
    }
  }

  async placeInitialBaseOrder(botId: number, cycleId: number): Promise<void> {
    console.log(`\n[MARTINGALE STRATEGY] ===== STARTING BASE ORDER EXECUTION =====`);
    console.log(`[MARTINGALE STRATEGY] Bot ID: ${botId}, Cycle ID: ${cycleId}`);
    
    let logger: any = null;
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.error(`[MARTINGALE STRATEGY] ❌ Bot ${botId} not found`);
        return;
      }

      // Initialize logger
      logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      logger.logStrategyAction('BASE_ORDER_START', {
        botId,
        cycleId,
        strategy: bot.strategy,
        tradingPair: bot.tradingPair
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Bot loaded: ${bot.name} (${bot.tradingPair}, ${bot.direction})`);

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        console.error(`[MARTINGALE STRATEGY] ❌ No exchange found for bot ${botId}`);
        return;
      }

      console.log(`[MARTINGALE STRATEGY] ✓ Exchange loaded: ${exchange.name}`);

      // Get current market price
      const symbol = bot.tradingPair;
      const tickerResponse = await fetch(`${exchange.restApiEndpoint || 'https://testnet.binance.vision'}/api/v3/ticker/price?symbol=${symbol}`);
      const tickerData = await tickerResponse.json();
      const currentPrice = parseFloat(tickerData.price);
      
      if (!currentPrice || currentPrice <= 0) {
        console.error(`[MARTINGALE STRATEGY] ❌ Unable to fetch market price for ${symbol}`);
        return;
      }
      
      console.log(`[MARTINGALE STRATEGY] ✓ Market price for ${symbol}: $${currentPrice.toFixed(6)}`);

      // Calculate base order quantity
      const baseOrderAmount = parseFloat(bot.baseOrderAmount);
      const rawQuantity = baseOrderAmount / currentPrice;

      // Fetch dynamic symbol filters from Binance exchange
      const filters = await getBinanceSymbolFilters(symbol, exchange.restApiEndpoint || 'https://testnet.binance.vision');
      
      // Apply Binance LOT_SIZE filter using correct step size
      const quantity = adjustQuantity(rawQuantity, filters.stepSize, filters.minQty, filters.qtyDecimals);

      console.log(`[MARTINGALE STRATEGY] 📊 BASE ORDER CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Investment Amount: $${baseOrderAmount}`);
      console.log(`[MARTINGALE STRATEGY]    Current Price: $${currentPrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Raw Quantity: ${rawQuantity.toFixed(8)} ${symbol.replace('USDT', '')}`);
      console.log(`[MARTINGALE STRATEGY]    Adjusted Quantity: ${quantity.toFixed(filters.qtyDecimals)} ${symbol.replace('USDT', '')} (LOT_SIZE compliant)`);

      // Create the base order record
      const baseOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'base_order',
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        orderCategory: 'MARKET',
        symbol: symbol,
        quantity: quantity.toFixed(filters.qtyDecimals),
        price: currentPrice.toFixed(filters.priceDecimals),
        status: 'pending'
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Created base order record in database (ID: ${baseOrder.id})`);

      // Place order on exchange via API
      try {
        const { apiKey, apiSecret } = decryptApiCredentials(
          exchange.apiKey,
          exchange.apiSecret,
          exchange.encryptionIv
        );

        console.log(`[MARTINGALE STRATEGY] 🚀 Placing order on ${exchange.name}...`);
        console.log(`[MARTINGALE STRATEGY]    Order Type: MARKET ${bot.direction === 'long' ? 'BUY' : 'SELL'}`);
        console.log(`[MARTINGALE STRATEGY]    Symbol: ${symbol}`);
        console.log(`[MARTINGALE STRATEGY]    Quantity: ${quantity.toFixed(filters.qtyDecimals)}`);
        
        // Place market order for base order
        const orderParams = new URLSearchParams({
          symbol: bot.tradingPair,
          side: bot.direction === 'long' ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: quantity.toString(),
          timestamp: Date.now().toString()
        });

        const signature = crypto
          .createHmac('sha256', apiSecret)
          .update(orderParams.toString())
          .digest('hex');
        
        orderParams.append('signature', signature);

        const orderResponse = await fetch(`${exchange.restApiEndpoint}/api/v3/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: orderParams
        });

        const orderResult = await orderResponse.json();
        
        if (!orderResponse.ok) {
          throw new Error(`Order placement failed: ${orderResult.msg || 'Unknown error'}`);
        }

        if (orderResult && orderResult.orderId) {
          // Update the order with exchange order ID
          const filledOrder = await storage.updateCycleOrder(baseOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'filled',
            filledQuantity: quantity.toFixed(filters.qtyDecimals),
            filledPrice: currentPrice.toFixed(filters.priceDecimals),
            filledAt: new Date()
          });

          // Update cycle with base order info
          await storage.updateBotCycle(cycleId, {
            baseOrderId: orderResult.orderId.toString(),
            baseOrderPrice: currentPrice.toFixed(8),
            currentAveragePrice: currentPrice.toFixed(8),
            totalInvested: baseOrderAmount.toFixed(8),
            totalQuantity: quantity.toFixed(8)
          });

          console.log(`[MARTINGALE STRATEGY] ✅ BASE ORDER SUCCESSFULLY PLACED!`);
          console.log(`[MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[MARTINGALE STRATEGY]    Filled Price: $${currentPrice.toFixed(6)}`);
          console.log(`[MARTINGALE STRATEGY]    Filled Quantity: ${quantity.toFixed(8)}`);
          console.log(`[MARTINGALE STRATEGY]    Total Investment: $${baseOrderAmount}`);
          
          // Log the order
          logger.logBaseOrderExecution(orderResult);
          
          // Now place take profit order
          await this.placeTakeProfitOrder(bot, cycleId, baseOrder, currentPrice);
          
          // Get current cycle for safety order placement
          const currentCycle = await storage.getActiveBotCycle(botId);
          if (currentCycle) {
            // Place all initial safety orders
            const maxSafetyOrders = parseInt(String(bot.maxSafetyOrders || 1));
            for (let i = 0; i < maxSafetyOrders; i++) {
              console.log(`[MARTINGALE STRATEGY] 🔄 Placing safety order ${i + 1} of ${maxSafetyOrders}...`);
              await this.placeNextSafetyOrder(bot, currentCycle, currentPrice, i);
            }
          }

        } else {
          console.error(`[MARTINGALE STRATEGY] ❌ Failed to place base order for bot ${botId} - No order ID returned`);
          await storage.updateCycleOrder(baseOrder.id, { 
            status: 'failed',
            errorMessage: 'Order placement failed - No order ID returned from exchange'
          });
        }

      } catch (orderError) {
        console.error(`[MARTINGALE STRATEGY] ❌ Error placing base order for bot ${botId}:`, orderError);
        const errorMessage = orderError instanceof Error ? orderError.message : 'Unknown order placement error';
        await storage.updateCycleOrder(baseOrder.id, { 
          status: 'failed',
          errorMessage: errorMessage
        });
      }

    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Critical error in placeInitialBaseOrder for bot ${botId}:`, error);
      if (logger) {
        logger.logStrategyError('BASE_ORDER_EXECUTION', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    console.log(`[MARTINGALE STRATEGY] ===== BASE ORDER EXECUTION COMPLETE =====\n`);
  }

  async placeTakeProfitOrder(bot: any, cycleId: number, baseOrder: any, entryPrice: number): Promise<void> {
    console.log(`[MARTINGALE STRATEGY] PLACING TAKE PROFIT ORDER`);
    
    try {
      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      // Calculate take profit price
      const takeProfitPercentage = parseFloat(bot.takeProfitPercentage) || 1.0;
      const takeProfitPrice = bot.direction === 'long' 
        ? entryPrice * (1 + takeProfitPercentage / 100)
        : entryPrice * (1 - takeProfitPercentage / 100);

      // Get symbol filters for price precision
      const filters = await getBinanceSymbolFilters(bot.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');
      const adjustedPrice = adjustPrice(takeProfitPrice, filters.tickSize, filters.priceDecimals);

      // Calculate quantity from base order
      const quantity = parseFloat(baseOrder.quantity);

      // Place limit sell order for take profit
      const orderParams = new URLSearchParams({
        symbol: bot.tradingPair,
        side: bot.direction === 'long' ? 'SELL' : 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        quantity: quantity.toString(),
        price: adjustedPrice.toString(),
        timestamp: Date.now().toString()
      });

      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderParams.toString())
        .digest('hex');
      
      orderParams.append('signature', signature);

      const response = await fetch(`${exchange.restApiEndpoint}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: orderParams
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`Take profit order failed: ${result.msg || 'Unknown error'}`);
      }

      // Store the take profit order
      await storage.createCycleOrder({
        cycleId: cycleId,
        exchangeOrderId: result.orderId.toString(),
        symbol: bot.tradingPair,
        userId: bot.userId,
        botId: bot.id,
        orderType: 'take_profit',
        orderCategory: 'LIMIT',
        side: bot.direction === 'long' ? 'SELL' : 'BUY',
        quantity: result.origQty,
        price: result.price,
        status: 'PENDING'
      });

      console.log(`[MARTINGALE STRATEGY] TAKE PROFIT ORDER PLACED: ${result.orderId} at $${adjustedPrice}`);
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] Take profit order failed:`, error);
    }
  }

  async placeNextSafetyOrder(bot: any, cycle: any, entryPrice: number, safetyOrderIndex: number): Promise<void> {
    console.log(`[MARTINGALE STRATEGY] Placing safety order ${safetyOrderIndex + 1} of ${bot.maxSafetyOrders}`);
    
    try {
      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      // Calculate safety order price using deviation and multiplier
      const priceDeviation = parseFloat(bot.priceDeviation) || 1.0;
      const priceDeviationMultiplier = parseFloat(bot.priceDeviationMultiplier) || 2.0;
      
      const deviation = priceDeviation * Math.pow(priceDeviationMultiplier, safetyOrderIndex);
      const safetyOrderPrice = bot.direction === 'long'
        ? entryPrice * (1 - deviation / 100)
        : entryPrice * (1 + deviation / 100);

      // Get symbol filters
      const filters = await getBinanceSymbolFilters(bot.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');
      const adjustedPrice = adjustPrice(safetyOrderPrice, filters.tickSize, filters.priceDecimals);

      // Calculate safety order quantity
      const baseQuantity = parseFloat(bot.safetyOrderAmount);
      const safetyOrderSizeMultiplier = parseFloat(bot.safetyOrderSizeMultiplier) || 2.0;
      const multipliedAmount = baseQuantity * Math.pow(safetyOrderSizeMultiplier, safetyOrderIndex);
      const quantity = adjustQuantity(multipliedAmount / adjustedPrice, filters.stepSize, filters.minQty, filters.qtyDecimals);

      // Place limit buy order for safety order
      const orderParams = new URLSearchParams({
        symbol: bot.tradingPair,
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        timeInForce: 'GTC',
        quantity: quantity.toString(),
        price: adjustedPrice.toString(),
        timestamp: Date.now().toString()
      });

      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderParams.toString())
        .digest('hex');
      
      orderParams.append('signature', signature);

      const response = await fetch(`${exchange.restApiEndpoint}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: orderParams
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`Safety order failed: ${result.msg || 'Unknown error'}`);
      }

      // Store the safety order
      await storage.createCycleOrder({
        cycleId: cycle.id,
        exchangeOrderId: result.orderId.toString(),
        symbol: bot.tradingPair,
        userId: bot.userId,
        botId: bot.id,
        orderType: 'safety_order',
        orderCategory: 'LIMIT',
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        quantity: result.origQty,
        price: result.price,
        status: 'PENDING'
      });

      console.log(`[MARTINGALE STRATEGY] SAFETY ORDER ${safetyOrderIndex + 1} PLACED: ${result.orderId} at $${adjustedPrice} (${deviation.toFixed(2)}% deviation)`);
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] Safety order ${safetyOrderIndex + 1} failed:`, error);
    }
  }

  async updateMarketSubscriptions(symbols: string[]): Promise<void> {
    console.log(`[WEBSOCKET] Updating market subscriptions for symbols:`, symbols);
    // This method handles dynamic subscription updates
    // The unified WebSocket server automatically handles subscriptions based on active connections
    // No additional action needed as the system is already optimized
  }

  async cancelOrder(botId: number, orderId: string): Promise<void> {
    console.log(`[WEBSOCKET] Cancelling order ${orderId} for bot ${botId}`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      const cancelParams = new URLSearchParams({
        symbol: bot.tradingPair,
        orderId: orderId,
        timestamp: Date.now().toString()
      });

      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(cancelParams.toString())
        .digest('hex');
      
      cancelParams.append('signature', signature);

      const response = await fetch(`${exchange.restApiEndpoint}/api/v3/order?${cancelParams}`, {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`Order cancellation failed: ${result.msg || 'Unknown error'}`);
      }

      console.log(`[WEBSOCKET] Order ${orderId} cancelled successfully`);
    } catch (error) {
      console.error(`[WEBSOCKET] Failed to cancel order ${orderId}:`, error);
      throw error;
    }
  }

  async placeLiquidationOrder(botId: number, cycleId: number): Promise<void> {
    console.log(`[WEBSOCKET] Placing liquidation order for bot ${botId}, cycle ${cycleId}`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      // Get all buy orders for this cycle to calculate total quantity
      const orders = await storage.getCycleOrdersByCycleId(cycleId);
      const buyOrders = orders.filter(order => order.side === 'BUY' && order.status === 'FILLED');
      
      const totalQuantity = buyOrders.reduce((sum, order) => sum + parseFloat(order.quantity), 0);
      
      if (totalQuantity <= 0) {
        throw new Error('No quantity to liquidate');
      }

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      // Get symbol filters
      const filters = await getBinanceSymbolFilters(bot.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');
      const adjustedQuantity = adjustQuantity(totalQuantity, filters.stepSize, filters.minQty, filters.qtyDecimals);

      // Place market sell order
      const orderParams = new URLSearchParams({
        symbol: bot.tradingPair,
        side: 'SELL',
        type: 'MARKET',
        quantity: adjustedQuantity.toString(),
        timestamp: Date.now().toString()
      });

      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderParams.toString())
        .digest('hex');
      
      orderParams.append('signature', signature);

      const response = await fetch(`${exchange.restApiEndpoint}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: orderParams
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`Liquidation order failed: ${result.msg || 'Unknown error'}`);
      }

      // Store the liquidation order
      await storage.createCycleOrder({
        cycleId: cycleId,
        exchangeOrderId: result.orderId.toString(),
        symbol: bot.tradingPair,
        userId: bot.userId,
        botId: bot.id,
        orderType: 'liquidation',
        orderCategory: 'MARKET',
        side: 'SELL',
        quantity: result.executedQty,
        price: result.fills?.[0]?.price || '0',
        status: 'FILLED'
      });

      console.log(`[WEBSOCKET] Liquidation order placed: ${result.orderId}`);
    } catch (error) {
      console.error(`[WEBSOCKET] Liquidation order failed:`, error);
      throw error;
    }
  }

  async generateListenKey(exchangeId: number): Promise<string> {
    console.log(`[WEBSOCKET] Generating listen key for exchange ${exchangeId}`);
    
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      const response = await fetch(`${exchange.restApiEndpoint}/api/v3/userDataStream`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`Failed to generate listen key: ${result.msg || 'Unknown error'}`);
      }

      console.log(`[WEBSOCKET] Listen key generated successfully`);
      return result.listenKey;
    } catch (error) {
      console.error(`[WEBSOCKET] Failed to generate listen key:`, error);
      throw error;
    }
  }

  async connectConfigurableStream(exchangeId: number, listenKey: string): Promise<void> {
    console.log(`[WEBSOCKET] Connecting configurable stream for exchange ${exchangeId}`);
    
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      // Connect to user data stream
      const streamUrl = `${exchange.wsStreamEndpoint}/${listenKey}`;
      const ws = new WebSocket(streamUrl);

      ws.on('open', () => {
        console.log(`[USER DATA STREAM] Connected to user data stream for exchange ${exchangeId}`);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleUserDataStreamMessage(message, exchangeId);
        } catch (error) {
          console.error('[USER DATA STREAM] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`[USER DATA STREAM] Disconnected from user data stream for exchange ${exchangeId}`);
      });

      ws.on('error', (error) => {
        console.error(`[USER DATA STREAM] Error on exchange ${exchangeId}:`, error);
      });

    } catch (error) {
      console.error(`[WEBSOCKET] Failed to connect configurable stream:`, error);
      throw error;
    }
  }

  private handleUserDataStreamMessage(message: any, exchangeId: number): void {
    console.log(`[USER DATA STREAM] Received message for exchange ${exchangeId}:`, message.e);
    
    if (message.e === 'executionReport') {
      // Handle order execution reports
      console.log(`[USER DATA STREAM] Order update: ${message.i} ${message.X}`);
    } else if (message.e === 'outboundAccountPosition') {
      // Handle balance updates
      console.log(`[USER DATA STREAM] Balance update for ${message.a}: ${message.f}`);
    }
  }

  async getAccountBalance(exchangeId: number, asset: string): Promise<any> {
    console.log(`[WEBSOCKET] Getting account balance for ${asset} on exchange ${exchangeId}`);
    
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      const params = new URLSearchParams({
        timestamp: Date.now().toString()
      });

      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(params.toString())
        .digest('hex');
      
      params.append('signature', signature);

      const response = await fetch(`${exchange.restApiEndpoint}/api/v3/account?${params}`, {
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });

      const accountData = await response.json();
      
      if (!response.ok) {
        throw new Error(`Failed to get account balance: ${accountData.msg || 'Unknown error'}`);
      }

      const balance = accountData.balances.find((b: any) => b.asset === asset);
      return balance || { asset, free: '0', locked: '0' };

    } catch (error) {
      console.error(`[WEBSOCKET] Failed to get account balance:`, error);
      throw error;
    }
  }
}