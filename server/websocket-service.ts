import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import { storage } from './storage';
import { decryptApiCredentials } from './encryption';

interface UserConnection {
  ws: WebSocket;
  userId: number;
  listenKey?: string;
}

interface MarketSubscription {
  ws: WebSocket;
  symbols: Set<string>;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private userConnections = new Map<number, UserConnection>();
  private marketSubscriptions = new Set<MarketSubscription>();
  private marketData = new Map<string, any>();
  private historicalData = new Map<string, Map<string, any[]>>(); // symbol -> interval -> kline data
  private binancePublicWs: WebSocket | null = null;
  private binanceUserStreams = new Map<string, WebSocket>();
  private mockDataInterval: NodeJS.Timeout | null = null;
  private isStreamsActive = false;
  private currentStreamType: string = 'ticker';
  private currentInterval: string = '1m';

  constructor(server: Server) {
    // WebSocket server on dedicated port with proper Replit binding
    const wsPort = parseInt(process.env.WS_PORT || '8080');
    this.wss = new WebSocketServer({ 
      port: wsPort,
      host: '0.0.0.0'
    });

    this.setupWebSocket();
    
    console.log(`[WEBSOCKET] Unified service initialized on port ${wsPort} with 0.0.0.0 binding. External streams connect on-demand only.`);
  }

