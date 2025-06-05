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
  private binancePublicWs: WebSocket | null = null;
  private binanceUserStreams = new Map<string, WebSocket>();

  constructor(server: Server) {
    // WebSocket server on dedicated port with proper Replit binding
    const wsPort = parseInt(process.env.WS_PORT || '8080');
    this.wss = new WebSocketServer({ 
      port: wsPort,
      host: '0.0.0.0'
    });

    this.setupWebSocket();
    
    // Start mock data generation only
    this.startMockDataGeneration();
    
    console.log(`[WEBSOCKET] Unified service initialized on port ${wsPort} with 0.0.0.0 binding. External streams connect on-demand only.`);
  }

  private setupWebSocket() {
    const wsPort = parseInt(process.env.WS_PORT || '8080');
    console.log(`[WEBSOCKET] Setting up unified WebSocket server on port ${wsPort} with 0.0.0.0 binding`);
    
    this.wss.on('connection', (ws, request) => {
      const clientIP = request.socket.remoteAddress;
      console.log(`[WEBSOCKET] ✓ NEW CLIENT CONNECTED from ${clientIP}`);

      const subscription: MarketSubscription = {
        ws,
        symbols: new Set()
      };

      this.marketSubscriptions.add(subscription);
      console.log(`[WEBSOCKET] Total active subscriptions: ${this.marketSubscriptions.size}`);

      // Start Binance streams if this is the first client
      if (this.marketSubscriptions.size === 1) {
        console.log(`[WEBSOCKET] First client connected - starting Binance streams`);
        this.initializeBinancePublicStream();
      }

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`[WEBSOCKET] Received message:`, message);
          
          if (message.type === 'subscribe') {
            // Subscribe to specific trading pairs
            const symbols = message.symbols || ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
            console.log(`[WEBSOCKET] Subscribing to symbols:`, symbols);
            symbols.forEach((symbol: string) => {
              subscription.symbols.add(symbol.toLowerCase());
            });
            
            // Send current market data
            this.sendMarketDataToClient(ws);
          }
          
          if (message.type === 'authenticate') {
            await this.authenticateUserConnection(ws, message.userId, message.listenKey);
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
        console.log(`[WEBSOCKET] Client disconnected - Code: ${code}, Reason: ${reason}`);
        this.marketSubscriptions.delete(subscription);
        
        // Clean up user connection
        this.userConnections.forEach((connection, userId) => {
          if (connection.ws === ws) {
            this.userConnections.delete(userId);
          }
        });
        
        console.log(`[WEBSOCKET] Remaining subscriptions: ${this.marketSubscriptions.size}`);
        
        // Stop Binance streams if no clients are connected
        if (this.marketSubscriptions.size === 0) {
          console.log(`[WEBSOCKET] No clients connected - stopping Binance streams`);
          this.stopBinanceStreams();
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



  private async authenticateUserConnection(ws: WebSocket, userId: number, listenKey: string) {
    try {
      // Validate user and listen key
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
        listenKey
      });

      // Connect to Binance user data stream
      await this.connectToBinanceUserStream(userId, listenKey);

      ws.send(JSON.stringify({
        type: 'authenticated',
        message: 'Successfully authenticated and connected to user data stream'
      }));

    } catch (error) {
      console.error('Authentication error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication failed'
      }));
    }
  }

  private initializeBinancePublicStream() {
    console.log('[BINANCE] Initializing Binance public stream connections');
    
    // Start mock data generation for immediate functionality
    this.startMockDataGeneration();
    
    // Connect to Binance testnet WebSocket API for authenticated operations
    const wsApiUrl = 'wss://ws-api.testnet.binance.vision/ws-api/v3';
    console.log(`[BINANCE] Attempting to connect to WebSocket API: ${wsApiUrl}`);
    this.connectToBinanceWebSocketAPI(wsApiUrl);

    // Connect to Binance testnet public stream for market data (default ticker streams)
    this.connectConfigurableStream('ticker', ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'BNBUSDT', 'DOGEUSDT']);
  }

  public connectConfigurableStream(dataType: string, symbols: string[], interval?: string, depth?: string) {
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
  }

  private startMockDataGeneration() {
    // Generate realistic market data for testing
    const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'BNBUSDT', 'DOGEUSDT'];
    const baseData = {
      'BTCUSDT': { basePrice: 43000, volatility: 0.02 },
      'ETHUSDT': { basePrice: 2400, volatility: 0.03 },
      'ADAUSDT': { basePrice: 0.45, volatility: 0.05 },
      'BNBUSDT': { basePrice: 310, volatility: 0.04 },
      'DOGEUSDT': { basePrice: 0.085, volatility: 0.06 }
    };

    setInterval(() => {
      symbols.forEach(symbol => {
        const base = baseData[symbol as keyof typeof baseData];
        const change = (Math.random() - 0.5) * base.volatility;
        const newPrice = base.basePrice * (1 + change);
        const changePercent = change * 100;

        const marketUpdate = {
          symbol,
          price: parseFloat(newPrice.toFixed(symbol.includes('USDT') && !symbol.startsWith('BTC') && !symbol.startsWith('ETH') ? 4 : 2)),
          change: parseFloat(changePercent.toFixed(2)),
          volume: Math.random() * 1000000,
          high: newPrice * 1.02,
          low: newPrice * 0.98,
          timestamp: Date.now()
        };

        this.marketData.set(symbol, marketUpdate);
        this.broadcastMarketUpdate(marketUpdate);
      });
    }, 2000); // Update every 2 seconds
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
    
    const publicStreamWs = new WebSocket(wsUrl);

    publicStreamWs.on('open', () => {
      console.log('[BINANCE STREAM] Connected to Binance public stream successfully');
    });

    publicStreamWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[BINANCE STREAM] Received message:', JSON.stringify(message).substring(0, 200) + '...');
        
        // Handle combined stream format: {"stream":"<streamName>","data":<rawPayload>}
        if (message.stream && message.data) {
          const ticker = message.data;
          const symbol = ticker.s;
          
          if (symbol) {
            const marketUpdate = {
              symbol,
              price: parseFloat(ticker.c),
              change: parseFloat(ticker.P),
              volume: parseFloat(ticker.v),
              high: parseFloat(ticker.h),
              low: parseFloat(ticker.l),
              timestamp: Date.now()
            };

            console.log(`[BINANCE STREAM] Market update for ${symbol}: ${ticker.c}`);
            this.marketData.set(symbol, marketUpdate);
            this.broadcastMarketUpdate(marketUpdate);
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

    publicStreamWs.on('close', (code, reason) => {
      console.log(`[BINANCE STREAM] Disconnected - Code: ${code}, Reason: ${reason}`);
      console.log('[BINANCE STREAM] Attempting reconnection in 5 seconds...');
      setTimeout(() => this.connectToBinancePublic(wsUrl), 5000);
    });

    publicStreamWs.on('error', (error) => {
      console.error('[BINANCE STREAM] WebSocket error:', error);
    });
  }

  private async connectToBinanceUserStream(userId: number, listenKey: string) {
    const wsUrl = `wss://stream.binance.com:9443/ws/${listenKey}`;
    
    // Close existing connection if any
    if (this.binanceUserStreams.has(listenKey)) {
      this.binanceUserStreams.get(listenKey)?.close();
    }

    const userWs = new WebSocket(wsUrl);

    this.binanceUserStreams.set(listenKey, userWs);

    userWs.on('open', () => {
      console.log(`Connected to Binance user stream for user ${userId}`);
    });

    userWs.on('message', (data) => {
      try {
        const userData = JSON.parse(data.toString());
        this.broadcastUserUpdate(userId, userData);
      } catch (error) {
        console.error('Error processing Binance user data:', error);
      }
    });

    userWs.on('close', () => {
      console.log(`Binance user stream disconnected for user ${userId}`);
      this.binanceUserStreams.delete(listenKey);
    });

    userWs.on('error', (error) => {
      console.error(`Binance user stream error for user ${userId}:`, error);
      this.binanceUserStreams.delete(listenKey);
    });
  }

  private sendMarketDataToClient(ws: WebSocket) {
    console.log('[PUBLIC WS] Attempting to send market data to client');
    console.log(`[PUBLIC WS] WebSocket ready state: ${ws.readyState}`);
    
    const currentData = Array.from(this.marketData.values());
    console.log(`[PUBLIC WS] Available market data entries: ${currentData.length}`);
    
    if (currentData.length > 0) {
      try {
        const message = JSON.stringify({
          type: 'market_data',
          data: currentData
        });
        console.log(`[PUBLIC WS] Sending market data message (${message.length} chars)`);
        ws.send(message);
        console.log('[PUBLIC WS] Market data sent successfully');
      } catch (error) {
        console.error('[PUBLIC WS] Error sending market data:', error);
      }
    } else {
      console.log('[PUBLIC WS] No market data available to send');
    }
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
    
    this.marketSubscriptions.forEach(subscription => {
      if (subscription.ws.readyState === WebSocket.OPEN) {
        // Check if client is subscribed to this symbol
        const isSubscribed = subscription.symbols.size === 0 || 
                           subscription.symbols.has(marketUpdate.symbol.toLowerCase());
        
        if (isSubscribed) {
          subscription.ws.send(message);
          console.log(`[WEBSOCKET] Sent update to client for ${marketUpdate.symbol}`);
        }
      }
    });
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

  public stopBinanceStreams() {
    console.log('[WEBSOCKET] Stopping all Binance streams');
    
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