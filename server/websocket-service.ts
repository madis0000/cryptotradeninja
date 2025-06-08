import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

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
  private isStreamsActive = false;
  private currentStreamType: string = 'ticker';
  private currentSubscriptions: string[] = [];

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      host: '0.0.0.0'
    });
    this.setupWebSocket();
    console.log('[WEBSOCKET] Setting up unified WebSocket server on port 8080 with 0.0.0.0 binding');
    console.log('[WEBSOCKET] Unified service initialized on port 8080 with 0.0.0.0 binding. External streams connect on-demand only.');
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientId = Math.random().toString(36).substring(2, 15);
      const clientIP = req.socket.remoteAddress;
      
      console.log(`[WEBSOCKET] ===== NEW CLIENT CONNECTED ===== ID: ${clientId} from ${clientIP}`);
      console.log(`[WEBSOCKET] Total active subscriptions: ${this.marketSubscriptions.size + 1}`);

      const subscription: MarketSubscription = {
        ws,
        symbols: new Set()
      };
      this.marketSubscriptions.add(subscription);

      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        message: 'Connected to backend WebSocket server'
      }));

      console.log('[WEBSOCKET] Sending initial market data');
      this.sendMarketDataToClient(ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('[WEBSOCKET] Received command from frontend:', message);

          if (message.type === 'subscribe' && message.symbols) {
            console.log('[WEBSOCKET] Frontend requesting subscription to symbols:', message.symbols);
            subscription.symbols = new Set(message.symbols);
            this.startTickerStreams(message.symbols);
            this.sendMarketDataToClient(ws);
          }
        } catch (error) {
          console.error('[WEBSOCKET] Error parsing message:', error);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`[WEBSOCKET] ===== CLIENT DISCONNECT EVENT ===== ID: ${clientId} Code: ${code}, Reason: ${reason.toString()}`);
        console.log(`[WEBSOCKET] Subscriptions before removal: ${this.marketSubscriptions.size}`);
        
        this.marketSubscriptions.delete(subscription);
        console.log(`[WEBSOCKET] Subscriptions after removal: ${this.marketSubscriptions.size}`);

        if (this.marketSubscriptions.size === 0) {
          console.log('[WEBSOCKET] ⚠️  NO CLIENTS CONNECTED - STOPPING ALL STREAMS ⚠️');
          this.stopBinanceStreams();
        } else {
          console.log(`[WEBSOCKET] Still have ${this.marketSubscriptions.size} active subscriptions, keeping streams alive`);
        }
      });
    });
  }

  private startTickerStreams(symbols: string[]) {
    console.log('[WEBSOCKET] Starting ticker streams for symbols:', symbols);
    this.connectConfigurableStream('ticker', symbols);
  }

  public async connectConfigurableStream(dataType: string, symbols: string[], interval?: string, depth?: string) {
    console.log(`[WEBSOCKET] Configuring stream: ${dataType}, symbols: ${symbols.join(',')}, interval: ${interval}`);
    
    this.stopBinanceStreams();
    
    this.currentStreamType = dataType;
    this.currentSubscriptions = symbols;
    
    const wsUrl = 'wss://stream.testnet.binance.vision/ws';
    console.log('[WEBSOCKET] Using configured endpoint:', wsUrl);

    if (dataType === 'ticker') {
      const streamPaths = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`);
      this.connectWithSubscription(wsUrl, streamPaths);
    }

    // Restart streams for existing subscriptions
    if (this.marketSubscriptions.size > 0) {
      console.log(`[WEBSOCKET] Restarting streams for ${this.marketSubscriptions.size} existing subscriptions`);
      this.marketSubscriptions.forEach(subscription => {
        this.sendMarketDataToClient(subscription.ws);
      });
    }
  }

  private connectWithSubscription(wsUrl: string, streamPaths: string[]) {
    console.log('[BINANCE] Using combined stream endpoint for subscription control');
    console.log('[BINANCE] Requesting streams:', streamPaths.join(', '));

    const subscriptionWsUrl = wsUrl.replace('/ws', '/stream');
    console.log('[BINANCE STREAM] Creating new subscription-based WebSocket connection to:', subscriptionWsUrl);
    console.log('[BINANCE STREAM] Final WebSocket URL:', subscriptionWsUrl);

    this.binancePublicWs = new WebSocket(subscriptionWsUrl);
    this.isStreamsActive = true;

    this.binancePublicWs.on('open', () => {
      console.log('[BINANCE STREAM] Connected to Binance subscription stream successfully');
      
      if (this.currentSubscriptions.length > 0) {
        const previousStreams = this.currentSubscriptions.map(symbol => `${symbol.toLowerCase()}@${this.currentStreamType}`);
        console.log('[BINANCE STREAM] Unsubscribing from previous streams:', previousStreams);
        
        const unsubscribeMessage = {
          method: 'UNSUBSCRIBE',
          params: previousStreams,
          id: 1
        };
        
        this.binancePublicWs?.send(JSON.stringify(unsubscribeMessage));
      }

      console.log('[BINANCE STREAM] Subscribing to specific streams:', streamPaths);
      
      const subscribeMessage = {
        method: 'SUBSCRIBE',
        params: streamPaths,
        id: 2
      };
      
      console.log('[BINANCE STREAM] Subscription message:', JSON.stringify(subscribeMessage));
      this.binancePublicWs?.send(JSON.stringify(subscribeMessage));
    });

    this.binancePublicWs.on('message', (rawData) => {
      try {
        if (!this.isStreamsActive) {
          return;
        }

        const message = JSON.parse(rawData.toString());
        
        if (message.result !== undefined && message.id !== undefined) {
          if (message.id === 1) {
            console.log('[BINANCE STREAM] Unsubscription confirmed successfully');
          } else if (message.id === 2) {
            console.log('[BINANCE STREAM] Subscription confirmed successfully');
          }
          return;
        }

        if (message.stream && message.data && message.stream.includes('@ticker')) {
          const tickerData = message.data;
          const symbol = tickerData.s;
          
          if (symbol) {
            const marketUpdate = {
              symbol,
              price: parseFloat(tickerData.c),
              change: parseFloat(tickerData.p),
              changePercent: parseFloat(tickerData.P),
              volume: parseFloat(tickerData.v),
              high: parseFloat(tickerData.h),
              low: parseFloat(tickerData.l),
              timestamp: Date.now()
            };

            console.log(`[BINANCE STREAM] Market update for ${symbol}: ${tickerData.c} (${tickerData.P}%)`);
            this.marketData.set(symbol, marketUpdate);
            this.broadcastMarketUpdate(marketUpdate);
          }
        }
      } catch (error) {
        console.error('[BINANCE STREAM] Error processing data:', error);
      }
    });

    this.binancePublicWs.on('close', (code, reason) => {
      console.log(`[BINANCE STREAM] Disconnected - Code: ${code}, Reason: ${reason.toString()}`);
      this.binancePublicWs = null;
    });

    this.binancePublicWs.on('error', (error) => {
      console.error('[BINANCE STREAM] WebSocket error:', error);
    });
  }

  private sendMarketDataToClient(ws: WebSocket) {
    console.log('[PUBLIC WS] Attempting to send market data to client');
    console.log('[PUBLIC WS] WebSocket ready state:', ws.readyState);

    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const subscription = Array.from(this.marketSubscriptions).find(sub => sub.ws === ws);
    const subscribedSymbols = subscription ? Array.from(subscription.symbols) : [];
    
    console.log('[PUBLIC WS] Client subscribed to:', subscribedSymbols.join(', '));
    console.log('[PUBLIC WS] Available market data symbols:', Array.from(this.marketData.keys()).join(', '));

    const relevantData = Array.from(this.marketData.entries())
      .filter(([symbol]) => subscribedSymbols.length === 0 || subscribedSymbols.includes(symbol))
      .map(([symbol, data]) => ({ symbol, ...data }));

    console.log('[PUBLIC WS] Filtered market data entries:', relevantData.length);

    if (relevantData.length > 0) {
      relevantData.forEach(data => {
        ws.send(JSON.stringify({
          type: 'market_update',
          ...data
        }));
      });
    } else {
      console.log('[PUBLIC WS] No relevant market data available for subscribed symbols');
    }
  }

  private broadcastMarketUpdate(marketUpdate: any) {
    this.marketSubscriptions.forEach(subscription => {
      if (subscription.ws.readyState === WebSocket.OPEN) {
        if (subscription.symbols.size === 0 || subscription.symbols.has(marketUpdate.symbol)) {
          subscription.ws.send(JSON.stringify({
            type: 'market_update',
            ...marketUpdate
          }));
        }
      }
    });
  }

  public stopBinanceStreams(deactivate: boolean = true) {
    console.log('[WEBSOCKET] Stopping all Binance streams');
    console.log('[WEBSOCKET] Clearing cached market data');
    
    if (deactivate) {
      this.isStreamsActive = false;
    }

    this.marketData.clear();

    if (this.binancePublicWs) {
      console.log('[WEBSOCKET] Closing Binance public stream');
      this.binancePublicWs.close();
      this.binancePublicWs = null;
    }

    console.log('[WEBSOCKET] All Binance streams stopped');
  }

  public async startAllMarketsTicker() {
    const symbols = [
      'BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'BNBUSDT', 'DOGEUSDT', 
      'SOLUSDT', 'XRPUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
      'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'ICPUSDT',
      'BTCUSDC', 'ETHUSDC', 'ADAUSDC', 'BNBUSDC', 'SOLUSDC', 'AVAXUSDC',
      'ETHBTC', 'ADABTC', 'BNBBTC', 'DOGEBTC', 'LTCBTC', 'XRPBTC'
    ];
    
    console.log('[WEBSOCKET] Starting all markets ticker stream for real-time data');
    await this.connectConfigurableStream('ticker', symbols);
  }

  public getMarketData(): Map<string, any> {
    return this.marketData;
  }

  public getUserConnections(): Map<number, UserConnection> {
    return this.userConnections;
  }

  public close() {
    this.stopBinanceStreams(true);
    this.wss.close();
  }
}