  private setupWebSocket() {
    const wsPort = parseInt(process.env.WS_PORT || '8080');
    console.log(`[WEBSOCKET] Setting up unified WebSocket server on port ${wsPort} with 0.0.0.0 binding`);
    
    this.wss.on('connection', (ws, request) => {
      const clientIP = request.socket.remoteAddress;
      const clientId = Math.random().toString(36).substr(2, 9);
      console.log(`[WEBSOCKET] ===== NEW CLIENT CONNECTED ===== ID: ${clientId} from ${clientIP}`);

      const subscription: MarketSubscription = {
        ws,
        symbols: new Set()
      };

      this.marketSubscriptions.add(subscription);
      console.log(`[WEBSOCKET] Total active subscriptions: ${this.marketSubscriptions.size}`);
      
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
          console.log(`[WEBSOCKET] Received command from frontend:`, message);
          
          if (message.type === 'subscribe') {
            // Frontend requests subscription to specific trading pairs
            const symbols = message.symbols || ['BTCUSDT'];
            console.log(`[WEBSOCKET] Frontend requesting subscription to symbols:`, symbols);
            symbols.forEach((symbol: string) => {
              subscription.symbols.add(symbol.toUpperCase());
            });
            
            // Start Binance streams with the requested symbols - Default to kline data for charts
            if (!this.isStreamsActive) {
              console.log(`[WEBSOCKET] Starting kline streams for symbols:`, symbols);
              this.connectConfigurableStream('kline', symbols, '1m');
              this.isStreamsActive = true;
            }
            
            // Send current market data from backend to frontend
            this.sendMarketDataToClient(ws);
          }
          
          if (message.type === 'authenticate') {
            await this.authenticateUserConnection(ws, message.userId, message.apiKey);
          }
          
          if (message.type === 'account_balance') {
            console.log(`[WEBSOCKET] Processing balance request for user ${message.userId}, exchange ${message.exchangeId}`);
            this.requestAccountBalance(ws, message.userId, message.exchangeId);
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
        console.log(`[WEBSOCKET] ===== CLIENT DISCONNECT EVENT ===== ID: ${clientId} Code: ${code}, Reason: ${reason}`);
        console.log(`[WEBSOCKET] Subscriptions before removal: ${this.marketSubscriptions.size}`);
        this.marketSubscriptions.delete(subscription);
        console.log(`[WEBSOCKET] Subscriptions after removal: ${this.marketSubscriptions.size}`);
        
        // Clean up user connection
        this.userConnections.forEach((connection, userId) => {
          if (connection.ws === ws) {
            this.userConnections.delete(userId);
            console.log(`[WEBSOCKET] Removed authenticated user ${userId}`);
          }
        });
        
        // Stop Binance streams if no clients are connected
        if (this.marketSubscriptions.size === 0) {
          console.log(`[WEBSOCKET] ⚠️  NO CLIENTS CONNECTED - STOPPING ALL STREAMS ⚠️`);
          this.stopBinanceStreams();
        } else {
          console.log(`[WEBSOCKET] Still have ${this.marketSubscriptions.size} active subscriptions, keeping streams alive`);
        }
      });

      ws.on('error', (error) => {
        console.error('[WEBSOCKET] WebSocket error:', error);
        this.marketSubscriptions.delete(subscription);
      });

      // Send initial market data
      console.log('[WEBSOCKET] Sending initial market data');
      this.sendMarketDataToClient(ws);
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

  public connectConfigurableStream(dataType: string, symbols: string[], interval?: string, depth?: string) {
    console.log(`[WEBSOCKET] Configuring stream: ${dataType}, symbols: ${symbols}, interval: ${interval}`);
    
    // Update current stream configuration
    this.currentStreamType = dataType;
    this.currentInterval = interval || '1m';
    
    // Stop existing streams but keep streams active for reconnection during interval switching
    this.stopBinanceStreams(false);
    
    // Ensure streams remain active during interval switching
    this.isStreamsActive = true;
    
    // Start new streams with updated configuration
    const baseUrl = 'wss://stream.testnet.binance.vision/stream?streams=';
    
    const streamPaths = symbols.map(symbol => {
      const sym = symbol.toLowerCase();
      switch (dataType) {
        case 'ticker':
          return `${sym}@ticker`;
        case 'kline':
          return `${sym}@kline_${interval || '1m'}`;
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
    
    const streamUrl = baseUrl + streamPaths.join('/');
    console.log(`[BINANCE] Connecting to ${dataType} stream: ${streamUrl}`);
    this.connectToBinancePublic(streamUrl);
    
    // Send historical data for the new interval to connected clients
    if (dataType === 'kline' && this.marketSubscriptions.size > 0) {
      console.log(`[WEBSOCKET] Sending historical data for interval: ${interval || '1m'}`);
      this.sendHistoricalDataToClients(symbols, interval || '1m');
    }
    
    // Restart streams for existing subscriptions with new configuration
    if (this.marketSubscriptions.size > 0) {
      console.log(`[WEBSOCKET] Restarting streams for ${this.marketSubscriptions.size} existing subscriptions`);
    }
  }

  // Mock data generation removed - only real exchange data

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

    this.binancePublicWs.on('message', (data) => {
      try {
        // Ignore messages if streams are inactive
        if (!this.isStreamsActive) {
          return; // Silently ignore - connection closing
        }

        const message = JSON.parse(data.toString());
        console.log('[BINANCE STREAM] Received message:', JSON.stringify(message).substring(0, 200) + '...');
        
        // Handle combined stream format: {"stream":"<streamName>","data":<rawPayload>}
        if (message.stream && message.data) {
          const streamName = message.stream;
          const data = message.data;
          
          // Handle ticker data
          if (streamName.includes('@ticker')) {
            const symbol = data.s;
            
            if (symbol) {
              const marketUpdate = {
                symbol,
                price: parseFloat(data.c),
                change: parseFloat(data.P),
                volume: parseFloat(data.v),
                high: parseFloat(data.h),
                low: parseFloat(data.l),
                timestamp: Date.now()
              };

              console.log(`[BINANCE STREAM] Market update for ${symbol}: ${data.c}`);
              this.marketData.set(symbol, marketUpdate);
              this.broadcastMarketUpdate(marketUpdate);
            }
          }
          
          // Handle kline data
          if (streamName.includes('@kline')) {
            const symbol = data.s;
            const kline = data.k;
            
            if (symbol && kline) {
              console.log(`[BINANCE STREAM] Kline update for ${symbol} (${kline.i}): ${kline.c}`);
              
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
                isFinal: kline.x, // true when kline is closed
                timestamp: Date.now()
              };
              
              // Always store historical data for all intervals
              this.storeHistoricalKlineData(klineUpdate);
              
              // Broadcast will filter by active interval
              this.broadcastKlineUpdate(klineUpdate);
              
              // Only update market data for active interval
              if (kline.i === this.currentInterval) {
                const marketUpdate = {
                  symbol: symbol,
                  price: parseFloat(kline.c),
                  change: 0, // Will be calculated if needed
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

          console.log(`[BINANCE STREAM] Direct market update for ${symbol}: ${message.c}`);
          this.marketData.set(symbol, marketUpdate);
          this.broadcastMarketUpdate(marketUpdate);
        }
      } catch (error) {
        console.error('[BINANCE STREAM] Error processing data:', error);
      }
    });

    this.binancePublicWs.on('close', (code, reason) => {
      console.log(`[BINANCE STREAM] Disconnected - Code: ${code}, Reason: ${reason}`);
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
    // Use WebSocket API approach instead of Stream API
    const isTestnet = process.env.NODE_ENV === 'development';
    const wsUrl = isTestnet 
      ? `wss://testnet.binance.vision/ws-api/v3`
      : `wss://ws-api.binance.com:443/ws-api/v3`;
    
    // Get user's API credentials for authenticated requests
    const user = await storage.getUser(userId);
    if (!user) {
      console.error(`[USER STREAM] User ${userId} not found`);
      return;
    }

    // For now, we'll implement account info subscription via WebSocket API
    // This doesn't require listen keys and works with API key/secret
    const connectionKey = `user_${userId}`;
    
    // Close existing connection if any
    if (this.binanceUserStreams.has(connectionKey)) {
      this.binanceUserStreams.get(connectionKey)?.close();
    }

    try {
      const userWs = new WebSocket(wsUrl);
      this.binanceUserStreams.set(connectionKey, userWs);

      userWs.on('open', () => {
        console.log(`[USER STREAM] Connected to Binance WebSocket API for user ${userId}`);
        
        // Send account status request (this is a simple request that works without listen key)
        const accountRequest = {
          id: `account_${Date.now()}`,
          method: "account.status",
          params: {
            apiKey: "demo_key", // In real implementation, use encrypted user's API key
            timestamp: Date.now()
            // signature would be required for authenticated requests
          }
        };

        // For demo purposes, we'll just notify the client that connection is ready
        const userConnection = this.userConnections.get(userId);
        if (userConnection) {
          userConnection.ws.send(JSON.stringify({
            type: 'user_stream_connected',
            message: 'WebSocket API connection established. Ready for authenticated requests.',
            method: 'websocket_api'
          }));
        }
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
    const filteredData = Array.from(this.marketData.values()).filter(data => 
      subscribedSymbols.length === 0 || subscribedSymbols.includes(data.symbol.toLowerCase())
    );
    
    console.log(`[PUBLIC WS] Client subscribed to: ${subscribedSymbols.join(', ')}`);
    console.log(`[PUBLIC WS] Filtered market data entries: ${filteredData.length}`);
    
    if (filteredData.length > 0) {
      try {
        const message = JSON.stringify({
          type: 'market_data',
          data: filteredData
        });
        console.log(`[PUBLIC WS] Sending filtered market data (${message.length} chars)`);
        ws.send(message);
        console.log('[PUBLIC WS] Filtered market data sent successfully');
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

    // Critical fix: Only broadcast kline updates for the currently active interval
    if (klineUpdate.interval !== this.currentInterval) {
      console.log(`[WEBSOCKET] Filtering out non-active interval: ${klineUpdate.symbol} (${klineUpdate.interval}) - current: ${this.currentInterval}`);
      return;
    }

    // Store historical data for this symbol and interval
    this.storeHistoricalKlineData(klineUpdate);

    const message = JSON.stringify({
      type: 'kline_update',
      data: klineUpdate
    });

    console.log(`[WEBSOCKET] Broadcasting kline update for ${klineUpdate.symbol} to ${this.marketSubscriptions.size} clients`);
    
    let sentCount = 0;
    this.marketSubscriptions.forEach((subscription) => {
      if (subscription.ws.readyState === WebSocket.OPEN) {
        // Check if client is subscribed to this symbol (case-insensitive matching)
        const subscribedSymbols = Array.from(subscription.symbols).map(s => s.toUpperCase());
        const isMatched = subscription.symbols.size === 0 || subscribedSymbols.includes(klineUpdate.symbol.toUpperCase());
        console.log(`[WEBSOCKET] Kline symbol: ${klineUpdate.symbol}, subscribed: [${Array.from(subscription.symbols).join(', ')}], matched: ${isMatched}`);
        
        if (isMatched) {
          console.log(`[WEBSOCKET] Sending kline to client ${sentCount + 1}, readyState: ${subscription.ws.readyState}`);
          subscription.ws.send(message);
          sentCount++;
          console.log(`[WEBSOCKET] Successfully sent kline update to client ${sentCount} for ${klineUpdate.symbol}`);
        }
      }
    });
    
    console.log(`[WEBSOCKET] Successfully sent kline update to ${sentCount} out of ${this.marketSubscriptions.size} clients`);
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
    
    console.log(`[WEBSOCKET] Stored kline data for ${symbol} ${interval}: ${intervalData.length} candles`);
  }

  private sendHistoricalDataToClients(symbols: string[], interval: string) {
    symbols.forEach(symbol => {
      const symbolData = this.historicalData.get(symbol.toUpperCase());
      if (symbolData && symbolData.has(interval)) {
        const intervalData = symbolData.get(interval)!;
        console.log(`[WEBSOCKET] Sending ${intervalData.length} historical candles for ${symbol} ${interval}`);
        
        // Send historical data to all connected clients
        this.marketSubscriptions.forEach((subscription) => {
          if (subscription.ws.readyState === WebSocket.OPEN) {
            const subscribedSymbols = Array.from(subscription.symbols).map(s => s.toUpperCase());
            if (subscription.symbols.size === 0 || subscribedSymbols.includes(symbol.toUpperCase())) {
              const message = JSON.stringify({
                type: 'historical_klines',
                data: {
                  symbol: symbol.toUpperCase(),
                  interval: interval,
                  klines: intervalData.slice(-100) // Send last 100 candles
                }
              });
              subscription.ws.send(message);
            }
          }
        });
      } else {
        console.log(`[WEBSOCKET] No historical data available for ${symbol} ${interval}`);
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

    console.log(`[WEBSOCKET] Broadcasting update for ${marketUpdate.symbol} to ${this.marketSubscriptions.size} clients`);
    
    let sentCount = 0;
    Array.from(this.marketSubscriptions).forEach((subscription, index) => {
      const clientIndex = index + 1;
      console.log(`[WEBSOCKET] Checking client ${clientIndex}, readyState: ${subscription.ws.readyState}, subscribed symbols: [${Array.from(subscription.symbols).join(', ')}]`);
      
      if (subscription.ws.readyState === WebSocket.OPEN) {
        // Check if client is subscribed to this symbol (normalize to uppercase for comparison)
        const isSubscribed = subscription.symbols.size === 0 || 
                           subscription.symbols.has(marketUpdate.symbol.toUpperCase());
        
        if (isSubscribed) {
          try {
            subscription.ws.send(message);
            sentCount++;
            console.log(`[WEBSOCKET] Successfully sent update to client ${clientIndex} for ${marketUpdate.symbol}`);
          } catch (error) {
            console.error(`[WEBSOCKET] Failed to send to client ${clientIndex}:`, error);
          }
        } else {
          console.log(`[WEBSOCKET] Client ${clientIndex} not subscribed to ${marketUpdate.symbol}`);
        }
      } else {
        console.log(`[WEBSOCKET] Client ${clientIndex} connection not open, readyState: ${subscription.ws.readyState}`);
      }
    });
    
    console.log(`[WEBSOCKET] Successfully sent to ${sentCount} out of ${this.marketSubscriptions.size} clients`);
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

  private async requestAccountBalance(ws: WebSocket, userId: number, exchangeId: number) {
    console.log(`[BALANCE] Starting balance request for user ${userId}, exchange ${exchangeId}`);
    
    try {
      // Fetch the exchange configuration from database
      console.log(`[BALANCE] Fetching exchanges for user ${userId}`);
      const exchanges = await storage.getExchangesByUserId(userId);
      console.log(`[BALANCE] Found ${exchanges.length} exchanges for user ${userId}`);
      
      const targetExchange = exchanges.find(ex => ex.id === exchangeId);
      
      if (!targetExchange) {
        console.error(`[BALANCE] Exchange ${exchangeId} not found for user ${userId}`);
        throw new Error(`Exchange ${exchangeId} not found`);
      }

      console.log(`[BALANCE] Found target exchange: ${targetExchange.name}, isTestnet: ${targetExchange.isTestnet}`);

      // Decrypt the API credentials
      console.log(`[BALANCE] Decrypting API credentials for exchange ${exchangeId}`);
      const { apiKey, apiSecret } = decryptApiCredentials(
        targetExchange.apiKey,
        targetExchange.apiSecret,
        targetExchange.encryptionIv
      );

      console.log(`[BALANCE] API Key length: ${apiKey.length}, Secret length: ${apiSecret.length}`);

      // Make authenticated request to Binance API
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      
      // Create signature for authenticated request
      const crypto = require('crypto');
      const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
      const finalQuery = `${queryString}&signature=${signature}`;

      // Determine the correct API endpoint
      const baseUrl = targetExchange.restApiEndpoint || 
        (targetExchange.isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');
      
      const apiUrl = `${baseUrl}/api/v3/account?${finalQuery}`;
      console.log(`[BALANCE] Making API request to: ${baseUrl}/api/v3/account`);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[BALANCE] API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[BALANCE] Binance API error ${response.status}:`, errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const accountData = await response.json();
      console.log(`[BALANCE] Successfully fetched account data. Account type: ${accountData.accountType}, Balances count: ${accountData.balances?.length}`);

      // Send the real balance data to the client
      const responseData = {
        type: 'api_response',
        data: { 
          balances: accountData.balances,
          accountType: accountData.accountType,
          canTrade: accountData.canTrade,
          canWithdraw: accountData.canWithdraw,
          canDeposit: accountData.canDeposit
        },
        exchangeId: exchangeId,
        userId: userId
      };
      
      console.log(`[BALANCE] Sending response to client with ${accountData.balances?.length} balances`);
      ws.send(JSON.stringify(responseData));
      
    } catch (error) {
      console.error(`[BALANCE] Error fetching balance for user ${userId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch account balance';
      const errorResponse = {
        type: 'api_error',
        error: errorMessage,
        exchangeId: exchangeId,
        userId: userId
      };
      
      console.log(`[BALANCE] Sending error response: ${errorMessage}`);
      ws.send(JSON.stringify(errorResponse));
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

  public getMarketData(): Map<string, any> {
    return this.marketData;
  }

  public getUserConnections(): Map<number, UserConnection> {
    return this.userConnections;
  }

  public stopBinanceStreams(deactivate: boolean = true) {
    console.log('[WEBSOCKET] Stopping all Binance streams');
    
    // Only deactivate streams when fully stopping, not during interval switching
    if (deactivate) {
      this.isStreamsActive = false;
    }
    
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
      console.log(`[WEBSOCKET] Closing user stream ${listenKey}`);
      ws.close();
    });
    this.binanceUserStreams.clear();
    
    console.log('[WEBSOCKET] All Binance streams stopped');
  }

  public close() {
    this.wss.close();
    this.stopBinanceStreams();
  }
}