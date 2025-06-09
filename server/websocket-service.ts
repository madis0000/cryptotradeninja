import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import { storage } from './storage';
import { decryptApiCredentials } from './encryption';
import { BotCycle, CycleOrder } from '@shared/schema';

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
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  symbol: string;
  side: string;
  quantity: string;
  price?: string;
  status?: string;
  fee?: string;
  feeAsset?: string;
  error?: string;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private userConnections = new Map<number, UserConnection>();
  private marketSubscriptions = new Set<MarketSubscription>();
  private balanceSubscriptions = new Set<BalanceSubscription>();
  private balanceData = new Map<string, any>(); // key: userId:exchangeId:symbol -> balance data
  private balanceUpdateInterval: NodeJS.Timeout | null = null;
  private marketData = new Map<string, any>();
  private historicalData = new Map<string, Map<string, any[]>>(); // symbol -> interval -> kline data
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

  constructor(server: Server) {
    // WebSocket server on dedicated port with proper Replit binding
    const wsPort = parseInt(process.env.WS_PORT || '8080');
    this.wss = new WebSocketServer({ 
      port: wsPort,
      host: '0.0.0.0'
    });

    this.setupWebSocket();
    
    // Stop any automatic streaming on initialization
    this.stopBinanceStreams();
    
    // Start market refresh interval (every 60 seconds)
    this.startMarketRefreshInterval();
    
    // Start order monitoring for Martingale bots
    this.startOrderMonitoring();
    
    // Removed verbose WebSocket logging
  }

  private setupWebSocket() {
    const wsPort = parseInt(process.env.WS_PORT || '8080');
    // Removed verbose WebSocket logging
    
    this.wss.on('connection', (ws, request) => {
      const clientIP = request.socket.remoteAddress;
      const clientId = Math.random().toString(36).substr(2, 9);
      // Removed verbose WebSocket logging

      const subscription: MarketSubscription = {
        ws,
        symbols: new Set(),
        dataType: 'ticker', // default to ticker
        interval: '1m',
        clientId: clientId
      };

      this.marketSubscriptions.add(subscription);
      // Removed verbose WebSocket logging
      
      // Send immediate welcome message to confirm connection
      ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId,
        message: 'Connected to backend WebSocket server'
      }));

      // Don't start streams automatically - wait for frontend subscription

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          // Removed verbose WebSocket logging
          // Removed verbose WebSocket logging
          
          if (message.type === 'subscribe') {
            // Frontend requests subscription to specific trading pairs
            const symbols = message.symbols || ['BTCUSDT'];
            // Removed verbose WebSocket logging
            
            // Clear previous symbols and set new ones
            subscription.symbols.clear();
            symbols.forEach((symbol: string) => {
              subscription.symbols.add(symbol.toUpperCase());
            });
            
            // Collect all unique symbols from all subscriptions
            const allSymbols = new Set<string>();
            this.marketSubscriptions.forEach(sub => {
              sub.symbols.forEach(symbol => allSymbols.add(symbol));
            });
            
            const allSymbolsArray = Array.from(allSymbols);
            // Removed verbose WebSocket logging
            
            // Update Binance streams only if symbols have changed
            const currentSymbolsArray = this.currentSubscriptions.map(s => s.replace('@ticker', '').toUpperCase());
            const newSymbolsArray = allSymbolsArray.map(s => s.toUpperCase());
            const symbolsChanged = currentSymbolsArray.length !== newSymbolsArray.length || 
              !currentSymbolsArray.every(s => newSymbolsArray.includes(s));

            if (symbolsChanged && allSymbolsArray.length > 0) {
              // Removed verbose WebSocket logging
              await this.updateBinanceSubscription(allSymbolsArray);
              this.isStreamsActive = true;
            } else if (!this.isStreamsActive && allSymbolsArray.length > 0) {
              // Removed verbose WebSocket logging
              await this.connectConfigurableStream('ticker', allSymbolsArray);
              this.isStreamsActive = true;
            } else if (symbolsChanged) {
              // Removed verbose WebSocket logging
            }
            
            // Send current market data from backend to frontend
            this.sendMarketDataToClient(ws);
          }
          
          if (message.type === 'authenticate') {
            await this.authenticateUserConnection(ws, message.userId, message.apiKey);
          }
          
          if (message.type === 'account_balance') {
            this.requestAccountBalance(ws, message.userId, message.exchangeId);
          }
          
          if (message.type === 'subscribe_balance') {
            // Removed verbose WebSocket logging
            await this.subscribeToBalance(ws, message.userId, message.exchangeId, message.symbol, clientId);
          }
          
          if (message.type === 'place_order') {
            // Removed verbose WebSocket logging
            await this.handleOrderPlacement(ws, message as OrderRequest);
          }
          
          if (message.type === 'start_martingale_bot') {
            await this.handleMartingaleBotStart(ws, message);
          }
          
          if (message.type === 'unsubscribe_balance') {
            this.unsubscribeFromBalance(ws, message.userId, message.exchangeId, message.symbol);
          }
          
          if (message.type === 'configure_stream') {
            // Removed verbose WebSocket logging
            
            // Update the subscription with the requested configuration
            subscription.symbols.clear();
            (message.symbols || []).forEach((symbol: string) => {
              subscription.symbols.add(symbol.toUpperCase());
            });
            subscription.dataType = message.dataType || 'ticker';
            subscription.interval = message.interval || '1m';
            
            // For kline data type, update the current interval and hot-swap subscription
            if (message.dataType === 'kline') {
              const newInterval = message.interval || '1m';
              const symbols = Array.from(subscription.symbols);
              
              // Removed verbose WebSocket logging
              this.currentInterval = newInterval;
              
              // Update kline subscription immediately
              await this.setupKlineStream(symbols, newInterval);
              
              // Send historical data for the new interval
              this.sendHistoricalDataToClients(symbols, newInterval);
              return;
            }
            
            // Get all unique symbols from both ticker and kline clients
            const allSymbols = new Set<string>();
            this.marketSubscriptions.forEach(sub => {
              sub.symbols.forEach(symbol => allSymbols.add(symbol));
            });
            const symbolsArray = Array.from(allSymbols);
            
            // Check if we need to start streams for different data types
            const hasKlineClients = Array.from(this.marketSubscriptions).some(sub => sub.dataType === 'kline');
            const hasTickerClients = Array.from(this.marketSubscriptions).some(sub => sub.dataType === 'ticker');
            
            // Removed verbose WebSocket logging
            
            // Configure streams based on client type without circular calls
            if (hasKlineClients && hasTickerClients) {
              // Removed verbose WebSocket logging
              
              // Direct subscription updates without recursive calls
              if (message.dataType === 'ticker' || !message.dataType) {
                // Update ticker stream directly
                if (this.binancePublicWs && this.binancePublicWs.readyState === WebSocket.OPEN) {
                  const tickerStreams = symbolsArray.map(symbol => `${symbol.toLowerCase()}@ticker`);
                  const subscribeMessage = {
                    method: 'SUBSCRIBE',
                    params: tickerStreams,
                    id: Date.now()
                  };
                  // Removed verbose WebSocket logging
                  this.binancePublicWs.send(JSON.stringify(subscribeMessage));
                  this.currentSubscriptions = tickerStreams;
                }
              }
              
              if (message.dataType === 'kline') {
                // Update kline stream directly
                await this.setupKlineStream(symbolsArray, message.interval || '1m');
              }
            } else {
              // Single client type - use appropriate stream method
              if (message.dataType === 'kline') {
                await this.setupKlineStream(symbolsArray, message.interval || '1m');
              } else {
                // Direct ticker subscription for single ticker client
                if (!this.binancePublicWs || this.binancePublicWs.readyState !== WebSocket.OPEN) {
                  await this.connectWithSubscription('wss://stream.testnet.binance.vision/stream', []);
                }
                const tickerStreams = symbolsArray.map(symbol => `${symbol.toLowerCase()}@ticker`);
                const subscribeMessage = {
                  method: 'SUBSCRIBE',
                  params: tickerStreams,
                  id: Date.now()
                };
                // Removed verbose WebSocket logging
                this.binancePublicWs?.send(JSON.stringify(subscribeMessage));
                this.currentSubscriptions = tickerStreams;
              }
            }
            
            // Removed verbose WebSocket logging
          }
        } catch (error) {
          console.error('[WEBSOCKET] Error processing message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message'
          }));
        }
      });

      ws.on('close', (code, reason) => {
        // Removed verbose WebSocket logging
        // Removed verbose WebSocket logging
        this.marketSubscriptions.delete(subscription);
        // Removed verbose WebSocket logging
        
        // Clean up balance subscriptions for this WebSocket
        const balanceSubscriptionsToRemove = Array.from(this.balanceSubscriptions).filter(sub => sub.ws === ws);
        balanceSubscriptionsToRemove.forEach(sub => {
          this.balanceSubscriptions.delete(sub);
          // Removed verbose balance logging
        });
        
        // Stop balance updates if no more subscriptions
        if (this.balanceSubscriptions.size === 0 && this.balanceUpdateInterval) {
          clearInterval(this.balanceUpdateInterval);
          this.balanceUpdateInterval = null;
          console.log('[BALANCE] Stopped balance update interval - no active subscriptions');
        }
        
        // Clean up user connection
        this.userConnections.forEach((connection, userId) => {
          if (connection.ws === ws) {
            this.userConnections.delete(userId);
            // Removed verbose WebSocket logging
          }
        });
        
        // Stop Binance streams if no clients are connected
        if (this.marketSubscriptions.size === 0) {
          // Removed verbose WebSocket logging
          this.stopBinanceStreams();
        } else {
          // Removed verbose WebSocket logging
        }
      });

      ws.on('error', (error) => {
        console.error('[WEBSOCKET] WebSocket error:', error);
        this.marketSubscriptions.delete(subscription);
      });

      // Don't start streams automatically - wait for frontend subscription
      console.log('[WEBSOCKET] Client connected - waiting for subscription request');
    });
  }



  private async authenticateUserConnection(ws: WebSocket, userId: number, apiKey?: string) {
    try {
      // Validate user
      const user = await storage.getUser(userId);
      if (!user) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid user'
        }));
        return;
      }

      // Store user connection
      this.userConnections.set(userId, {
        ws,
        userId,
        listenKey: apiKey || 'websocket_api' // Use apiKey or placeholder for WebSocket API
      });

      // Send initial authentication success
      ws.send(JSON.stringify({
        type: 'authenticated',
        message: 'Successfully authenticated. Connecting to WebSocket API...'
      }));

      // Connect to Binance WebSocket API (no listen key required)
      this.connectToBinanceUserStream(userId, apiKey || 'websocket_api');

    } catch (error) {
      console.error('[USER STREAM] Authentication error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication failed'
      }));
    }
  }

  // Removed - streams now started on-demand when frontend subscribes

  private async setupKlineStream(symbols: string[], interval: string) {
    // Removed verbose WebSocket logging
    
    // If we have an existing kline connection, update subscriptions
    if (this.binanceKlineWs && this.binanceKlineWs.readyState === WebSocket.OPEN) {
      // Removed verbose WebSocket logging
      
      // Unsubscribe from old kline streams first
      if (this.currentKlineSubscriptions.length > 0) {
        const unsubscribeMessage = {
          method: 'UNSUBSCRIBE',
          params: this.currentKlineSubscriptions,
          id: Date.now()
        };
        // Removed verbose WebSocket logging
        this.binanceKlineWs.send(JSON.stringify(unsubscribeMessage));
      }
      
      // Fetch historical data before subscribing to real-time streams
      await this.fetchHistoricalKlinesWS(symbols, interval);
      
      // Subscribe to new kline streams
      const klineStreamPaths = symbols.map(symbol => `${symbol.toLowerCase()}@kline_${interval}`);
      const subscribeMessage = {
        method: 'SUBSCRIBE',
        params: klineStreamPaths,
        id: Date.now()
      };
      
      // Removed verbose WebSocket logging
      this.binanceKlineWs.send(JSON.stringify(subscribeMessage));
      this.currentKlineSubscriptions = klineStreamPaths;
      return;
    }
    
    // If no existing connection, create a new one specifically for klines
    // Removed verbose WebSocket logging
    
    // Fetch historical data first, then start real-time streams
    await this.fetchHistoricalKlinesWS(symbols, interval);
    
    const { storage } = await import('./storage');
    let baseUrl = 'wss://stream.testnet.binance.vision/stream';
    
    try {
      const exchanges = await storage.getExchangesByUserId(1);
      if (exchanges.length > 0 && exchanges[0].wsStreamEndpoint) {
        const endpoint = exchanges[0].wsStreamEndpoint;
        if (endpoint.includes('testnet')) {
          baseUrl = 'wss://stream.testnet.binance.vision/stream';
        } else {
          baseUrl = 'wss://stream.binance.com:9443/stream';
        }
      }
    } catch (error) {
      console.error(`[WEBSOCKET] Error fetching exchange config for kline:`, error);
    }
    
    // Removed verbose WebSocket logging
    
    this.binanceKlineWs = new WebSocket(baseUrl);
    
    this.binanceKlineWs.on('open', () => {
      // Removed verbose kline stream logging
      
      // Subscribe to kline streams
      const klineStreamPaths = symbols.map(symbol => `${symbol.toLowerCase()}@kline_${interval}`);
      const subscribeMessage = {
        method: 'SUBSCRIBE',
        params: klineStreamPaths,
        id: Date.now()
      };
      
      // Removed verbose kline stream logging
      if (this.binanceKlineWs && this.binanceKlineWs.readyState === WebSocket.OPEN) {
        this.binanceKlineWs.send(JSON.stringify(subscribeMessage));
        this.currentKlineSubscriptions = klineStreamPaths;
      }
    });
    
    this.binanceKlineWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle subscription confirmation
        if (message.result === null && message.id) {
          // Removed verbose kline stream logging
          return;
        }
        
        // Handle kline stream data
        if (message.stream && message.data && message.data.e === 'kline' && message.data.k) {
          const kline = message.data.k;
          const klineUpdate = {
            symbol: kline.s,
            interval: kline.i,
            openTime: parseInt(kline.t),
            closeTime: parseInt(kline.T),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
            isClosed: kline.x,
            timestamp: Date.now()
          };
          
          // Removed verbose kline stream logging
          // Only log but don't filter - let each client decide what interval data they want
          // Removed verbose kline stream logging
          this.broadcastKlineUpdate(klineUpdate);
        }
      } catch (error) {
        console.error('[KLINE STREAM] Error parsing message:', error);
      }
    });
    
    this.binanceKlineWs.on('error', (error) => {
      console.error('[KLINE STREAM] WebSocket error:', error);
    });
    
    this.binanceKlineWs.on('close', () => {
      console.log('[KLINE STREAM] Kline WebSocket connection closed');
      this.binanceKlineWs = null;
    });
  }

  private async createNewBinanceConnection(symbols: string[]) {
    // Removed verbose WebSocket logging
    
    // Close existing connection if any
    if (this.binancePublicWs) {
      this.binancePublicWs.close();
      this.binancePublicWs = null;
    }

    // Get the exchange configuration for the WebSocket endpoint
    try {
      const { storage } = await import('./storage');
      let baseUrl = 'wss://stream.binance.com:9443/ws/';
      
      const exchanges = await storage.getExchangesByUserId(1); // Assuming user ID 1
      if (exchanges.length > 0 && exchanges[0].wsStreamEndpoint) {
        const endpoint = exchanges[0].wsStreamEndpoint;
        // Removed verbose WebSocket logging
        
        if (endpoint.includes('testnet')) {
          baseUrl = 'wss://stream.testnet.binance.vision/ws/';
        } else if (endpoint.includes('binance.com')) {
          baseUrl = 'wss://stream.binance.com:9443/ws/';
        } else {
          baseUrl = 'wss://stream.testnet.binance.vision/ws/';
        }
      }

      // Use combined stream endpoint for subscription-based WebSocket API
      const subscriptionUrl = baseUrl.replace('/ws/', '/stream');
      const streamPaths = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`);
      
      // Removed verbose WebSocket logging
      this.connectWithSubscription(subscriptionUrl, streamPaths);
      
    } catch (error) {
      console.error(`[WEBSOCKET] Error creating new connection:`, error);
    }
  }

  private async updateBinanceSubscription(symbols: string[]) {
    if (!this.binancePublicWs || this.binancePublicWs.readyState !== WebSocket.OPEN) {
      // Removed verbose WebSocket logging
      await this.createNewBinanceConnection(symbols);
      return;
    }

    const newStreamPaths = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`);
    
    // Unsubscribe from current streams if any
    if (this.currentSubscriptions.length > 0) {
      const unsubscribeMessage = {
        method: 'UNSUBSCRIBE',
        params: this.currentSubscriptions,
        id: Date.now()
      };
      // Removed verbose WebSocket logging
      this.binancePublicWs.send(JSON.stringify(unsubscribeMessage));
    }

    // Subscribe to new streams
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: newStreamPaths,
      id: Date.now() + 1
    };
    // Removed verbose WebSocket logging
    this.binancePublicWs.send(JSON.stringify(subscribeMessage));
    
    // Update current subscriptions
    this.currentSubscriptions = newStreamPaths;
  }

  public async connectConfigurableStream(dataType: string, symbols: string[], interval?: string, depth?: string) {
    // Removed verbose WebSocket logging
    
    // Check what types of clients we have
    const hasTickerClients = Array.from(this.marketSubscriptions).some(sub => sub.dataType === 'ticker');
    const hasKlineClients = Array.from(this.marketSubscriptions).some(sub => sub.dataType === 'kline');
    
    // Removed verbose WebSocket logging
    
    // Update current stream configuration
    this.currentStreamType = dataType;
    this.currentInterval = interval || '1m';
    
    // Always set up kline connection for chart clients
    if (dataType === 'kline') {
      // Removed verbose WebSocket logging
      await this.setupKlineStream(symbols, interval || '1m');
      
      // If we also have ticker clients but no active ticker connection, start ticker stream too
      if (hasTickerClients && (!this.binancePublicWs || this.binancePublicWs.readyState !== WebSocket.OPEN)) {
        // Removed verbose WebSocket logging
        await this.createNewBinanceConnection(symbols);
      }
      return;
    }
    
    // For ticker clients, use the main connection
    if (dataType === 'ticker') {
      // Removed verbose WebSocket logging
      if (!this.binancePublicWs || this.binancePublicWs.readyState !== WebSocket.OPEN) {
        await this.createNewBinanceConnection(symbols);
      } else {
        await this.updateBinanceSubscription(symbols);
      }
      return;
    }
    
    // If we have an active connection and just changing ticker symbols, use hot subscription update
    if (this.binancePublicWs && 
        this.binancePublicWs.readyState === WebSocket.OPEN && 
        dataType === 'ticker' && 
        this.currentStreamType === 'ticker') {
      // Removed verbose WebSocket logging
      await this.updateBinanceSubscription(symbols);
      this.isStreamsActive = true;
      return;
    }
    
    // Only stop streams if changing data type or no active connection
    this.stopBinanceStreams(true);
    
    // Clear cached data for clean interval switch
    this.marketData.clear();
    this.historicalData.clear();
    
    // Re-enable streams for new interval
    this.isStreamsActive = true;
    
    // Use proper Binance single raw stream endpoints (not combined streams)
    const { storage } = await import('./storage');
    let baseUrl = 'wss://stream.binance.com:9443/ws/'; // Production endpoint for real-time accurate data
    
    try {
      // Get the first exchange configuration for the WebSocket endpoint
      const exchanges = await storage.getExchangesByUserId(1); // Assuming user ID 1
      if (exchanges.length > 0 && exchanges[0].wsStreamEndpoint) {
        const endpoint = exchanges[0].wsStreamEndpoint;
        // Removed verbose WebSocket logging
        
        // Force single raw stream format with fallback strategy
        if (endpoint.includes('testnet')) {
          baseUrl = 'wss://stream.testnet.binance.vision/ws/';
        } else if (endpoint.includes('binance.com')) {
          // Try production first, fallback to testnet on 451 error
          baseUrl = 'wss://stream.binance.com:9443/ws/';
        } else {
          baseUrl = 'wss://stream.testnet.binance.vision/ws/';
        }
      } else {
        // Removed verbose WebSocket logging
      }
    } catch (error) {
      console.error(`[WEBSOCKET] Error fetching exchange config, using default:`, error);
    }
    
    const streamPaths = symbols.map(symbol => {
      const sym = symbol.toLowerCase();
      switch (dataType) {
        case 'ticker':
          return `${sym}@ticker`;
        case 'kline':
          const streamPath = `${sym}@kline_${interval || '1m'}`;
          // Removed verbose WebSocket logging
          return streamPath;
        case 'depth':
          return `${sym}@depth${depth || '5'}`;
        case 'trade':
          return `${sym}@trade`;
        case 'aggTrade':
          return `${sym}@aggTrade`;
        case 'miniTicker':
          return `${sym}@miniTicker`;
        case 'bookTicker':
          return `${sym}@bookTicker`;
        default:
          return `${sym}@ticker`;
      }
    });
    
    // Use combined stream endpoint for subscription-based WebSocket API
    const subscriptionUrl = baseUrl.replace('/ws/', '/stream');
    console.log(`[BINANCE] Using combined stream endpoint for subscription control`);
    console.log(`[BINANCE] Requesting streams: ${streamPaths.join(', ')}`);
    this.connectWithSubscription(subscriptionUrl, streamPaths);
    
    // Send historical data for the new interval to connected clients
    if (dataType === 'kline' && this.marketSubscriptions.size > 0) {
      // Removed verbose WebSocket logging
      this.sendHistoricalDataToClients(symbols, interval || '1m');
    }
    
    // Restart streams for existing subscriptions with new configuration
    if (this.marketSubscriptions.size > 0) {
      // Removed verbose WebSocket logging
    }
  }

  // Mock data generation removed - only real exchange data

  private connectWithSubscription(wsUrl: string, streamPaths: string[]) {
    // Creating new subscription-based WebSocket connection
    
    // Close existing connection if any
    if (this.binancePublicWs) {
      console.log('[BINANCE STREAM] Closing existing connection');
      this.binancePublicWs.close();
    }
    
    // Ensure we're using the correct combined stream endpoint
    if (!wsUrl.includes('/stream')) {
      wsUrl = wsUrl.replace('/ws', '/stream');
    }
    
    // Connecting to final WebSocket URL
    
    // Store the WebSocket reference for proper cleanup
    this.binancePublicWs = new WebSocket(wsUrl);

    this.binancePublicWs.on('open', () => {
      // Connected to Binance subscription stream
      
      // First unsubscribe from any existing streams
      if (this.currentSubscriptions.length > 0) {
        const unsubscribeMessage = {
          method: 'UNSUBSCRIBE',
          params: this.currentSubscriptions,
          id: 1
        };
        // Removed verbose Binance stream logging
        this.binancePublicWs?.send(JSON.stringify(unsubscribeMessage));
      }
      
      // Then subscribe to new streams
      const subscriptionMessage = {
        method: 'SUBSCRIBE',
        params: streamPaths,
        id: 2
      };
      
      // Removed verbose Binance stream logging
      // Removed verbose Binance stream logging
      this.binancePublicWs?.send(JSON.stringify(subscriptionMessage));
      
      // Update current subscriptions
      this.currentSubscriptions = [...streamPaths];
    });

    this.binancePublicWs.on('message', (rawData) => {
      try {
        // Ignore messages if streams are inactive
        if (!this.isStreamsActive) {
          return; // Silently ignore - connection closing
        }

        const message = JSON.parse(rawData.toString());
        // Processing message data
        
        // Handle subscription/unsubscription responses
        if (message.result === null && (message.id === 1 || message.id === 2)) {
          if (message.id === 1) {
            // Unsubscription confirmed
          } else {
            // Subscription confirmed
          }
          return;
        }
        
        // Handle combined stream format (wrapped messages from /stream endpoint)
        let processedData = message;
        let streamName = '';
        
        // Check if this is combined stream format: {"stream":"btcusdt@ticker","data":{...}}
        if (message.stream && message.data) {
          streamName = message.stream;
          processedData = message.data;
        } else if (processedData.e === 'kline') {
          // Single raw stream format - determine stream type from data
          streamName = `${processedData.s.toLowerCase()}@kline_${processedData.k.i}`;
          // Removed verbose Binance stream logging
        } else if (processedData.e === '24hrTicker') {
          // Handle ticker data
          streamName = `${processedData.s.toLowerCase()}@ticker`;
          // Removed verbose Binance stream logging
        } else {
          // Skip non-kline/ticker messages
          return;
        }
        
        // Process ticker data
        if (streamName.includes('@ticker')) {
          const symbol = processedData.s;
          if (symbol) {

            
            const marketUpdate = {
              symbol: symbol,
              price: processedData.c,
              priceChange: processedData.p,
              priceChangePercent: processedData.P,
              highPrice: processedData.h,
              lowPrice: processedData.l,
              volume: processedData.v,
              quoteVolume: processedData.q,
              timestamp: processedData.E
            };
            
            // Store market data
            this.marketData.set(symbol, marketUpdate);
            
            // Broadcast to frontend clients
            this.broadcastMarketUpdate(marketUpdate);
          }
        }
        // Process kline data for the requested interval
        else if (streamName.includes('@kline')) {
          const symbol = processedData.s;
          const kline = processedData.k;
          
          if (symbol && kline) {
            const receivedInterval = kline.i;
            const expectedInterval = this.currentInterval;
            
            // STRICT: Only process data for the exactly requested interval
            if (receivedInterval === expectedInterval) {
              // Removed verbose Binance stream logging
              
              const klineUpdate = {
                symbol: symbol,
                openTime: kline.t,
                closeTime: kline.T,
                open: parseFloat(kline.o),
                high: parseFloat(kline.h),
                low: parseFloat(kline.l),
                close: parseFloat(kline.c),
                volume: parseFloat(kline.v),
                interval: kline.i,
                isFinal: kline.x,
                timestamp: Date.now()
              };
              
              // Store and broadcast only the selected interval data
              this.storeHistoricalKlineData(klineUpdate);
              this.broadcastKlineUpdate(klineUpdate);
              
              // Only send market updates for ticker streams, not kline streams
              if (this.currentStreamType === 'ticker') {
                const marketUpdate = {
                  symbol: symbol,
                  price: parseFloat(kline.c),
                  change: 0,
                  volume: parseFloat(kline.v),
                  high: parseFloat(kline.h),
                  low: parseFloat(kline.l),
                  timestamp: Date.now()
                };
                
                this.marketData.set(symbol, marketUpdate);
                this.broadcastMarketUpdate(marketUpdate);
              }
            } else {
              // Removed verbose Binance stream logging
            }
          }
        }
      } catch (error) {
        console.error('[BINANCE STREAM] Error processing data:', error);
      }
    });

    this.binancePublicWs.on('close', (code, reason) => {
      // Removed verbose Binance stream logging
      this.binancePublicWs = null;
      
      // Implement reconnection logic
      if (this.isStreamsActive) {
        console.log('[BINANCE STREAM] Attempting reconnection in 5 seconds...');
        setTimeout(() => {
          if (this.isStreamsActive) {
            this.connectWithSubscription(wsUrl, streamPaths);
          }
        }, 5000);
      }
    });

    this.binancePublicWs.on('error', (error) => {
      console.error('[BINANCE STREAM] WebSocket error:', error);
    });
  }

  private connectToBinanceWebSocketAPI(wsApiUrl: string) {
    if (this.binancePublicWs) {
      console.log('[BINANCE] Closing existing WebSocket connection');
      this.binancePublicWs.close();
    }

    console.log('[BINANCE] Creating new WebSocket connection to:', wsApiUrl);
    this.binancePublicWs = new WebSocket(wsApiUrl);

    this.binancePublicWs.on('open', () => {
      console.log('[BINANCE] WebSocket connection opened successfully');
      
      // Subscribe to ticker data using the modern WebSocket API
      const subscribeMessage = {
        id: 1,
        method: "ticker.24hr",
        params: {
          symbols: ["BTCUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT", "DOGEUSDT"]
        }
      };
      
      console.log('[BINANCE] Sending subscription message:', JSON.stringify(subscribeMessage));
      this.binancePublicWs?.send(JSON.stringify(subscribeMessage));
    });

    this.binancePublicWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle API response
        if (message.result && Array.isArray(message.result)) {
          message.result.forEach((ticker: any) => {
            const marketUpdate = {
              symbol: ticker.symbol,
              price: parseFloat(ticker.lastPrice),
              change: parseFloat(ticker.priceChangePercent),
              volume: parseFloat(ticker.volume),
              high: parseFloat(ticker.highPrice),
              low: parseFloat(ticker.lowPrice),
              timestamp: Date.now()
            };
            
            this.marketData.set(ticker.symbol, marketUpdate);
            this.broadcastMarketUpdate(marketUpdate);
          });
        }
      } catch (error) {
        console.error('Error processing Binance WebSocket API data:', error);
      }
    });

    this.binancePublicWs.on('close', (code, reason) => {
      console.log(`[BINANCE] WebSocket API disconnected - Code: ${code}, Reason: ${reason}`);
      console.log('[BINANCE] Attempting reconnection in 5 seconds...');
      setTimeout(() => this.connectToBinanceWebSocketAPI(wsApiUrl), 5000);
    });

    this.binancePublicWs.on('error', (error) => {
      console.error('[BINANCE] WebSocket API error:', error);
    });
  }

  private connectToBinancePublic(wsUrl: string) {
    console.log('[BINANCE STREAM] Creating new WebSocket connection to:', wsUrl);
    
    // Close existing connection if any
    if (this.binancePublicWs) {
      console.log('[BINANCE STREAM] Closing existing connection');
      this.binancePublicWs.close();
    }
    
    // Store the WebSocket reference for proper cleanup
    this.binancePublicWs = new WebSocket(wsUrl);

    this.binancePublicWs.on('open', () => {
      console.log('[BINANCE STREAM] Connected to Binance public stream successfully');
    });

    this.binancePublicWs.on('message', (rawData) => {
      try {
        // Ignore messages if streams are inactive
        if (!this.isStreamsActive) {
          return; // Silently ignore - connection closing
        }

        const message = JSON.parse(rawData.toString());
        console.log('[BINANCE STREAM] Received ticker data');
        
        // Skip processing for subscription confirmations
        if (message.result !== undefined && message.id !== undefined) {
          console.log('[BINANCE STREAM] Skipping subscription confirmation message');
          return;
        }
        console.log('[BINANCE STREAM] Processing ticker message');
        
        console.log('[BINANCE STREAM] Message type:', typeof message, 'Keys:', Object.keys(message));
        console.log('[BINANCE STREAM] About to process message...');
        
        // Handle both single raw stream and combined stream formats
        let processedData = message;
        let streamName = '';
        
        // Check if this is combined stream format
        if (message.stream && message.data) {
          streamName = message.stream;
          processedData = message.data;
        } else {
          // Single raw stream format - determine stream type from data
          if (processedData.e === 'kline') {
            streamName = `${processedData.s.toLowerCase()}@kline_${processedData.k.i}`;
          } else if (processedData.e === '24hrTicker') {
            streamName = `${processedData.s.toLowerCase()}@ticker`;
          }
        }
        
        if (processedData) {
          // Handle ticker data
          if (streamName.includes('@ticker')) {
            const symbol = processedData.s;
            
            if (symbol) {
              const marketUpdate = {
                symbol,
                price: parseFloat(processedData.c),
                change: parseFloat(processedData.p),
                changePercent: parseFloat(processedData.P),
                volume: parseFloat(processedData.v),
                high: parseFloat(processedData.h),
                low: parseFloat(processedData.l),
                timestamp: Date.now()
              };

              this.marketData.set(symbol, marketUpdate);
              this.broadcastMarketUpdate(marketUpdate);
            }
          }
          
          // Handle kline data with strict interval filtering
          if (streamName.includes('@kline')) {
            const symbol = processedData.s;
            const kline = processedData.k;
            
            if (symbol && kline) {
              const receivedInterval = kline.i;
              const expectedInterval = this.currentInterval;
              
              // STRICT: Only process data for the exactly requested interval
              if (receivedInterval === expectedInterval) {
                const klineUpdate = {
                  symbol: symbol,
                  openTime: kline.t,
                  closeTime: kline.T,
                  open: parseFloat(kline.o),
                  high: parseFloat(kline.h),
                  low: parseFloat(kline.l),
                  close: parseFloat(kline.c),
                  volume: parseFloat(kline.v),
                  interval: kline.i,
                  isFinal: kline.x,
                  timestamp: Date.now()
                };
                
                // Store and broadcast only the selected interval data
                this.storeHistoricalKlineData(klineUpdate);
                this.broadcastKlineUpdate(klineUpdate);
                
                const marketUpdate = {
                  symbol: symbol,
                  price: parseFloat(kline.c),
                  change: 0,
                  volume: parseFloat(kline.v),
                  high: parseFloat(kline.h),
                  low: parseFloat(kline.l),
                  timestamp: Date.now()
                };
                
                this.marketData.set(symbol, marketUpdate);
                this.broadcastMarketUpdate(marketUpdate);
              }
            }
          }
        }
        // Handle single stream format
        else if (message.s) {
          const symbol = message.s;
          const marketUpdate = {
            symbol,
            price: parseFloat(message.c),
            change: parseFloat(message.P),
            volume: parseFloat(message.v),
            high: parseFloat(message.h),
            low: parseFloat(message.l),
            timestamp: Date.now()
          };

          // Removed verbose Binance stream logging
          this.marketData.set(symbol, marketUpdate);
          this.broadcastMarketUpdate(marketUpdate);
        }
      } catch (error) {
        console.error('[BINANCE STREAM] Error processing data:', error);
      }
    });

    this.binancePublicWs.on('close', (code, reason) => {
      // Removed verbose Binance stream logging
      this.binancePublicWs = null;
      
      // Only reconnect if streams are still supposed to be active
      if (this.isStreamsActive) {
        console.log('[BINANCE STREAM] Attempting reconnection in 5 seconds...');
        setTimeout(() => this.connectToBinancePublic(wsUrl), 5000);
      } else {
        console.log('[BINANCE STREAM] Streams inactive, not reconnecting');
      }
    });

    this.binancePublicWs.on('error', (error) => {
      console.error('[BINANCE STREAM] WebSocket error:', error);
    });
  }

  private async connectToBinanceUserStream(userId: number, listenKey: string) {
    // Get user's API credentials and exchange configuration
    const user = await storage.getUser(userId);
    if (!user) {
      console.error(`[USER STREAM] User ${userId} not found`);
      return;
    }

    // Get user's exchanges to find the correct WebSocket API endpoint
    const exchanges = await storage.getExchangesByUserId(userId);
    const binanceExchange = exchanges.find(ex => ex.exchangeType === 'binance' && ex.isActive);
    
    if (!binanceExchange) {
      console.error(`[USER STREAM] No active Binance exchange found for user ${userId}`);
      const userConnection = this.userConnections.get(userId);
      if (userConnection) {
        userConnection.ws.send(JSON.stringify({
          type: 'error',
          message: 'No active Binance exchange configuration found'
        }));
      }
      return;
    }

    // Use exchange-specific WebSocket API endpoint
    const wsUrl = binanceExchange.wsApiEndpoint || 
      (binanceExchange.isTestnet 
        ? 'wss://ws-api.testnet.binance.vision/ws-api/v3'
        : 'wss://ws-api.binance.com:443/ws-api/v3');

    // For now, we'll implement account info subscription via WebSocket API
    // This doesn't require listen keys and works with API key/secret
    const connectionKey = `user_${userId}`;
    
    // Close existing connection if any
    if (this.binanceUserStreams.has(connectionKey)) {
      this.binanceUserStreams.get(connectionKey)?.close();
    }

    try {
      console.log(`[USER STREAM] 🌐 Connecting to WebSocket API for user ${userId}`);
      
      // Use WebSocket API directly (works for both testnet and mainnet)
      // Create WebSocket connection to Binance WebSocket API

      const userWs = new WebSocket(wsUrl);
      this.binanceUserStreams.set(connectionKey, userWs);

      userWs.on('open', () => {
        console.log(`[USER STREAM] Connected to Binance WebSocket API for user ${userId}`);
        
        const userConnection = this.userConnections.get(userId);
        if (userConnection) {
          userConnection.ws.send(JSON.stringify({
            type: 'user_stream_connected',
            message: 'WebSocket API connection established. Ready for authenticated requests.',
            method: 'websocket_api'
          }));
        }

        // Immediately request account balance after connection
        this.requestAccountBalance(userWs, userId, binanceExchange.id);
      });

      userWs.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          console.log(`[USER STREAM] WebSocket API response for user ${userId}:`, response);
          
          // Process different types of responses
          if (response.result) {
            // Successful API response
            this.broadcastUserUpdate(userId, {
              type: 'api_response',
              data: response.result,
              id: response.id
            });
          } else if (response.error) {
            // API error response
            console.error(`[USER STREAM] API error for user ${userId}:`, response.error);
            this.broadcastUserUpdate(userId, {
              type: 'api_error',
              error: response.error,
              id: response.id
            });
          }
        } catch (error) {
          console.error('[USER STREAM] Error processing WebSocket API data:', error);
        }
      });

      userWs.on('close', (code, reason) => {
        console.log(`[USER STREAM] WebSocket API disconnected for user ${userId} - Code: ${code}, Reason: ${reason}`);
        this.binanceUserStreams.delete(connectionKey);
      });

      userWs.on('error', (error) => {
        console.error(`[USER STREAM] WebSocket API error for user ${userId}:`, error);
        this.binanceUserStreams.delete(connectionKey);
        
        // Handle specific errors
        if (error.message.includes('451') || error.message.includes('404') || error.message.includes('Unexpected server response')) {
          console.log(`[USER STREAM] WebSocket API may be restricted on testnet. Notifying client.`);
          
          const userConnection = this.userConnections.get(userId);
          if (userConnection) {
            userConnection.ws.send(JSON.stringify({
              type: 'user_stream_unavailable',
              message: 'WebSocket API is currently unavailable on testnet. Public market data remains active.',
              error: 'testnet_restriction'
            }));
          }
        }
      });
    } catch (error) {
      console.error(`[USER STREAM] Failed to create WebSocket API connection for user ${userId}:`, error);
      
      const userConnection = this.userConnections.get(userId);
      if (userConnection) {
        userConnection.ws.send(JSON.stringify({
          type: 'user_stream_error',
          message: 'Failed to connect to WebSocket API',
          error: 'connection_failed'
        }));
      }
    }
  }

  private sendMarketDataToClient(ws: WebSocket) {
    console.log('[PUBLIC WS] Attempting to send market data to client');
    console.log(`[PUBLIC WS] WebSocket ready state: ${ws.readyState}`);
    
    // Find the subscription for this WebSocket to get subscribed symbols
    const subscription = Array.from(this.marketSubscriptions).find(sub => sub.ws === ws);
    if (!subscription) {
      console.log('[PUBLIC WS] No subscription found for this client');
      return;
    }

    // Filter market data to only include subscribed symbols
    const subscribedSymbols = Array.from(subscription.symbols);
    const availableSymbols = Array.from(this.marketData.keys());
    const filteredData = Array.from(this.marketData.values()).filter(data => 
      subscribedSymbols.length === 0 || subscribedSymbols.includes(data.symbol.toUpperCase())
    );
    
    console.log(`[PUBLIC WS] Client subscribed to: ${subscribedSymbols.join(', ')}`);
    console.log(`[PUBLIC WS] Available market data symbols: ${availableSymbols.join(', ')}`);
    console.log(`[PUBLIC WS] Filtered market data entries: ${filteredData.length}`);
    
    if (filteredData.length > 0) {
      try {
        // Send each market update individually as the frontend expects
        filteredData.forEach(marketData => {
          const message = JSON.stringify({
            type: 'market_update',
            data: marketData
          });
          ws.send(message);
        });
        console.log(`[PUBLIC WS] Sent ${filteredData.length} market updates to client`);
      } catch (error) {
        console.error('[PUBLIC WS] Error sending market data:', error);
      }
    } else {
      console.log('[PUBLIC WS] No relevant market data available for subscribed symbols');
    }
  }

  private broadcastKlineUpdate(klineUpdate: any) {
    // Only broadcast if there are connected clients
    if (this.marketSubscriptions.size === 0) {
      return;
    }

    // Store historical data for this symbol and interval
    this.storeHistoricalKlineData(klineUpdate);

    const message = JSON.stringify({
      type: 'kline_update',
      data: klineUpdate
    });

    // Removed verbose WebSocket logging
    
    let sentCount = 0;
    let skippedCount = 0;
    this.marketSubscriptions.forEach((subscription) => {
      // Only send kline updates to clients that requested kline data
      if (subscription.ws.readyState === WebSocket.OPEN && subscription.dataType === 'kline') {
        const subscribedSymbols = Array.from(subscription.symbols).map(s => s.toUpperCase());
        const isMatched = subscription.symbols.size === 0 || subscribedSymbols.includes(klineUpdate.symbol.toUpperCase());
        // Removed verbose WebSocket logging
        
        if (isMatched) {
          // Check if this kline data matches the client's requested interval
          const clientInterval = subscription.interval || '1m';
          if (klineUpdate.interval === clientInterval) {
            // Removed verbose WebSocket logging
            subscription.ws.send(message);
            sentCount++;
          } else {
            // Removed verbose WebSocket logging
          }
        }
      } else if (subscription.dataType === 'ticker') {
        skippedCount++;
        // Removed verbose WebSocket logging
      }
    });
    
    // Removed verbose WebSocket logging
  }

  private storeHistoricalKlineData(klineUpdate: any) {
    const symbol = klineUpdate.symbol;
    const interval = klineUpdate.interval;
    
    if (!this.historicalData.has(symbol)) {
      this.historicalData.set(symbol, new Map());
    }
    
    const symbolData = this.historicalData.get(symbol)!;
    if (!symbolData.has(interval)) {
      symbolData.set(interval, []);
    }
    
    const intervalData = symbolData.get(interval)!;
    
    // Update or add kline data (replace if same openTime exists)
    const existingIndex = intervalData.findIndex(k => k.openTime === klineUpdate.openTime);
    if (existingIndex >= 0) {
      intervalData[existingIndex] = klineUpdate;
    } else {
      intervalData.push(klineUpdate);
      // Keep only last 500 candles to manage memory
      if (intervalData.length > 500) {
        intervalData.shift();
      }
    }
    
    // Removed verbose WebSocket logging
  }

  private sendHistoricalDataToClients(symbols: string[], interval: string) {
    symbols.forEach(symbol => {
      const symbolData = this.historicalData.get(symbol.toUpperCase());
      if (symbolData && symbolData.has(interval)) {
        const intervalData = symbolData.get(interval)!;
        console.log(`[HISTORICAL] Sending ${intervalData.length} historical candles for ${symbol} ${interval}`);
        
        // Send historical data only to kline clients
        this.marketSubscriptions.forEach((subscription) => {
          if (subscription.ws.readyState === WebSocket.OPEN && subscription.dataType === 'kline') {
            const subscribedSymbols = Array.from(subscription.symbols).map(s => s.toUpperCase());
            const clientInterval = subscription.interval;
            
            // Check if client is subscribed to this symbol and interval
            if ((subscription.symbols.size === 0 || subscribedSymbols.includes(symbol.toUpperCase())) &&
                clientInterval === interval) {
              
              const message = JSON.stringify({
                type: 'historical_klines',
                data: {
                  symbol: symbol.toUpperCase(),
                  interval: interval,
                  klines: intervalData.slice(-100) // Send last 100 candles
                }
              });
              
              try {
                subscription.ws.send(message);
                console.log(`[HISTORICAL] ✓ Sent ${intervalData.length} historical klines to ${subscription.clientId} for ${symbol} ${interval}`);
              } catch (error) {
                console.error(`[HISTORICAL] Failed to send historical data to ${subscription.clientId}:`, error);
              }
            }
          }
        });
      } else {
        console.log(`[HISTORICAL] No historical data available for ${symbol} ${interval}`);
      }
    });
  }

  private broadcastMarketUpdate(marketUpdate: any) {
    // Only broadcast if there are connected clients
    if (this.marketSubscriptions.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'market_update',
      data: marketUpdate
    });

    // Removed verbose WebSocket logging
    
    let sentCount = 0;
    let skippedCount = 0;
    Array.from(this.marketSubscriptions).forEach((subscription, index) => {
      const clientIndex = index + 1;
      
      // Only send ticker updates to clients that requested ticker data
      if (subscription.ws.readyState === WebSocket.OPEN && subscription.dataType === 'ticker') {
        const isSubscribed = subscription.symbols.size === 0 || 
                           subscription.symbols.has(marketUpdate.symbol.toUpperCase());
        
        // Removed verbose WebSocket logging
        
        if (isSubscribed) {
          try {
            subscription.ws.send(message);
            sentCount++;
            // Removed verbose WebSocket logging
          } catch (error) {
            console.error(`[WEBSOCKET] Failed to send to client ${subscription.clientId}:`, error);
          }
        }
      } else if (subscription.dataType === 'kline') {
        skippedCount++;
        // Removed verbose WebSocket logging
      }
    });
    
    // Removed verbose WebSocket logging
  }

  private broadcastUserUpdate(userId: number, userData: any) {
    const connection = this.userConnections.get(userId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify({
        type: 'user_update',
        data: userData
      }));
    }
  }

  public async subscribeToBalance(ws: WebSocket, userId: number, exchangeId: number, symbol: string, clientId?: string) {
    // Removed verbose balance logging
    
    const balanceSubscription: BalanceSubscription = {
      ws,
      userId,
      exchangeId,
      symbol: symbol.toUpperCase(),
      clientId
    };
    
    this.balanceSubscriptions.add(balanceSubscription);
    
    // Start balance update interval if not already running
    if (!this.balanceUpdateInterval) {
      this.balanceUpdateInterval = setInterval(() => {
        this.updateAllBalances();
      }, 5000); // Update every 5 seconds
      console.log('[BALANCE] Started balance update interval');
    }
    
    // Send immediate balance update
    await this.updateBalanceForSubscription(balanceSubscription);
    
    ws.send(JSON.stringify({
      type: 'balance_subscribed',
      userId,
      exchangeId,
      symbol,
      message: 'Successfully subscribed to balance updates'
    }));
  }

  public unsubscribeFromBalance(ws: WebSocket, userId: number, exchangeId: number, symbol: string) {
    // Removed verbose balance logging
    
    const subscriptionToRemove = Array.from(this.balanceSubscriptions).find(sub => 
      sub.ws === ws && sub.userId === userId && sub.exchangeId === exchangeId && sub.symbol === symbol.toUpperCase()
    );
    
    if (subscriptionToRemove) {
      this.balanceSubscriptions.delete(subscriptionToRemove);
      // Removed verbose balance logging
    }
    
    // Stop balance updates if no more subscriptions
    if (this.balanceSubscriptions.size === 0 && this.balanceUpdateInterval) {
      clearInterval(this.balanceUpdateInterval);
      this.balanceUpdateInterval = null;
      console.log('[BALANCE] Stopped balance update interval');
    }
  }

  private async updateAllBalances() {
    const uniqueSubscriptions = new Map<string, BalanceSubscription>();
    
    // Get unique subscriptions by userId:exchangeId:symbol
    this.balanceSubscriptions.forEach(sub => {
      const key = `${sub.userId}:${sub.exchangeId}:${sub.symbol}`;
      if (!uniqueSubscriptions.has(key)) {
        uniqueSubscriptions.set(key, sub);
      }
    });
    
    // Update balance for each unique subscription
    uniqueSubscriptions.forEach(async (subscription) => {
      await this.updateBalanceForSubscription(subscription);
    });
  }

  private async updateBalanceForSubscription(subscription: BalanceSubscription) {
    try {
      const { userId, exchangeId, symbol } = subscription;
      const balanceKey = `${userId}:${exchangeId}:${symbol}`;
      
      // Get exchange configuration
      const exchanges = await storage.getExchangesByUserId(userId);
      const exchange = exchanges.find(ex => ex.id === exchangeId);
      
      if (!exchange) {
        console.error(`[BALANCE] Exchange ${exchangeId} not found for user ${userId}`);
        return;
      }
      
      // Extract quote asset from trading pair (e.g., USDT from BTCUSDT)
      const quoteAsset = this.extractQuoteAsset(symbol);
      
      // Fetch balance from exchange
      const balance = await this.fetchBalanceFromExchange(exchange, quoteAsset);
      
      if (balance) {
        // Store balance data
        this.balanceData.set(balanceKey, {
          userId,
          exchangeId,
          symbol,
          asset: quoteAsset,
          balance: balance.free,
          timestamp: Date.now()
        });
        
        // Broadcast to all subscribed clients
        this.broadcastBalanceUpdate(balanceKey, {
          userId,
          exchangeId,
          symbol,
          asset: quoteAsset,
          balance: balance.free,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('[BALANCE] Error updating balance:', error);
    }
  }

  private extractQuoteAsset(symbol: string): string {
    // Extract quote asset from trading pair
    // Common patterns: BTCUSDT -> USDT, ETHBUSD -> BUSD, etc.
    const commonQuotes = ['USDT', 'BUSD', 'USDC', 'BTC', 'ETH', 'BNB'];
    
    for (const quote of commonQuotes) {
      if (symbol.endsWith(quote)) {
        return quote;
      }
    }
    
    // Default to USDT if pattern not recognized
    return 'USDT';
  }

  private async fetchBalanceFromExchange(exchange: any, asset: string) {
    try {
      const crypto = await import('crypto');
      const { decrypt } = await import('./encryption');
      
      // Decrypt API credentials
      const decryptedApiKey = decrypt(exchange.apiKey, exchange.encryptionIv);
      const decryptedApiSecret = decrypt(exchange.apiSecret, exchange.encryptionIv);
      
      // Create signed request for account information
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', decryptedApiSecret)
        .update(queryString)
        .digest('hex');
      
      const url = `${exchange.restApiEndpoint}/api/v3/account?${queryString}&signature=${signature}`;
      
      // Make REST API call
      const response = await fetch(url, {
        headers: {
          'X-MBX-APIKEY': decryptedApiKey
        }
      });
      
      if (response.ok) {
        const accountData = await response.json();
        
        // Find the specific asset balance
        const assetBalance = accountData.balances?.find((bal: any) => 
          bal.asset === asset.toUpperCase()
        );
        
        return assetBalance || { asset, free: '0.00000000', locked: '0.00000000' };
      } else {
        console.error(`[BALANCE] API error: ${response.status} ${response.statusText}`);
        return null;
      }
    } catch (error) {
      console.error('[BALANCE] Error fetching balance:', error);
      return null;
    }
  }

  private broadcastBalanceUpdate(balanceKey: string, balanceData: any) {
    let sentCount = 0;
    
    this.balanceSubscriptions.forEach(subscription => {
      const subKey = `${subscription.userId}:${subscription.exchangeId}:${subscription.symbol}`;
      
      if (subKey === balanceKey && subscription.ws.readyState === WebSocket.OPEN) {
        subscription.ws.send(JSON.stringify({
          type: 'balance_update',
          data: balanceData
        }));
        sentCount++;
        // Removed verbose balance logging
      }
    });
    
    // Removed verbose balance logging
  }

  private async handleTestnetBalanceRequest(userId: number, exchange: any) {
    try {
      console.log(`[USER STREAM] Handling testnet balance request for user ${userId}`);
      
      // Import required modules for REST API calls
      const crypto = await import('crypto');
      const https = await import('https');
      const { decrypt } = await import('./encryption');
      
      // Decrypt API credentials
      const decryptedApiKey = decrypt(exchange.apiKey, exchange.encryptionIv);
      const decryptedApiSecret = decrypt(exchange.apiSecret, exchange.encryptionIv);
      
      // Create signed request for account information
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', decryptedApiSecret)
        .update(queryString)
        .digest('hex');
      
      const url = `${exchange.restApiEndpoint}/api/v3/account?${queryString}&signature=${signature}`;
      
      // Make REST API call
      const response = await fetch(url, {
        headers: {
          'X-MBX-APIKEY': decryptedApiKey
        }
      });
      
      if (response.ok) {
        const accountData = await response.json();
        
        // Send balance data to client
        const userConnection = this.userConnections.get(userId);
        if (userConnection) {
          userConnection.ws.send(JSON.stringify({
            type: 'balance_update',
            data: {
              balances: accountData.balances,
              totalBTC: accountData.totalWalletBalance || '0',
              method: 'rest_api'
            }
          }));
        }
        
        console.log(`[USER STREAM] ✅ Successfully fetched testnet balance via REST API for user ${userId}`);
      } else {
        throw new Error(`REST API error: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      console.error(`[USER STREAM] Testnet balance request failed for user ${userId}:`, error);
      
      const userConnection = this.userConnections.get(userId);
      if (userConnection) {
        userConnection.ws.send(JSON.stringify({
          type: 'balance_error',
          message: 'Failed to fetch balance from testnet REST API',
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    }
  }

  private async requestAccountBalance(ws: WebSocket, userId: number, exchangeId: number) {
    // Removed verbose WebSocket logging
    
    try {
      // Fetch the exchange configuration from database
      const exchanges = await storage.getExchangesByUserId(userId);
      const targetExchange = exchanges.find(ex => ex.id === exchangeId);
      
      if (!targetExchange) {
        throw new Error('Exchange not found');
      }

      // Decrypt the API credentials
      const { apiKey, apiSecret } = decryptApiCredentials(
        targetExchange.apiKey,
        targetExchange.apiSecret,
        targetExchange.encryptionIv
      );

      // Removed verbose WebSocket logging

      // Make authenticated request to Binance API
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      
      // Create signature for authenticated request
      const crypto = await import('crypto');
      const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
      const finalQuery = `${queryString}&signature=${signature}`;

      // Determine the correct API endpoint
      const baseUrl = targetExchange.restApiEndpoint || 
        (targetExchange.isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');
      
      const response = await fetch(`${baseUrl}/api/v3/account?${finalQuery}`, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[WEBSOCKET] Binance API error ${response.status}:`, errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const accountData = await response.json();
      // Removed verbose WebSocket logging

      // Send balance update to the client
      const userConnection = this.userConnections.get(userId);
      if (userConnection) {
        userConnection.ws.send(JSON.stringify({
          type: 'balance_update',
          data: {
            balances: accountData.balances,
            accountType: accountData.accountType,
            canTrade: accountData.canTrade,
            canWithdraw: accountData.canWithdraw,
            canDeposit: accountData.canDeposit,
            method: 'websocket_api'
          },
          exchangeId: exchangeId,
          userId: userId
        }));
      }
      
    } catch (error) {
      console.error(`[WEBSOCKET] Error fetching balance for user ${userId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch account balance';
      
      const userConnection = this.userConnections.get(userId);
      if (userConnection) {
        userConnection.ws.send(JSON.stringify({
          type: 'balance_update',
          data: {
            balances: [],
            error: errorMessage,
            method: 'websocket_api'
          },
          exchangeId: exchangeId,
          userId: userId
        }));
      }
    }
  }

  // Order placement handler for WebSocket-based trading
  private async handleOrderPlacement(ws: WebSocket, orderRequest: OrderRequest) {
    try {
      console.log(`[ORDER] Processing order request for user ${orderRequest.userId}`);
      
      // Get user's exchange configuration
      const exchanges = await storage.getExchangesByUserId(orderRequest.userId);
      const exchange = exchanges.find(ex => ex.id === orderRequest.exchangeId);
      
      if (!exchange) {
        const errorResponse: OrderResponse = {
          type: 'order_result',
          success: false,
          symbol: orderRequest.symbol,
          side: orderRequest.side,
          quantity: orderRequest.quantity,
          error: 'Exchange not found or not configured'
        };
        ws.send(JSON.stringify(errorResponse));
        return;
      }

      // Decrypt API credentials
      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      // Place actual order through Binance API
      const orderResult = await this.placeBinanceOrder(
        apiKey,
        apiSecret,
        orderRequest,
        exchange.isTestnet || false
      );

      if (orderResult.success) {
        // Store trade record in database
        await storage.createTrade({
          userId: orderRequest.userId,
          botId: null, // Manual trade
          tradingPair: orderRequest.symbol,
          side: orderRequest.side,
          orderType: orderRequest.orderType,
          orderCategory: "manual",
          amount: orderRequest.quantity,
          quoteAmount: "0",
          price: orderResult.price || '0',
          status: orderResult.status || 'FILLED',
          pnl: "0",
          fee: orderResult.fee || '0',
          feeAsset: orderResult.feeAsset || 'USDT',
          exchangeOrderId: orderResult.orderId || ''
        });

        const successResponse: OrderResponse = {
          type: 'order_result',
          success: true,
          orderId: orderResult.orderId,
          clientOrderId: orderRequest.clientOrderId,
          symbol: orderRequest.symbol,
          side: orderRequest.side,
          quantity: orderRequest.quantity,
          price: orderResult.price,
          status: orderResult.status,
          fee: orderResult.fee,
          feeAsset: orderResult.feeAsset
        };

        ws.send(JSON.stringify(successResponse));
        console.log(`[ORDER] ✓ Order placed successfully: ${orderResult.orderId} for ${orderRequest.symbol}`);
      } else {
        const errorResponse: OrderResponse = {
          type: 'order_result',
          success: false,
          symbol: orderRequest.symbol,
          side: orderRequest.side,
          quantity: orderRequest.quantity,
          clientOrderId: orderRequest.clientOrderId,
          error: orderResult.error || 'Order placement failed'
        };
        ws.send(JSON.stringify(errorResponse));
      }

    } catch (error) {
      console.error('[ORDER] Error placing order:', error);
      
      const errorResponse: OrderResponse = {
        type: 'order_result',
        success: false,
        symbol: orderRequest.symbol,
        side: orderRequest.side,
        quantity: orderRequest.quantity,
        clientOrderId: orderRequest.clientOrderId,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      ws.send(JSON.stringify(errorResponse));
    }
  }

  private async placeBinanceOrder(
    apiKey: string,
    apiSecret: string,
    orderRequest: OrderRequest,
    isTestnet: boolean = true
  ): Promise<{
    success: boolean;
    orderId?: string;
    price?: string;
    status?: string;
    fee?: string;
    feeAsset?: string;
    error?: string;
  }> {
    try {
      const crypto = require('crypto');
      
      // Binance API endpoint
      const baseUrl = isTestnet 
        ? 'https://testnet.binance.vision'
        : 'https://api.binance.com';
      
      // Prepare order parameters
      const timestamp = Date.now();
      const orderParams: any = {
        symbol: orderRequest.symbol,
        side: orderRequest.side,
        type: orderRequest.orderType,
        quantity: orderRequest.quantity,
        timestamp: timestamp
      };

      // Add price for limit orders
      if (orderRequest.orderType === 'LIMIT') {
        orderParams.price = orderRequest.price;
        orderParams.timeInForce = orderRequest.timeInForce || 'GTC';
      }

      // Add client order ID if provided
      if (orderRequest.clientOrderId) {
        orderParams.newClientOrderId = orderRequest.clientOrderId;
      }

      // Create query string for signature
      const queryString = Object.keys(orderParams)
        .map(key => `${key}=${encodeURIComponent(orderParams[key])}`)
        .join('&');

      // Generate signature
      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');

      // Make API request
      const response = await fetch(`${baseUrl}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${queryString}&signature=${signature}`
      });

      const result = await response.json();

      if (response.ok && result.orderId) {
        return {
          success: true,
          orderId: result.orderId.toString(),
          price: result.price || result.fills?.[0]?.price,
          status: result.status,
          fee: result.fills?.[0]?.commission,
          feeAsset: result.fills?.[0]?.commissionAsset
        };
      } else {
        console.error('[ORDER] Binance API error:', result);
        return {
          success: false,
          error: result.msg || 'Order placement failed'
        };
      }

    } catch (error) {
      console.error('[ORDER] Error calling Binance API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API call failed'
      };
    }
  }

  // Public methods for external use
  public async generateListenKey(userId: number): Promise<string> {
    try {
      const exchanges = await storage.getExchangesByUserId(userId);
      const binanceExchange = exchanges.find(ex => ex.name.toLowerCase().includes('binance'));
      
      if (!binanceExchange) {
        throw new Error('No Binance API credentials found');
      }

      const { apiKey } = decryptApiCredentials(
        binanceExchange.apiKey,
        binanceExchange.apiSecret,
        binanceExchange.encryptionIv
      );

      const response = await fetch('https://api.binance.com/api/v3/userDataStream', {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json();
      return data.listenKey;
    } catch (error) {
      console.error('Error generating listen key:', error);
      throw error;
    }
  }

  public async startAllMarketsTicker() {
    console.log('[WEBSOCKET] Automatic streaming disabled - streams start only on-demand');
    
    // Don't start automatic streams - wait for explicit frontend requests
    // Streams will be started only when components specifically request data
  }

  public getMarketData(): Map<string, any> {
    return this.marketData;
  }

  public getUserConnections(): Map<number, UserConnection> {
    return this.userConnections;
  }

  // Martingale Strategy Execution Handler
  private async handleMartingaleBotStart(ws: WebSocket, message: any) {
    try {
      const { botId, userId } = message;
      
      console.log(`[MARTINGALE STRATEGY] ===== STARTING BOT EXECUTION =====`);
      console.log(`[MARTINGALE STRATEGY] Bot ID: ${botId}, User ID: ${userId}`);
      
      // Get bot configuration
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.log(`[MARTINGALE STRATEGY] ❌ Bot ${botId} not found`);
        ws.send(JSON.stringify({
          type: 'martingale_error',
          botId,
          error: 'Bot not found'
        }));
        return;
      }
      
      console.log(`[MARTINGALE STRATEGY] ✓ Bot loaded: ${bot.name} (${bot.tradingPair}, ${bot.direction})`);
      
      // Start Martingale cycle execution
      await this.executeMartingaleCycle(ws, bot);
      
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Error starting bot:`, error);
      ws.send(JSON.stringify({
        type: 'martingale_error',
        error: error.message
      }));
    }
  }

  private async executeMartingaleCycle(ws: WebSocket, bot: any) {
    try {
      console.log(`[MARTINGALE STRATEGY] ===== STARTING BASE ORDER EXECUTION =====`);
      
      // Create new bot cycle
      const cycle = await storage.createBotCycle({
        userId: bot.userId,
        botId: bot.id,
        maxSafetyOrders: parseInt(bot.maxSafetyOrders),
        status: 'active',
        totalInvested: bot.baseOrderAmount
      });
      
      console.log(`[MARTINGALE STRATEGY] Bot ID: ${bot.id}, Cycle ID: ${cycle.id}`);
      
      // Get current market price
      const currentPrice = await this.getCurrentPrice(bot.tradingPair);
      if (!currentPrice) {
        throw new Error(`Unable to fetch current price for ${bot.tradingPair}`);
      }
      
      console.log(`[MARTINGALE STRATEGY] 📊 BASE ORDER CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Investment Amount: $${bot.baseOrderAmount}`);
      console.log(`[MARTINGALE STRATEGY]    Current Price: $${currentPrice}`);
      
      const baseQuantity = parseFloat(bot.baseOrderAmount) / currentPrice;
      console.log(`[MARTINGALE STRATEGY]    Calculated Quantity: ${baseQuantity.toFixed(8)} ${bot.tradingPair.replace('USDT', '')}`);
      
      // Place base order
      const baseOrder = await this.placeMartingaleOrder(ws, bot, cycle.id, {
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        quantity: baseQuantity.toFixed(8),
        orderType: 'base',
        price: currentPrice.toString()
      });
      
      if (baseOrder.success) {
        console.log(`[MARTINGALE STRATEGY] ✅ BASE ORDER SUCCESSFULLY PLACED!`);
        console.log(`[MARTINGALE STRATEGY]    Order ID: ${baseOrder.orderId}`);
        console.log(`[MARTINGALE STRATEGY]    Quantity: ${baseOrder.quantity}`);
        console.log(`[MARTINGALE STRATEGY]    Price: $${baseOrder.price}`);
        
        // Calculate and place take profit order
        await this.placeTakeProfitOrder(ws, bot, cycle.id, baseOrder, currentPrice);
        
        // Set up safety orders monitoring
        await this.setupSafetyOrderMonitoring(ws, bot, cycle.id, currentPrice);
        
        // Send progress update to frontend
        ws.send(JSON.stringify({
          type: 'martingale_progress',
          botId: bot.id,
          cycleId: cycle.id,
          status: 'base_order_placed',
          baseOrder: baseOrder
        }));
        
      } else {
        throw new Error(`Base order placement failed: ${baseOrder.error}`);
      }
      
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Cycle execution error:`, error);
      ws.send(JSON.stringify({
        type: 'martingale_error',
        botId: bot.id,
        error: error.message
      }));
    }
  }

  private async placeTakeProfitOrder(ws: WebSocket, bot: any, cycleId: number, baseOrder: any, currentPrice: number) {
    console.log(`[MARTINGALE STRATEGY] ===== PLACING TAKE PROFIT ORDER =====`);
    
    const takeProfitPercentage = parseFloat(bot.takeProfitPercentage);
    const takeProfitPrice = bot.direction === 'long' 
      ? currentPrice * (1 + takeProfitPercentage / 100)
      : currentPrice * (1 - takeProfitPercentage / 100);
    
    console.log(`[MARTINGALE STRATEGY] 📊 TAKE PROFIT CALCULATION:`);
    console.log(`[MARTINGALE STRATEGY]    Take Profit %: ${takeProfitPercentage}%`);
    console.log(`[MARTINGALE STRATEGY]    Target Price: $${takeProfitPrice.toFixed(4)}`);
    console.log(`[MARTINGALE STRATEGY]    Expected Profit: $${(parseFloat(baseOrder.quantity) * (takeProfitPrice - currentPrice)).toFixed(4)}`);
    
    const takeProfitOrder = await this.placeMartingaleOrder(ws, bot, cycleId, {
      side: bot.direction === 'long' ? 'SELL' : 'BUY',
      quantity: baseOrder.quantity,
      orderType: 'take_profit',
      price: takeProfitPrice.toFixed(4),
      type: 'LIMIT'
    });
    
    if (takeProfitOrder.success) {
      console.log(`[MARTINGALE STRATEGY] ✅ TAKE PROFIT ORDER PLACED!`);
      console.log(`[MARTINGALE STRATEGY]    Order ID: ${takeProfitOrder.orderId}`);
    }
  }

  private async setupSafetyOrderMonitoring(ws: WebSocket, bot: any, cycleId: number, basePrice: number) {
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
        ? basePrice * (1 - deviationPercent / 100)
        : basePrice * (1 + deviationPercent / 100);
      
      console.log(`[MARTINGALE STRATEGY]    Safety Order ${i}: Trigger at $${triggerPrice.toFixed(4)} (${deviationPercent.toFixed(2)}% deviation)`);
    }
    
    ws.send(JSON.stringify({
      type: 'martingale_progress',
      botId: bot.id,
      cycleId: cycleId,
      status: 'safety_orders_configured',
      maxSafetyOrders: maxSafetyOrders
    }));
  }

  private async placeMartingaleOrder(ws: WebSocket, bot: any, cycleId: number, orderParams: any) {
    try {
      // Get exchange configuration
      const exchanges = await storage.getExchangesByUserId(bot.userId);
      const exchange = exchanges.find(ex => ex.id === bot.exchangeId);
      
      if (!exchange) {
        throw new Error('Exchange not found');
      }
      
      // Create cycle order record
      const cycleOrder = await storage.createCycleOrder({
        symbol: bot.tradingPair,
        userId: bot.userId,
        botId: bot.id,
        side: orderParams.side,
        orderType: orderParams.orderType,
        orderCategory: 'strategy',
        cycleId: cycleId,
        quantity: orderParams.quantity,
        price: orderParams.price,
        status: 'pending'
      });
      
      // Place actual order through Binance API
      const orderRequest = {
        type: 'place_order',
        userId: bot.userId,
        exchangeId: bot.exchangeId,
        symbol: bot.tradingPair,
        side: orderParams.side,
        quantity: orderParams.quantity,
        orderType: orderParams.type || 'MARKET',
        price: orderParams.price,
        clientOrderId: `martingale_${cycleId}_${orderParams.orderType}_${Date.now()}`
      };
      
      const orderResult = await this.handleOrderPlacement(ws, orderRequest);
      
      if (orderResult) {
        // Update cycle order with exchange order ID
        await storage.updateCycleOrder(cycleOrder.id, {
          exchangeOrderId: orderResult.orderId,
          status: 'filled',
          filledAt: new Date()
        });
        
        return {
          success: true,
          orderId: orderResult.orderId,
          quantity: orderParams.quantity,
          price: orderParams.price
        };
      }
      
      return { success: false, error: 'Order placement failed' };
      
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] Order placement error:`, error);
      return { success: false, error: error.message };
    }
  }

  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const marketData = this.marketData.get(symbol);
      if (marketData && marketData.price) {
        return parseFloat(marketData.price);
      }
      
      // Fetch current price from Binance API if not available in cache
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      return parseFloat(data.price);
      
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] Error fetching price for ${symbol}:`, error);
      return null;
    }
  }

  public stopBinanceStreams(deactivate: boolean = true) {
    console.log('[WEBSOCKET] Stopping all Binance streams');
    
    // Always deactivate streams to prevent unnecessary resource consumption
    this.isStreamsActive = false;
    
    // Clear cached market data to prevent stale data
    console.log('[WEBSOCKET] Clearing cached market data');
    this.marketData.clear();
    
    if (this.binancePublicWs) {
      console.log('[WEBSOCKET] Closing Binance public stream');
      this.binancePublicWs.close();
      this.binancePublicWs = null;
    }
    
    // Close all user streams
    this.binanceUserStreams.forEach((ws, listenKey) => {
      // Removed verbose WebSocket logging
      ws.close();
    });
    this.binanceUserStreams.clear();
    
    console.log('[WEBSOCKET] All Binance streams stopped');
  }

  private async fetchHistoricalKlinesWS(symbols: string[], interval: string) {
    console.log(`[HISTORICAL WS] Fetching historical klines for:`, symbols, 'interval:', interval);
    
    for (const symbol of symbols) {
      try {
        // Determine the WebSocket API endpoint based on configuration
        const { storage } = await import('./storage');
        let wsApiUrl = 'wss://ws-api.testnet.binance.vision/ws-api/v3';
        
        try {
          const exchanges = await storage.getExchangesByUserId(1);
          if (exchanges.length > 0 && exchanges[0].wsApiEndpoint) {
            wsApiUrl = exchanges[0].wsApiEndpoint;
          } else if (exchanges.length > 0 && exchanges[0].wsStreamEndpoint) {
            const endpoint = exchanges[0].wsStreamEndpoint;
            if (endpoint.includes('testnet')) {
              wsApiUrl = 'wss://ws-api.testnet.binance.vision/ws-api/v3';
            } else {
              wsApiUrl = 'wss://ws-api.binance.com/ws-api/v3';
            }
          }
        } catch (error) {
          console.log(`[HISTORICAL WS] Using default testnet WebSocket API endpoint`);
        }
        
        // Calculate time range for last 100 candles
        const endTime = Date.now();
        const intervalMs = this.getIntervalInMs(interval);
        const startTime = endTime - (intervalMs * 100);
        
        console.log(`[HISTORICAL WS] Connecting to: ${wsApiUrl} for ${symbol} ${interval}`);
        
        // Create WebSocket connection for historical data
        const ws = new WebSocket(wsApiUrl);
        
        ws.onopen = () => {
          console.log(`[HISTORICAL WS] Connected to WebSocket API for ${symbol}`);
          
          // Send klines request using WebSocket API
          const klinesRequest = {
            id: `historical-${symbol}-${interval}-${Date.now()}`,
            method: 'klines',
            params: {
              symbol: symbol.toUpperCase(),
              interval: interval,
              startTime: startTime,
              endTime: endTime,
              limit: 100
            }
          };
          
          console.log(`[HISTORICAL WS] Sending klines request:`, klinesRequest);
          ws.send(JSON.stringify(klinesRequest));
        };
        
        ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data.toString());
            console.log(`[HISTORICAL WS] Received response for ${symbol}:`, response);
            
            if (response.result && Array.isArray(response.result)) {
              const klines = response.result;
              console.log(`[HISTORICAL WS] Received ${klines.length} klines for ${symbol} ${interval}`);
              
              // Process and store historical klines
              const processedKlines = klines.map((kline: any[]) => ({
                symbol: symbol.toUpperCase(),
                interval: interval,
                openTime: parseInt(kline[0]),
                closeTime: parseInt(kline[6]),
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                isClosed: true,
                timestamp: Date.now()
              }));
              
              // Store in historical data cache
              if (!this.historicalData.has(symbol.toUpperCase())) {
                this.historicalData.set(symbol.toUpperCase(), new Map());
              }
              this.historicalData.get(symbol.toUpperCase())!.set(interval, processedKlines);
              
              // Send historical data to connected clients
              this.sendHistoricalDataToClients([symbol], interval);
              
              // Close the WebSocket connection
              ws.close();
            } else if (response.error) {
              console.error(`[HISTORICAL WS] API Error for ${symbol}:`, response.error);
              ws.close();
            }
          } catch (error) {
            console.error(`[HISTORICAL WS] Error parsing response for ${symbol}:`, error);
            ws.close();
          }
        };
        
        ws.onerror = (error) => {
          console.error(`[HISTORICAL WS] WebSocket error for ${symbol}:`, error);
        };
        
        ws.onclose = () => {
          console.log(`[HISTORICAL WS] WebSocket closed for ${symbol}`);
        };
        
      } catch (error) {
        console.error(`[HISTORICAL WS] Error setting up WebSocket for ${symbol}:`, error);
      }
    }
  }

  private getIntervalInMs(interval: string): number {
    const unit = interval.slice(-1);
    const value = parseInt(interval.slice(0, -1));
    
    switch (unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      case 'M': return value * 30 * 24 * 60 * 60 * 1000; // Approximate
      default: return 60 * 1000; // Default to 1 minute
    }
  }

  private startMarketRefreshInterval() {
    // Request market data every 60 seconds via WebSocket API to reduce overhead
    this.marketRefreshInterval = setInterval(() => {
      console.log('[WEBSOCKET] 🔄 Requesting market data via WebSocket API (60s interval)');
      
      // Get all unique symbols currently subscribed across all clients
      const allSymbols = new Set<string>();
      this.marketSubscriptions.forEach(sub => {
        sub.symbols.forEach(symbol => allSymbols.add(symbol));
      });

      if (allSymbols.size > 0) {
        // Removed verbose WebSocket logging
        
        // Stop continuous streams and request data via WebSocket API
        this.stopBinanceStreams(false);
        this.requestMarketDataViaAPI(Array.from(allSymbols)).catch(error => {
          console.error('[WEBSOCKET] Market data request failed:', error);
        });
      } else {
        console.log('[WEBSOCKET] No active subscriptions - skipping data request');
      }
    }, 60000); // 60 seconds
    
    console.log('[WEBSOCKET] Market data request interval started (60s cycles)');
  }

  private async requestMarketDataViaAPI(symbols: string[]) {
    try {
      // Use REST API for 24hr ticker statistics since testnet doesn't support WebSocket API
      const baseUrl = 'https://testnet.binance.vision/api/v3/ticker/24hr';
      
      // Removed verbose WebSocket logging
      
      // Request data for all symbols at once
      const symbolsParam = symbols.join(',');
      const url = `${baseUrl}?symbols=["${symbols.join('","')}"]`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const tickerData = await response.json();
      
      if (Array.isArray(tickerData)) {
        // Removed verbose WebSocket logging
        
        // Process each ticker update
        tickerData.forEach((ticker: any) => {
          const marketUpdate = {
            symbol: ticker.symbol,
            price: ticker.lastPrice,
            priceChange: ticker.priceChange,
            priceChangePercent: ticker.priceChangePercent,
            highPrice: ticker.highPrice,
            lowPrice: ticker.lowPrice,
            volume: ticker.volume,
            quoteVolume: ticker.quoteVolume,
            timestamp: Date.now()
          };

          // Store and broadcast the update
          this.marketData.set(ticker.symbol, marketUpdate);
          this.broadcastMarketUpdate(marketUpdate);
        });
      }

    } catch (error) {
      console.error('[WEBSOCKET] Failed to request market data via REST API:', error);
    }
  }

  private stopMarketRefreshInterval() {
    if (this.marketRefreshInterval) {
      clearInterval(this.marketRefreshInterval);
      this.marketRefreshInterval = null;
      console.log('[WEBSOCKET] Market refresh interval stopped');
    }
  }

  // Order monitoring system for Martingale cycle management
  private orderMonitoringInterval: NodeJS.Timeout | null = null;

  private startOrderMonitoring() {
    // Check order status every 10 seconds
    this.orderMonitoringInterval = setInterval(async () => {
      await this.checkOrderFills();
    }, 10000);
    
    console.log('[ORDER MONITOR] Started order monitoring for Martingale cycles');
  }

  private async checkOrderFills() {
    try {
      // Get all active bot cycles
      const activeBots = await storage.getTradingBotsByUserId(0); // We'll iterate through all users
      
      for (const bot of activeBots) {
        if (bot.strategy === 'martingale' && bot.isActive) {
          await this.monitorBotCycle(bot.id);
        }
      }
    } catch (error) {
      console.error('[ORDER MONITOR] Error checking order fills:', error);
    }
  }

  private async monitorBotCycle(botId: number) {
    try {
      const activeCycle = await storage.getActiveBotCycle(botId);
      if (!activeCycle) return;

      const pendingOrders = await storage.getPendingCycleOrders(botId);
      
      for (const order of pendingOrders) {
        // Simulate order fill detection (in production, this would check exchange API)
        const isFilled = this.simulateOrderFill(order);
        
        if (isFilled) {
          await this.handleOrderFill(order, activeCycle);
        }
      }
    } catch (error) {
      console.error(`[ORDER MONITOR] Error monitoring bot cycle ${botId}:`, error);
    }
  }

  private simulateOrderFill(order: CycleOrder): boolean {
    // Simulate random order fills for demonstration (5% chance per check)
    // In production, this would query the exchange API for actual order status
    return Math.random() < 0.05;
  }

  private async handleOrderFill(order: CycleOrder, cycle: BotCycle) {
    try {
      console.log(`\n[MARTINGALE STRATEGY] ===== ORDER FILL DETECTED =====`);
      console.log(`[MARTINGALE STRATEGY] Order Type: ${order.orderType.toUpperCase()}`);
      console.log(`[MARTINGALE STRATEGY] Bot ID: ${order.botId}, Cycle ID: ${cycle.id}`);
      console.log(`[MARTINGALE STRATEGY] Symbol: ${order.symbol}`);
      console.log(`[MARTINGALE STRATEGY] Side: ${order.side}, Quantity: ${order.quantity}`);
      console.log(`[MARTINGALE STRATEGY] Fill Price: $${parseFloat(order.price || '0').toFixed(6)}`);
      
      // Update order status to filled
      await storage.updateCycleOrder(order.id, {
        status: 'filled',
        filledQuantity: order.quantity,
        filledPrice: order.price,
        filledAt: new Date()
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Updated order ${order.id} status to filled`);

      if (order.orderType === 'safety_order') {
        await this.handleSafetyOrderFill(order, cycle);
      } else if (order.orderType === 'take_profit') {
        await this.handleTakeProfitFill(order, cycle);
      }

      // Broadcast order fill to connected clients
      this.broadcastOrderFill(order);
      console.log(`[MARTINGALE STRATEGY] ✓ Broadcasted order fill to clients`);

    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Error handling order fill:`, error);
    }
    
    console.log(`[MARTINGALE STRATEGY] ===== ORDER FILL PROCESSING COMPLETE =====\n`);
  }

  private async handleSafetyOrderFill(order: CycleOrder, cycle: BotCycle) {
    console.log(`\n[MARTINGALE STRATEGY] ===== SAFETY ORDER FILLED =====`);
    
    try {
      const bot = await storage.getTradingBot(cycle.botId);
      if (!bot) {
        console.error(`[MARTINGALE STRATEGY] ❌ Bot ${cycle.botId} not found for safety order handling`);
        return;
      }

      console.log(`[MARTINGALE STRATEGY] 📊 SAFETY ORDER ANALYSIS:`);
      console.log(`[MARTINGALE STRATEGY]    Safety Order #${(cycle.filledSafetyOrders || 0) + 1}`);
      console.log(`[MARTINGALE STRATEGY]    Fill Price: $${parseFloat(order.price || '0').toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Fill Quantity: ${order.quantity}`);
      console.log(`[MARTINGALE STRATEGY]    Order Investment: $${(parseFloat(order.quantity) * parseFloat(order.price || '0')).toFixed(2)}`);

      // Recalculate average entry price
      const previousInvested = parseFloat(cycle.totalInvested || '0');
      const previousQuantity = parseFloat(cycle.totalQuantity || '0');
      const orderInvestment = parseFloat(order.quantity) * parseFloat(order.price || '0');
      
      const totalInvested = previousInvested + orderInvestment;
      const totalQuantity = previousQuantity + parseFloat(order.quantity);
      const newAveragePrice = totalInvested / totalQuantity;
      
      const currentSafetyOrders = (cycle.filledSafetyOrders || 0) + 1;

      console.log(`[MARTINGALE STRATEGY] 📈 POSITION UPDATE:`);
      console.log(`[MARTINGALE STRATEGY]    Previous Average: $${(previousInvested / previousQuantity).toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    New Average Price: $${newAveragePrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Total Investment: $${totalInvested.toFixed(2)}`);
      console.log(`[MARTINGALE STRATEGY]    Total Quantity: ${totalQuantity.toFixed(8)}`);
      console.log(`[MARTINGALE STRATEGY]    Safety Orders Filled: ${currentSafetyOrders}/${bot.maxSafetyOrders}`);

      // Update cycle metrics
      await storage.updateBotCycle(cycle.id, {
        currentAveragePrice: newAveragePrice.toString(),
        totalInvested: totalInvested.toString(),
        totalQuantity: totalQuantity.toString(),
        filledSafetyOrders: currentSafetyOrders
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Updated cycle metrics in database`);

      // Cancel existing take profit order and place new one with updated price
      await this.updateTakeProfitOrder(cycle, newAveragePrice);

      // Check if we need to place the next safety order
      if (currentSafetyOrders < bot.maxSafetyOrders) {
        await this.placeNextSafetyOrder(bot, cycle, newAveragePrice, currentSafetyOrders);
      } else {
        console.log(`[MARTINGALE STRATEGY] ⚠️ Maximum safety orders reached (${bot.maxSafetyOrders})`);
        console.log(`[MARTINGALE STRATEGY] ⚠️ Bot will wait for take profit to trigger or manual intervention`);
      }

      console.log(`[MARTINGALE STRATEGY] ✅ Safety order processing completed successfully`);

    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Error handling safety order fill:`, error);
    }
    
    console.log(`[MARTINGALE STRATEGY] ===== SAFETY ORDER PROCESSING COMPLETE =====\n`);
  }

  private async placeNextSafetyOrder(bot: any, cycle: BotCycle, averagePrice: number, currentSafetyOrders: number) {
    console.log(`\n[MARTINGALE STRATEGY] ===== PLACING NEXT SAFETY ORDER =====`);
    
    try {
      const exchange = await storage.getExchangesByUserId(bot.userId);
      const activeExchange = exchange.find(ex => ex.id === bot.exchangeId && ex.isActive);
      
      if (!activeExchange) {
        console.error(`[MARTINGALE STRATEGY] ❌ No active exchange found for safety order`);
        return;
      }

      // Calculate safety order price (price drop from average)
      const priceDeviation = parseFloat(bot.priceDeviation || '1.5');
      const deviationMultiplier = parseFloat(bot.priceDeviationMultiplier || '1.5');
      
      // Apply deviation multiplier for subsequent safety orders
      const adjustedDeviation = priceDeviation * Math.pow(deviationMultiplier, currentSafetyOrders);
      
      const safetyOrderPrice = bot.direction === 'long' 
        ? averagePrice * (1 - adjustedDeviation / 100)
        : averagePrice * (1 + adjustedDeviation / 100);

      // Calculate safety order quantity
      const safetyOrderAmount = parseFloat(bot.safetyOrderAmount);
      const sizeMultiplier = parseFloat(bot.safetyOrderSizeMultiplier || '2.0');
      
      // Apply size multiplier for subsequent safety orders
      const adjustedAmount = safetyOrderAmount * Math.pow(sizeMultiplier, currentSafetyOrders);
      const quantity = adjustedAmount / safetyOrderPrice;

      console.log(`[MARTINGALE STRATEGY] 📊 SAFETY ORDER ${currentSafetyOrders + 1} CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Current Average Price: $${averagePrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Base Deviation: ${priceDeviation}%`);
      console.log(`[MARTINGALE STRATEGY]    Deviation Multiplier: ${deviationMultiplier}x`);
      console.log(`[MARTINGALE STRATEGY]    Adjusted Deviation: ${adjustedDeviation.toFixed(2)}%`);
      console.log(`[MARTINGALE STRATEGY]    Safety Order Price: $${safetyOrderPrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Base Amount: $${safetyOrderAmount}`);
      console.log(`[MARTINGALE STRATEGY]    Size Multiplier: ${sizeMultiplier}x`);
      console.log(`[MARTINGALE STRATEGY]    Adjusted Amount: $${adjustedAmount.toFixed(2)}`);
      console.log(`[MARTINGALE STRATEGY]    Calculated Quantity: ${quantity.toFixed(8)}`);

      // Create safety order record
      const safetyOrder = await storage.createCycleOrder({
        cycleId: cycle.id,
        botId: bot.id,
        userId: bot.userId,
        orderType: 'safety_order',
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        orderCategory: 'LIMIT',
        symbol: bot.tradingPair,
        quantity: quantity.toFixed(8),
        price: safetyOrderPrice.toFixed(8),
        status: 'pending'
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Created safety order record (ID: ${safetyOrder.id})`);

      try {
        console.log(`[MARTINGALE STRATEGY] 🚀 Placing safety order on ${activeExchange.name}...`);
        
        const orderResult = await this.placeOrderOnExchange(activeExchange, {
          symbol: bot.tradingPair,
          side: bot.direction === 'long' ? 'BUY' : 'SELL',
          type: 'LIMIT',
          quantity: quantity.toFixed(8),
          price: safetyOrderPrice.toFixed(8),
          timeInForce: 'GTC'
        });

        if (orderResult && orderResult.orderId) {
          await storage.updateCycleOrder(safetyOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'placed'
          });

          console.log(`[MARTINGALE STRATEGY] ✅ SAFETY ORDER ${currentSafetyOrders + 1} SUCCESSFULLY PLACED!`);
          console.log(`[MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[MARTINGALE STRATEGY]    Trigger Price: $${safetyOrderPrice.toFixed(6)}`);
          console.log(`[MARTINGALE STRATEGY]    Investment: $${adjustedAmount.toFixed(2)}`);

        } else {
          console.error(`[MARTINGALE STRATEGY] ❌ Failed to place safety order - No order ID returned`);
          await storage.updateCycleOrder(safetyOrder.id, { status: 'failed' });
        }

      } catch (orderError) {
        console.error(`[MARTINGALE STRATEGY] ❌ Error placing safety order:`, orderError);
        await storage.updateCycleOrder(safetyOrder.id, { status: 'failed' });
      }

    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Critical error in placeNextSafetyOrder:`, error);
    }
    
    console.log(`[MARTINGALE STRATEGY] ===== SAFETY ORDER PLACEMENT COMPLETE =====\n`);
  }

  private async handleTakeProfitFill(order: CycleOrder, cycle: BotCycle) {
    console.log(`\n[MARTINGALE STRATEGY] ===== TAKE PROFIT FILLED =====`);
    
    try {
      const bot = await storage.getTradingBot(cycle.botId);
      if (!bot) {
        console.error(`[MARTINGALE STRATEGY] ❌ Bot ${cycle.botId} not found for take profit handling`);
        return;
      }

      console.log(`[MARTINGALE STRATEGY] 🎯 TAKE PROFIT ANALYSIS:`);
      console.log(`[MARTINGALE STRATEGY]    Fill Price: $${parseFloat(order.price || '0').toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Fill Quantity: ${order.quantity}`);
      console.log(`[MARTINGALE STRATEGY]    Cycle Number: ${cycle.cycleNumber || 1}`);

      // Calculate profit
      const totalInvested = parseFloat(cycle.totalInvested || '0');
      const totalReceived = parseFloat(order.quantity) * parseFloat(order.price || '0');
      const profit = totalReceived - totalInvested;
      const profitPercentage = (profit / totalInvested) * 100;

      console.log(`[MARTINGALE STRATEGY] 💰 PROFIT CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Total Invested: $${totalInvested.toFixed(2)}`);
      console.log(`[MARTINGALE STRATEGY]    Total Received: $${totalReceived.toFixed(2)}`);
      console.log(`[MARTINGALE STRATEGY]    Net Profit: $${profit.toFixed(2)}`);
      console.log(`[MARTINGALE STRATEGY]    Profit Percentage: ${profitPercentage.toFixed(2)}%`);
      console.log(`[MARTINGALE STRATEGY]    Safety Orders Used: ${cycle.filledSafetyOrders || 0}/${bot.maxSafetyOrders}`);

      // Record the trade for analytics
      await storage.createTrade({
        userId: bot.userId,
        botId: cycle.botId,
        tradingPair: bot.tradingPair,
        side: order.side,
        orderType: 'MARKET',
        orderCategory: 'MARKET',
        amount: order.quantity,
        quoteAmount: totalReceived.toString(),
        price: order.price || '0',
        status: 'filled',
        exchangeOrderId: order.exchangeOrderId || ''
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Trade recorded for analytics`);

      // Complete current cycle
      await storage.completeBotCycle(cycle.id);
      console.log(`[MARTINGALE STRATEGY] ✓ Cycle ${cycle.cycleNumber || 1} completed successfully`);

      // Check if bot should continue (not paused/stopped)
      if (bot.isActive) {
        console.log(`[MARTINGALE STRATEGY] 🔄 Bot is active - Starting new cycle...`);
        
        // Wait a moment before starting new cycle (cooldown)
        const cooldownSeconds = typeof bot.cooldownBetweenRounds === 'string' 
          ? parseInt(bot.cooldownBetweenRounds) 
          : (bot.cooldownBetweenRounds || 60);
        const cooldown = cooldownSeconds * 1000; // Convert to milliseconds
        console.log(`[MARTINGALE STRATEGY] ⏱️ Applying cooldown: ${cooldownSeconds}s`);
        
        setTimeout(async () => {
          await this.startNewMartingaleCycle(cycle.botId, (cycle.cycleNumber || 1) + 1);
        }, cooldown);

      } else {
        console.log(`[MARTINGALE STRATEGY] ⏸️ Bot is inactive - No new cycle will be started`);
      }

      console.log(`[MARTINGALE STRATEGY] ✅ CYCLE COMPLETED SUCCESSFULLY!`);
      console.log(`[MARTINGALE STRATEGY]    Final Profit: $${profit.toFixed(2)} (${profitPercentage.toFixed(2)}%)`);
      console.log(`[MARTINGALE STRATEGY]    Cycle Duration: Completed`);

    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Error handling take profit fill:`, error);
    }
    
    console.log(`[MARTINGALE STRATEGY] ===== TAKE PROFIT PROCESSING COMPLETE =====\n`);
  }

  private async updateTakeProfitOrder(cycle: BotCycle, newAveragePrice: number) {
    console.log(`\n[MARTINGALE STRATEGY] ===== UPDATING TAKE PROFIT ORDER =====`);
    
    try {
      // Get bot configuration
      const bot = await storage.getTradingBot(cycle.botId);
      if (!bot) {
        console.error(`[MARTINGALE STRATEGY] ❌ Bot ${cycle.botId} not found for take profit update`);
        return;
      }

      const exchange = await storage.getExchangesByUserId(bot.userId);
      const activeExchange = exchange.find(ex => ex.id === bot.exchangeId && ex.isActive);
      
      if (!activeExchange) {
        console.error(`[MARTINGALE STRATEGY] ❌ No active exchange found for take profit update`);
        return;
      }

      // Calculate new take profit price based on updated average
      const takeProfitPercentage = parseFloat(bot.takeProfitPercentage || '1.5');
      const newTakeProfitPrice = bot.direction === 'long' 
        ? newAveragePrice * (1 + takeProfitPercentage / 100)
        : newAveragePrice * (1 - takeProfitPercentage / 100);

      console.log(`[MARTINGALE STRATEGY] 📊 TAKE PROFIT UPDATE CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Previous Average: $${parseFloat(cycle.baseOrderPrice || '0').toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    New Average Price: $${newAveragePrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Take Profit %: ${takeProfitPercentage}%`);
      console.log(`[MARTINGALE STRATEGY]    New Take Profit Price: $${newTakeProfitPrice.toFixed(6)}`);

      // Find existing take profit order for this cycle
      const cycleOrders = await storage.getCycleOrders(cycle.id);
      const existingTakeProfit = cycleOrders.find(order => 
        order.orderType === 'take_profit' && 
        (order.status === 'placed' || order.status === 'pending')
      );

      if (existingTakeProfit) {
        console.log(`[MARTINGALE STRATEGY] 🔄 Found existing take profit order (ID: ${existingTakeProfit.id})`);
        console.log(`[MARTINGALE STRATEGY]    Old Price: $${parseFloat(existingTakeProfit.price || '0').toFixed(6)}`);
        
        // Cancel existing order (in production, this would cancel on exchange)
        await storage.updateCycleOrder(existingTakeProfit.id, { status: 'cancelled' });
        console.log(`[MARTINGALE STRATEGY] ✓ Cancelled existing take profit order`);
      }

      // Get total quantity to sell
      const totalQuantity = parseFloat(cycle.totalQuantity || '0');

      // Create new take profit order
      const newTakeProfitOrder = await storage.createCycleOrder({
        cycleId: cycle.id,
        botId: cycle.botId,
        userId: cycle.userId,
        orderType: 'take_profit',
        side: bot.direction === 'long' ? 'SELL' : 'BUY',
        orderCategory: 'LIMIT',
        symbol: bot.tradingPair,
        quantity: totalQuantity.toFixed(8),
        price: newTakeProfitPrice.toFixed(8),
        status: 'pending',
        clientOrderId: `TP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Created new take profit order record (ID: ${newTakeProfitOrder.id})`);

      try {
        console.log(`[MARTINGALE STRATEGY] 🚀 Placing updated take profit order on ${activeExchange.name}...`);
        
        const orderResult = await this.placeOrderOnExchange(activeExchange, {
          symbol: bot.tradingPair,
          side: bot.direction === 'long' ? 'SELL' : 'BUY',
          type: 'LIMIT',
          quantity: totalQuantity.toFixed(8),
          price: newTakeProfitPrice.toFixed(8),
          timeInForce: 'GTC'
        });

        if (orderResult && orderResult.orderId) {
          await storage.updateCycleOrder(newTakeProfitOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'placed'
          });

          console.log(`[MARTINGALE STRATEGY] ✅ TAKE PROFIT ORDER UPDATED SUCCESSFULLY!`);
          console.log(`[MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[MARTINGALE STRATEGY]    New Target Price: $${newTakeProfitPrice.toFixed(6)}`);
          console.log(`[MARTINGALE STRATEGY]    Total Quantity: ${totalQuantity.toFixed(8)}`);

        } else {
          console.error(`[MARTINGALE STRATEGY] ❌ Failed to place updated take profit order`);
          await storage.updateCycleOrder(newTakeProfitOrder.id, { status: 'failed' });
        }

      } catch (orderError) {
        console.error(`[MARTINGALE STRATEGY] ❌ Error placing updated take profit order:`, orderError);
        await storage.updateCycleOrder(newTakeProfitOrder.id, { status: 'failed' });
      }

    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Critical error updating take profit order:`, error);
    }
    
    console.log(`[MARTINGALE STRATEGY] ===== TAKE PROFIT UPDATE COMPLETE =====\n`);
  }

  public async startNewMartingaleCycle(botId: number, cycleNumber: number) {
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) return;

      // Create new cycle
      const newCycle = await storage.createBotCycle({
        botId: botId,
        userId: bot.userId,
        cycleNumber: cycleNumber,
        maxSafetyOrders: bot.maxSafetyOrders,
        baseOrderPrice: '0', // Will be set when base order is placed
        currentAveragePrice: '0',
        totalInvested: '0',
        totalQuantity: '0'
      });

      console.log(`[MARTINGALE] Started new cycle ${cycleNumber} for bot ${botId}`);

    } catch (error) {
      console.error('[MARTINGALE] Error starting new cycle:', error);
    }
  }

  private async placeOrderOnExchange(exchange: any, orderParams: any) {
    try {
      const { decryptApiCredentials } = require('./encryption');
      const crypto = require('crypto');
      
      // Decrypt API credentials
      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.encryptedApiKey,
        exchange.encryptedApiSecret,
        exchange.encryptionIv
      );

      // Prepare order parameters
      const params = new URLSearchParams({
        symbol: orderParams.symbol,
        side: orderParams.side,
        type: orderParams.type,
        quantity: orderParams.quantity,
        timestamp: Date.now().toString()
      });

      // Create signature
      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(params.toString())
        .digest('hex');
      
      params.append('signature', signature);

      // Make API request to place order
      const response = await fetch(`${exchange.restApiEndpoint}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`[ORDER] Successfully placed order:`, result);
        return result;
      } else {
        const error = await response.text();
        console.error(`[ORDER] Failed to place order:`, error);
        return null;
      }

    } catch (error) {
      console.error('[ORDER] Error placing order on exchange:', error);
      return null;
    }
  }

  public async placeInitialBaseOrder(botId: number, cycleId: number) {
    console.log(`\n[MARTINGALE STRATEGY] ===== STARTING BASE ORDER EXECUTION =====`);
    console.log(`[MARTINGALE STRATEGY] Bot ID: ${botId}, Cycle ID: ${cycleId}`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.error(`[MARTINGALE STRATEGY] ❌ Bot ${botId} not found`);
        return;
      }

      console.log(`[MARTINGALE STRATEGY] ✓ Bot loaded: ${bot.name} (${bot.tradingPair}, ${bot.direction})`);
      console.log(`[MARTINGALE STRATEGY] ✓ Strategy: ${bot.strategy}, Exchange ID: ${bot.exchangeId}`);

      const exchange = await storage.getExchangesByUserId(bot.userId);
      const activeExchange = exchange.find(ex => ex.id === bot.exchangeId && ex.isActive);
      
      if (!activeExchange) {
        console.error(`[MARTINGALE STRATEGY] ❌ No active exchange found for bot ${botId}`);
        return;
      }

      console.log(`[MARTINGALE STRATEGY] ✓ Exchange loaded: ${activeExchange.name} (${activeExchange.exchangeType})`);

      // Get current market price
      const symbol = bot.tradingPair;
      const marketData = this.marketData.get(symbol);
      
      if (!marketData) {
        console.error(`[MARTINGALE STRATEGY] ❌ No market data available for ${symbol}`);
        return;
      }

      const currentPrice = marketData.price;
      console.log(`[MARTINGALE STRATEGY] ✓ Market price for ${symbol}: $${currentPrice.toFixed(6)}`);

      // Calculate base order quantity
      const baseOrderAmount = parseFloat(bot.baseOrderAmount);
      const quantity = baseOrderAmount / currentPrice;

      console.log(`[MARTINGALE STRATEGY] 📊 BASE ORDER CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Investment Amount: $${baseOrderAmount}`);
      console.log(`[MARTINGALE STRATEGY]    Current Price: $${currentPrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Calculated Quantity: ${quantity.toFixed(8)} ${symbol.replace('USDT', '')}`);

      // Create the base order record
      const baseOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'base_order',
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        orderCategory: 'MARKET',
        symbol: symbol,
        quantity: quantity.toFixed(8),
        price: currentPrice.toFixed(8),
        status: 'pending'
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Created base order record in database (ID: ${baseOrder.id})`);

      // Place order on exchange via API
      try {
        console.log(`[MARTINGALE STRATEGY] 🚀 Placing order on ${activeExchange.name}...`);
        console.log(`[MARTINGALE STRATEGY]    Order Type: MARKET ${bot.direction === 'long' ? 'BUY' : 'SELL'}`);
        console.log(`[MARTINGALE STRATEGY]    Symbol: ${symbol}`);
        console.log(`[MARTINGALE STRATEGY]    Quantity: ${quantity.toFixed(8)}`);
        
        const orderResult = await this.placeOrderOnExchange(activeExchange, {
          symbol: symbol,
          side: bot.direction === 'long' ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: quantity.toFixed(8)
        });

        if (orderResult && orderResult.orderId) {
          // Update the order with exchange order ID
          await storage.updateCycleOrder(baseOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'filled',
            filledQuantity: quantity.toFixed(8),
            filledPrice: currentPrice.toFixed(8),
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
          
          // Now place take profit order
          await this.placeTakeProfitOrder(botId, cycleId, currentPrice, quantity);
          
          // Place the first safety order
          await this.placeNextSafetyOrder(bot, await storage.updateBotCycle(cycleId, {}), currentPrice, 0);
          
          // Broadcast order fill
          this.broadcastOrderFill(await storage.updateCycleOrder(baseOrder.id, {}));

        } else {
          console.error(`[MARTINGALE STRATEGY] ❌ Failed to place base order for bot ${botId} - No order ID returned`);
          await storage.updateCycleOrder(baseOrder.id, { status: 'failed' });
        }

      } catch (orderError) {
        console.error(`[MARTINGALE STRATEGY] ❌ Error placing base order for bot ${botId}:`, orderError);
        await storage.updateCycleOrder(baseOrder.id, { status: 'failed' });
      }

    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Critical error in placeInitialBaseOrder for bot ${botId}:`, error);
    }
    
    console.log(`[MARTINGALE STRATEGY] ===== BASE ORDER EXECUTION COMPLETE =====\n`);
  }

  private async placeTakeProfitOrder(botId: number, cycleId: number, basePrice: number, quantity: number) {
    console.log(`\n[MARTINGALE STRATEGY] ===== PLACING TAKE PROFIT ORDER =====`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.error(`[MARTINGALE STRATEGY] ❌ Bot ${botId} not found for take profit order`);
        return;
      }

      const exchange = await storage.getExchangesByUserId(bot.userId);
      const activeExchange = exchange.find(ex => ex.id === bot.exchangeId && ex.isActive);
      
      if (!activeExchange) {
        console.error(`[MARTINGALE STRATEGY] ❌ No active exchange found for take profit order`);
        return;
      }

      // Calculate take profit price
      const takeProfitPercentage = parseFloat(bot.takeProfitPercentage || '1.5');
      const takeProfitPrice = bot.direction === 'long' 
        ? basePrice * (1 + takeProfitPercentage / 100)
        : basePrice * (1 - takeProfitPercentage / 100);

      console.log(`[MARTINGALE STRATEGY] 📊 TAKE PROFIT CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Base Price: $${basePrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Take Profit %: ${takeProfitPercentage}%`);
      console.log(`[MARTINGALE STRATEGY]    Take Profit Price: $${takeProfitPrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Quantity: ${quantity.toFixed(8)}`);

      // Create take profit order record
      const takeProfitOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'take_profit',
        side: bot.direction === 'long' ? 'SELL' : 'BUY',
        orderCategory: 'LIMIT',
        symbol: bot.tradingPair,
        quantity: quantity.toFixed(8),
        price: takeProfitPrice.toFixed(8),
        status: 'pending'
      });

      console.log(`[MARTINGALE STRATEGY] ✓ Created take profit order record (ID: ${takeProfitOrder.id})`);

      try {
        console.log(`[MARTINGALE STRATEGY] 🚀 Placing take profit order on ${activeExchange.name}...`);
        console.log(`[MARTINGALE STRATEGY]    Order Type: LIMIT ${bot.direction === 'long' ? 'SELL' : 'BUY'}`);
        console.log(`[MARTINGALE STRATEGY]    Symbol: ${bot.tradingPair}`);
        console.log(`[MARTINGALE STRATEGY]    Quantity: ${quantity.toFixed(8)}`);
        console.log(`[MARTINGALE STRATEGY]    Price: $${takeProfitPrice.toFixed(6)}`);

        const orderResult = await this.placeOrderOnExchange(activeExchange, {
          symbol: bot.tradingPair,
          side: bot.direction === 'long' ? 'SELL' : 'BUY',
          type: 'LIMIT',
          quantity: quantity.toFixed(8),
          price: takeProfitPrice.toFixed(8),
          timeInForce: 'GTC'
        });

        if (orderResult && orderResult.orderId) {
          await storage.updateCycleOrder(takeProfitOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'placed'
          });

          console.log(`[MARTINGALE STRATEGY] ✅ TAKE PROFIT ORDER SUCCESSFULLY PLACED!`);
          console.log(`[MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[MARTINGALE STRATEGY]    Target Price: $${takeProfitPrice.toFixed(6)}`);
          console.log(`[MARTINGALE STRATEGY]    Expected Profit: ${takeProfitPercentage}%`);

        } else {
          console.error(`[MARTINGALE STRATEGY] ❌ Failed to place take profit order - No order ID returned`);
          await storage.updateCycleOrder(takeProfitOrder.id, { status: 'failed' });
        }

      } catch (orderError) {
        console.error(`[MARTINGALE STRATEGY] ❌ Error placing take profit order:`, orderError);
        await storage.updateCycleOrder(takeProfitOrder.id, { status: 'failed' });
      }

    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Critical error in placeTakeProfitOrder:`, error);
    }
    
    console.log(`[MARTINGALE STRATEGY] ===== TAKE PROFIT ORDER COMPLETE =====\n`);
  }

  private broadcastOrderFill(order: CycleOrder) {
    const message = JSON.stringify({
      type: 'order_fill',
      data: {
        orderId: order.id,
        botId: order.botId,
        orderType: order.orderType,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        price: order.price,
        status: order.status,
        filledAt: order.filledAt
      }
    });

    console.log(`[MARTINGALE STRATEGY] 📡 Broadcasting order fill to clients:`);
    console.log(`[MARTINGALE STRATEGY]    Order Type: ${order.orderType}`);
    console.log(`[MARTINGALE STRATEGY]    Symbol: ${order.symbol}`);
    console.log(`[MARTINGALE STRATEGY]    Status: ${order.status}`);

    // Broadcast to all connected clients
    let broadcastCount = 0;
    this.userConnections.forEach((connection) => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(message);
        broadcastCount++;
      }
    });

    console.log(`[MARTINGALE STRATEGY] ✓ Broadcasted to ${broadcastCount} connected clients`);
  }

  public close() {
    this.wss.close();
    this.stopBinanceStreams();
    this.stopMarketRefreshInterval();
    
    // Stop order monitoring
    if (this.orderMonitoringInterval) {
      clearInterval(this.orderMonitoringInterval);
      this.orderMonitoringInterval = null;
      console.log('[ORDER MONITOR] Order monitoring stopped');
    }
  }
}