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
  private publicWss: WebSocketServer;
  private userWss: WebSocketServer;
  private userConnections = new Map<number, UserConnection>();
  private marketSubscriptions = new Set<MarketSubscription>();
  private marketData = new Map<string, any>();
  private binancePublicWs: WebSocket | null = null;
  private binanceUserStreams = new Map<string, WebSocket>();

  constructor(server: Server) {
    // Public market data WebSocket server
    this.publicWss = new WebSocketServer({ 
      port: 8081, 
      path: '/market'
    });

    // User data WebSocket server  
    this.userWss = new WebSocketServer({ 
      port: 8082, 
      path: '/user'
    });

    this.setupPublicWebSocket();
    this.setupUserWebSocket();
    this.initializeBinancePublicStream();
  }

  private setupPublicWebSocket() {
    this.publicWss.on('connection', (ws, request) => {
      console.log('Public WebSocket client connected');

      const subscription: MarketSubscription = {
        ws,
        symbols: new Set()
      };

      this.marketSubscriptions.add(subscription);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'subscribe') {
            // Subscribe to specific trading pairs
            const symbols = message.symbols || ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
            symbols.forEach((symbol: string) => {
              subscription.symbols.add(symbol.toLowerCase());
            });
            
            // Send current market data
            this.sendMarketDataToClient(ws);
          }
        } catch (error) {
          console.error('Error processing public WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Public WebSocket client disconnected');
        this.marketSubscriptions.delete(subscription);
      });

      ws.on('error', (error) => {
        console.error('Public WebSocket error:', error);
        this.marketSubscriptions.delete(subscription);
      });

      // Send initial market data
      this.sendMarketDataToClient(ws);
    });
  }

  private setupUserWebSocket() {
    this.userWss.on('connection', (ws, request) => {
      console.log('User WebSocket client connected');

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'authenticate') {
            await this.authenticateUserConnection(ws, message.userId, message.listenKey);
          }
        } catch (error) {
          console.error('Error processing user WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message'
          }));
        }
      });

      ws.on('close', () => {
        console.log('User WebSocket client disconnected');
        // Clean up user connection
        this.userConnections.forEach((connection, userId) => {
          if (connection.ws === ws) {
            this.userConnections.delete(userId);
          }
        });
      });

      ws.on('error', (error) => {
        console.error('User WebSocket error:', error);
      });
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
    // Start mock data generation for immediate functionality
    this.startMockDataGeneration();
    
    // Connect to Binance testnet WebSocket API
    const wsApiUrl = 'wss://ws-api.testnet.binance.vision/ws-api/v3';
    this.connectToBinanceWebSocketAPI(wsApiUrl);
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
      this.binancePublicWs.close();
    }

    console.log('Connecting to Binance WebSocket API:', wsApiUrl);
    this.binancePublicWs = new WebSocket(wsApiUrl);

    this.binancePublicWs.on('open', () => {
      console.log('Connected to Binance WebSocket API');
      
      // Subscribe to ticker data using the modern WebSocket API
      const subscribeMessage = {
        id: 1,
        method: "ticker.24hr",
        params: {
          symbols: ["BTCUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT", "DOGEUSDT"]
        }
      };
      
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

    this.binancePublicWs.on('close', () => {
      console.log('Binance WebSocket API disconnected, reconnecting...');
      setTimeout(() => this.connectToBinanceWebSocketAPI(wsApiUrl), 5000);
    });

    this.binancePublicWs.on('error', (error) => {
      console.error('Binance WebSocket API error:', error);
    });
  }

  private connectToBinancePublic(wsUrl: string) {
    // Legacy method - keeping for fallback
    if (this.binancePublicWs) {
      this.binancePublicWs.close();
    }

    this.binancePublicWs = new WebSocket(wsUrl);

    this.binancePublicWs.on('open', () => {
      console.log('Connected to Binance public stream (legacy)');
    });

    this.binancePublicWs.on('message', (data) => {
      try {
        const ticker = JSON.parse(data.toString());
        
        if (ticker.s) { // Valid ticker data
          const symbol = ticker.s;
          const marketUpdate = {
            symbol,
            price: parseFloat(ticker.c),
            change: parseFloat(ticker.P),
            volume: parseFloat(ticker.v),
            high: parseFloat(ticker.h),
            low: parseFloat(ticker.l),
            timestamp: Date.now()
          };

          this.marketData.set(symbol, marketUpdate);
          this.broadcastMarketUpdate(marketUpdate);
        }
      } catch (error) {
        console.error('Error processing Binance public data:', error);
      }
    });

    this.binancePublicWs.on('close', () => {
      console.log('Binance public stream disconnected, reconnecting...');
      setTimeout(() => this.connectToBinancePublic(wsUrl), 5000);
    });

    this.binancePublicWs.on('error', (error) => {
      console.error('Binance public stream error:', error);
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
    const currentData = Array.from(this.marketData.values());
    if (currentData.length > 0) {
      ws.send(JSON.stringify({
        type: 'market_data',
        data: currentData
      }));
    }
  }

  private broadcastMarketUpdate(marketUpdate: any) {
    const message = JSON.stringify({
      type: 'market_update',
      data: marketUpdate
    });

    this.marketSubscriptions.forEach(subscription => {
      if (subscription.ws.readyState === WebSocket.OPEN) {
        // Check if client is subscribed to this symbol
        if (subscription.symbols.size === 0 || 
            subscription.symbols.has(marketUpdate.symbol.toLowerCase())) {
          subscription.ws.send(message);
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

  public close() {
    this.publicWss.close();
    this.userWss.close();
    this.binancePublicWs?.close();
    this.binanceUserStreams.forEach(ws => ws.close());
  }
}