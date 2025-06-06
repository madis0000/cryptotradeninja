import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { storage } from './storage';

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
  private historicalData = new Map<string, Map<string, any[]>>();
  private binancePublicWs: WebSocket | null = null;
  private binanceUserStreams = new Map<string, WebSocket>();
  private mockDataInterval: NodeJS.Timeout | null = null;
  private isStreamsActive = false;
  private currentStreamType: string = 'ticker';
  private currentInterval: string = '1m';

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      host: '0.0.0.0'
    });
    
    console.log('[WEBSOCKET] Setting up unified WebSocket server on port 8080 with 0.0.0.0 binding');
    this.setupWebSocket();
    console.log('[WEBSOCKET] Unified service initialized on port 8080 with 0.0.0.0 binding. External streams connect on-demand only.');
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientId = Math.random().toString(36).substring(7);
      const clientIp = req.socket.remoteAddress;
      console.log(`[WEBSOCKET] ===== NEW CLIENT CONNECTED ===== ID: ${clientId} from ${clientIp}`);
      
      // Add to market subscriptions with empty symbol set initially
      const subscription: MarketSubscription = {
        ws,
        symbols: new Set<string>()
      };
      this.marketSubscriptions.add(subscription);
      
      console.log(`[WEBSOCKET] Total active subscriptions: ${this.marketSubscriptions.size}`);
      
      // Send initial market data
      console.log('[WEBSOCKET] Sending initial market data');
      this.sendMarketDataToClient(ws);
      
      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        message: 'Connected to backend WebSocket server'
      }));

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`[WEBSOCKET] Received command from frontend:`, message);
          
          if (message.type === 'subscribe' && message.symbols) {
            console.log('[WEBSOCKET] Frontend requesting subscription to symbols:', message.symbols);
            subscription.symbols.clear();
            message.symbols.forEach((symbol: string) => subscription.symbols.add(symbol.toUpperCase()));
            this.sendMarketDataToClient(ws);
          } else if (message.type === 'authenticate' && message.userId) {
            this.authenticateUserConnection(ws, message.userId, message.apiKey);
          }
        } catch (error) {
          console.error('[WEBSOCKET] Error parsing message:', error);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`[WEBSOCKET] ===== CLIENT DISCONNECT EVENT ===== ID: ${clientId} Code: ${code}, Reason: ${reason}`);
        
        console.log(`[WEBSOCKET] Subscriptions before removal: ${this.marketSubscriptions.size}`);
        this.marketSubscriptions.delete(subscription);
        console.log(`[WEBSOCKET] Subscriptions after removal: ${this.marketSubscriptions.size}`);
        
        if (this.marketSubscriptions.size === 0) {
          console.log('[WEBSOCKET] ⚠️  NO CLIENTS CONNECTED - STOPPING ALL STREAMS ⚠️');
          this.stopBinanceStreams();
        }
      });

      ws.on('error', (error) => {
        console.error(`[WEBSOCKET] Client error:`, error);
        this.marketSubscriptions.delete(subscription);
      });
    });
  }

  public connectConfigurableStream(dataType: string, symbols: string[], interval?: string, depth?: string) {
    console.log(`[WEBSOCKET] Configuring stream: ${dataType}, symbols: ${symbols.join(', ')}, interval: ${interval || 'N/A'}`);
    
    // Stop current streams first
    this.stopBinanceStreams();
    this.currentStreamType = dataType;
    this.currentInterval = interval || '1m';
    
    if (dataType === 'kline' && interval) {
      const streams = symbols.map(symbol => `${symbol.toLowerCase()}@kline_${interval}`).join('/');
      const wsUrl = `wss://stream.testnet.binance.vision/stream?streams=${streams}`;
      this.connectToBinancePublic(wsUrl);
    } else if (dataType === 'ticker') {
      const streams = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`).join('/');
      const wsUrl = `wss://stream.testnet.binance.vision/stream?streams=${streams}`;
      this.connectToBinancePublic(wsUrl);
    }
    
    return { message: 'Stream configured successfully', configuration: { dataType, symbols, interval } };
  }

  private connectToBinancePublic(wsUrl: string) {
    console.log(`[BINANCE] Connecting to public stream: ${wsUrl}`);
    console.log(`[BINANCE STREAM] Creating new WebSocket connection to: ${wsUrl}`);
    
    this.binancePublicWs = new WebSocket(wsUrl);
    this.isStreamsActive = true;

    this.binancePublicWs.on('open', () => {
      console.log('[BINANCE STREAM] Connected to Binance public stream successfully');
    });

    this.binancePublicWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.stream && message.data) {
          if (message.stream.includes('@kline_')) {
            const klineData = message.data.k;
            console.log(`[BINANCE STREAM] Kline update for ${klineData.s} (${this.currentInterval}): ${klineData.c}`);
            
            this.storeHistoricalKlineData(klineData.s, this.currentInterval, klineData);
            this.broadcastKlineUpdate(klineData.s, this.currentInterval, klineData);
            
            const marketUpdate = {
              symbol: klineData.s,
              price: parseFloat(klineData.c),
              change: 0,
              volume: parseFloat(klineData.v),
              high: parseFloat(klineData.h),
              low: parseFloat(klineData.l),
              timestamp: Date.now()
            };
            
            this.marketData.set(klineData.s, marketUpdate);
            this.broadcastMarketUpdate(klineData.s, marketUpdate);
          }
        }
      } catch (error) {
        console.error('[BINANCE STREAM] Error parsing message:', error);
      }
    });

    this.binancePublicWs.on('close', (code, reason) => {
      console.log(`[BINANCE STREAM] Disconnected - Code: ${code}, Reason: ${reason}`);
      if (this.isStreamsActive) {
        console.log('[BINANCE STREAM] Attempting to reconnect in 5 seconds...');
        setTimeout(() => {
          if (this.isStreamsActive) {
            this.connectToBinancePublic(wsUrl);
          }
        }, 5000);
      } else {
        console.log('[BINANCE STREAM] Streams inactive, not reconnecting');
      }
    });

    this.binancePublicWs.on('error', (error) => {
      console.error('[BINANCE STREAM] WebSocket error:', error);
    });
  }

  private async authenticateUserConnection(ws: WebSocket, userId: number, apiKey?: string) {
    try {
      console.log(`[USER STREAM] Authenticating user ${userId}`);
      
      this.userConnections.set(userId, {
        ws,
        userId,
        listenKey: apiKey || 'websocket_api'
      });

      ws.send(JSON.stringify({
        type: 'authenticated',
        message: 'Successfully authenticated. Connecting to WebSocket API...'
      }));

      this.connectToBinanceUserStream(userId, apiKey || 'websocket_api');

    } catch (error) {
      console.error('[USER STREAM] Authentication error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication failed'
      }));
    }
  }

  private async connectToBinanceUserStream(userId: number, listenKey: string) {
    const exchanges = await storage.getExchangesByUserId(userId);
    const binanceExchange = exchanges.find(ex => ex.name.toLowerCase().includes('binance'));
    
    if (!binanceExchange) {
      console.error('[USER STREAM] No Binance exchange found for user', userId);
      const userConnection = this.userConnections.get(userId);
      if (userConnection) {
        userConnection.ws.send(JSON.stringify({
          type: 'error',
          message: 'No active Binance exchange configuration found'
        }));
      }
      return;
    }

    const wsUrl = binanceExchange.wsApiEndpoint || 
      (binanceExchange.isTestnet 
        ? 'wss://ws-api.testnet.binance.vision/ws-api/v3'
        : 'wss://ws-api.binance.com:443/ws-api/v3');

    const connectionKey = `user_${userId}`;
    
    if (this.binanceUserStreams.has(connectionKey)) {
      this.binanceUserStreams.get(connectionKey)?.close();
    }

    try {
      console.log(`[USER STREAM] 🌐 BALANCE FETCH METHOD: Attempting WebSocket API connection to ${wsUrl}`);
      
      await this.attemptWebSocketApiConnection(userId, binanceExchange, wsUrl);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`[USER STREAM] ⚠️ WebSocket API failed, falling back to REST API:`, errorMessage);
      
      const userConnection = this.userConnections.get(userId);
      if (userConnection) {
        userConnection.ws.send(JSON.stringify({
          type: 'user_stream_unavailable',
          message: 'WebSocket API connection failed. Using REST API for balance requests.',
          error: 'websocket_failed',
          fallback: 'rest_api'
        }));
      }
      
      this.handleTestnetBalanceRequest(userId, binanceExchange);
    }
  }

  private async attemptWebSocketApiConnection(userId: number, binanceExchange: any, wsUrl: string) {
    return new Promise<void>((resolve, reject) => {
      const connectionKey = `user_${userId}`;
      
      if (this.binanceUserStreams.has(connectionKey)) {
        this.binanceUserStreams.get(connectionKey)?.close();
      }

      const userWs = new WebSocket(wsUrl);
      this.binanceUserStreams.set(connectionKey, userWs);

      const timeout = setTimeout(() => {
        userWs.close();
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      userWs.on('open', () => {
        clearTimeout(timeout);
        console.log(`[USER STREAM] ✅ Connected to Binance WebSocket API for user ${userId}`);
        
        this.requestAccountBalanceViaWebSocket(userWs, userId, binanceExchange)
          .then(() => resolve())
          .catch(reject);
      });

      userWs.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`[USER STREAM] WebSocket connection error:`, error);
        reject(error);
      });

      userWs.on('close', () => {
        clearTimeout(timeout);
        this.binanceUserStreams.delete(connectionKey);
      });

      userWs.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          console.log(`[USER STREAM] WebSocket API response:`, response);
          
          if (response.result && response.result.balances) {
            const userConnection = this.userConnections.get(userId);
            if (userConnection) {
              userConnection.ws.send(JSON.stringify({
                type: 'balance_update',
                data: {
                  balances: response.result.balances,
                  method: 'websocket_api'
                }
              }));
              console.log(`[USER STREAM] ✅ Successfully fetched balance via WebSocket API for user ${userId}`);
            }
          }
        } catch (error) {
          console.error(`[USER STREAM] Error parsing WebSocket message:`, error);
        }
      });
    });
  }

  private async requestAccountBalanceViaWebSocket(userWs: WebSocket, userId: number, binanceExchange: any) {
    return new Promise<void>((resolve, reject) => {
      try {
        const { decrypt } = require('./encryption');
        const crypto = require('crypto');
        
        const decryptedApiKey = decrypt(binanceExchange.apiKey, binanceExchange.encryptionIv);
        const decryptedApiSecret = decrypt(binanceExchange.apiSecret, binanceExchange.encryptionIv);
        
        const timestamp = Date.now();
        const params = { timestamp };
        const queryString = Object.keys(params)
          .map(key => `${key}=${params[key as keyof typeof params]}`)
          .join('&');
        
        const signature = crypto.createHmac('sha256', decryptedApiSecret)
          .update(queryString)
          .digest('hex');
        
        const request = {
          id: `balance_${Date.now()}`,
          method: 'account.status',
          params: {
            timestamp,
            signature,
            apiKey: decryptedApiKey
          }
        };
        
        console.log(`[USER STREAM] Sending WebSocket API balance request for user ${userId}`);
        userWs.send(JSON.stringify(request));
        
        setTimeout(() => {
          resolve();
        }, 5000);
        
      } catch (error) {
        console.error(`[USER STREAM] Error creating WebSocket API request:`, error);
        reject(error);
      }
    });
  }

  private async handleTestnetBalanceRequest(userId: number, exchange: any) {
    try {
      console.log(`[USER STREAM] Handling REST API balance request for user ${userId}`);
      
      const crypto = await import('crypto');
      const { decrypt } = await import('./encryption');
      
      const decryptedApiKey = decrypt(exchange.apiKey, exchange.encryptionIv);
      const decryptedApiSecret = decrypt(exchange.apiSecret, exchange.encryptionIv);
      
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', decryptedApiSecret)
        .update(queryString)
        .digest('hex');
      
      const url = `${exchange.restApiEndpoint}/api/v3/account?${queryString}&signature=${signature}`;
      
      const response = await fetch(url, {
        headers: {
          'X-MBX-APIKEY': decryptedApiKey
        }
      });
      
      if (response.ok) {
        const accountData = await response.json();
        
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
      console.error(`[USER STREAM] REST API balance request failed for user ${userId}:`, error);
      
      const userConnection = this.userConnections.get(userId);
      if (userConnection) {
        userConnection.ws.send(JSON.stringify({
          type: 'balance_error',
          message: 'Failed to fetch balance from REST API',
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    }
  }

  private broadcastUserUpdate(userId: number, data: any) {
    const userConnection = this.userConnections.get(userId);
    if (userConnection && userConnection.ws.readyState === WebSocket.OPEN) {
      userConnection.ws.send(JSON.stringify(data));
    }
  }

  private sendMarketDataToClient(ws: WebSocket, symbols: string[] = []) {
    try {
      console.log('[PUBLIC WS] Attempting to send market data to client');
      console.log('[PUBLIC WS] WebSocket ready state:', ws.readyState);
      console.log('[PUBLIC WS] Client subscribed to:', symbols.join(', '));

      if (ws.readyState !== WebSocket.OPEN) {
        console.log('[PUBLIC WS] WebSocket not ready, skipping market data send');
        return;
      }

      const filteredData = [];
      for (const [symbol, data] of this.marketData.entries()) {
        if (symbols.length === 0 || symbols.includes(symbol)) {
          filteredData.push(data);
        }
      }

      console.log('[PUBLIC WS] Filtered market data entries:', filteredData.length);

      if (filteredData.length === 0) {
        console.log('[PUBLIC WS] No relevant market data available for subscribed symbols');
        return;
      }

      const message = JSON.stringify({
        type: 'market_data',
        data: filteredData
      });

      console.log('[PUBLIC WS] Sending filtered market data (' + message.length + ' chars)');
      ws.send(message);
      console.log('[PUBLIC WS] Filtered market data sent successfully');

    } catch (error) {
      console.error('[PUBLIC WS] Error sending market data to client:', error);
    }
  }

  private stopBinanceStreams() {
    console.log('[WEBSOCKET] Stopping all Binance streams');
    
    if (this.binancePublicWs) {
      console.log('[WEBSOCKET] Closing Binance public stream');
      this.binancePublicWs.close();
      this.binancePublicWs = null;
    }

    this.binanceUserStreams.forEach((ws, key) => {
      console.log(`[WEBSOCKET] Closing user stream: ${key}`);
      ws.close();
    });
    this.binanceUserStreams.clear();

    if (this.mockDataInterval) {
      clearInterval(this.mockDataInterval);
      this.mockDataInterval = null;
    }

    this.isStreamsActive = false;
    console.log('[WEBSOCKET] All Binance streams stopped');
  }

  private storeHistoricalKlineData(symbol: string, interval: string, klineData: any) {
    if (!this.historicalData.has(symbol)) {
      this.historicalData.set(symbol, new Map());
    }
    
    const symbolData = this.historicalData.get(symbol)!;
    if (!symbolData.has(interval)) {
      symbolData.set(interval, []);
    }
    
    const klines = symbolData.get(interval)!;
    
    const formattedKline = {
      openTime: klineData.t,
      closeTime: klineData.T,
      open: parseFloat(klineData.o),
      high: parseFloat(klineData.h),
      low: parseFloat(klineData.l),
      close: parseFloat(klineData.c),
      volume: parseFloat(klineData.v),
      trades: klineData.n
    };
    
    const existingIndex = klines.findIndex(k => k.openTime === formattedKline.openTime);
    if (existingIndex >= 0) {
      klines[existingIndex] = formattedKline;
    } else {
      klines.push(formattedKline);
      if (klines.length > 1000) {
        klines.shift();
      }
    }
    
    klines.sort((a, b) => a.openTime - b.openTime);
  }

  private broadcastKlineUpdate(symbol: string, interval: string, klineData: any) {
    console.log(`[WEBSOCKET] Broadcasting kline update for ${symbol} to ${this.marketSubscriptions.size} clients`);
    
    let successCount = 0;
    this.marketSubscriptions.forEach((subscription, index) => {
      if (subscription.ws.readyState === WebSocket.OPEN) {
        console.log(`[WEBSOCKET] Kline symbol: ${symbol}, subscribed: [${Array.from(subscription.symbols).join(', ')}], matched: ${subscription.symbols.has(symbol) || subscription.symbols.size === 0}`);
        
        if (subscription.symbols.has(symbol) || subscription.symbols.size === 0) {
          try {
            console.log(`[WEBSOCKET] Sending kline to client ${index + 1}, readyState: ${subscription.ws.readyState}`);
            subscription.ws.send(JSON.stringify({
              type: 'kline_update',
              symbol,
              interval,
              data: {
                openTime: klineData.t,
                closeTime: klineData.T,
                open: parseFloat(klineData.o),
                high: parseFloat(klineData.h),
                low: parseFloat(klineData.l),
                close: parseFloat(klineData.c),
                volume: parseFloat(klineData.v),
                trades: klineData.n,
                isFinal: klineData.x
              }
            }));
            console.log(`[WEBSOCKET] Successfully sent kline update to client ${index + 1} for ${symbol}`);
            successCount++;
          } catch (error) {
            console.error(`[WEBSOCKET] Failed to send kline to client ${index + 1}:`, error);
          }
        }
      }
    });
    
    console.log(`[WEBSOCKET] Successfully sent kline update to ${successCount} out of ${this.marketSubscriptions.size} clients`);
  }

  private broadcastMarketUpdate(symbol: string, data: any) {
    console.log(`[WEBSOCKET] Broadcasting update for ${symbol} to ${this.marketSubscriptions.size} clients`);
    
    let successCount = 0;
    this.marketSubscriptions.forEach((subscription, index) => {
      if (subscription.ws.readyState === WebSocket.OPEN) {
        console.log(`[WEBSOCKET] Checking client ${index + 1}, readyState: ${subscription.ws.readyState}, subscribed symbols: [${Array.from(subscription.symbols).join(', ')}]`);
        
        if (subscription.symbols.has(symbol) || subscription.symbols.size === 0) {
          try {
            subscription.ws.send(JSON.stringify({
              type: 'market_data',
              data: [data]
            }));
            console.log(`[WEBSOCKET] Successfully sent update to client ${index + 1} for ${symbol}`);
            successCount++;
          } catch (error) {
            console.error(`[WEBSOCKET] Failed to send to client ${index + 1}:`, error);
          }
        } else {
          console.log(`[WEBSOCKET] Client ${index + 1} not subscribed to ${symbol}`);
        }
      } else {
        console.log(`[WEBSOCKET] Client ${index + 1} WebSocket not ready (state: ${subscription.ws.readyState})`);
      }
    });
    
    console.log(`[WEBSOCKET] Successfully sent to ${successCount} out of ${this.marketSubscriptions.size} clients`);
  }
}