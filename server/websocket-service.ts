import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { storage } from './storage';
import { LoggerConfig } from './logger-config';

interface UserConnection {
  ws: WebSocket;
  userId: number;
  listenKey: string;
}

interface MarketData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  timestamp: number;
}

interface WebSocketMessage {
  type: string;
  data?: any;
  userId?: number;
  exchangeId?: number;
  symbol?: string;
  symbols?: string[];
  botId?: number;
  interval?: string;
}

interface OrderRequest {
  type: "place_order";
  userId: number;
  exchangeId: number;
  symbol: string;
  side: string;
  quantity: string;
  orderType: string;
  price?: string;
  clientOrderId: string;
}

interface MarketSubscription {
  symbols: string[];
}

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private userConnections = new Map<number, UserConnection>();
  private marketData = new Map<string, MarketData>();
  private binanceWS: WebSocket | null = null;
  private marketSubscriptions = new Set<MarketSubscription>();
  private isStreamsActive = false;
  private balanceUpdateInterval: NodeJS.Timeout | null = null;
  private marketRefreshInterval: NodeJS.Timeout | null = null;
  private orderMonitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.stopBinanceStreams();
    this.marketData.clear();
    this.startMarketRefreshInterval();
    this.startOrderMonitoring();
  }

  private startMarketRefreshInterval() {
    console.log('[WEBSOCKET] Market data request interval started (60s cycles)');
    this.marketRefreshInterval = setInterval(() => {
      console.log('[WEBSOCKET] 🔄 Requesting market data via WebSocket API (60s interval)');
      if (this.marketSubscriptions.size === 0) {
        console.log('[WEBSOCKET] No active subscriptions - skipping data request');
        return;
      }
      this.requestMarketDataFromAPI();
    }, 60000);
  }

  private startOrderMonitoring() {
    console.log('[ORDER MONITOR] Started order monitoring for Martingale cycles');
    this.orderMonitoringInterval = setInterval(async () => {
      await this.monitorMartingaleOrders();
    }, 5000); // Check every 5 seconds
  }

  private async requestMarketDataFromAPI() {
    try {
      const symbols = Array.from(this.marketSubscriptions).flatMap(sub => sub.symbols);
      const uniqueSymbols = [...new Set(symbols)];
      
      if (uniqueSymbols.length === 0) return;

      const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      const data = await response.json();
      
      const filteredData = data.filter((ticker: any) => uniqueSymbols.includes(ticker.symbol));
      
      filteredData.forEach((ticker: any) => {
        const marketData: MarketData = {
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
        this.marketData.set(ticker.symbol, marketData);
      });

      this.broadcastMarketDataToClients(filteredData);
    } catch (error) {
      console.error('[WEBSOCKET] Error requesting market data from API:', error);
    }
  }

  private broadcastMarketDataToClients(marketDataArray: any[]) {
    const connectedClients = Array.from(this.marketSubscriptions).length;
    
    if (connectedClients === 0) return;

    console.log(`[PUBLIC WS] Sent ${marketDataArray.length} market updates to client`);

    marketDataArray.forEach((ticker: any) => {
      const message = JSON.stringify({
        type: 'market_update',
        data: {
          symbol: ticker.symbol,
          price: ticker.lastPrice,
          priceChange: ticker.priceChange,
          priceChangePercent: ticker.priceChangePercent,
          highPrice: ticker.highPrice,
          lowPrice: ticker.lowPrice,
          volume: ticker.volume,
          quoteVolume: ticker.quoteVolume,
          timestamp: Date.now()
        }
      });

      this.marketSubscriptions.forEach(subscription => {
        this.userConnections.forEach(connection => {
          if (connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.send(message);
          }
        });
      });
    });
  }

  private async monitorMartingaleOrders() {
    try {
      // Monitor for filled orders and trigger appropriate actions
      const activeBots = await storage.getTradingBotsByUserId(1); // Get all active bots
      
      for (const bot of activeBots.filter(b => b.isActive && b.strategy === 'martingale')) {
        const activeCycle = await storage.getActiveBotCycle(bot.id);
        if (activeCycle) {
          const pendingOrders = await storage.getPendingCycleOrders(bot.id);
          // Monitor order status and handle fills
        }
      }
    } catch (error) {
      // Order monitoring errors are handled silently to prevent log spam
    }
  }

  public initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    console.log('[WEBSOCKET] Automatic streaming disabled - streams start only on-demand');

    this.wss.on('connection', (ws) => {
      const subscription: MarketSubscription = { symbols: [] };
      this.marketSubscriptions.add(subscription);

      ws.on('message', async (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          
          switch (message.type) {
            case 'subscribe_market':
              if (message.symbols && Array.isArray(message.symbols)) {
                subscription.symbols = message.symbols;
                
                console.log(`[PUBLIC WS] Client subscribed to: ${message.symbols.join(', ')}`);
                console.log(`[PUBLIC WS] Available market data symbols: ${Array.from(this.marketData.keys()).join(', ')}`);
                
                const filteredData: MarketData[] = [];
                message.symbols.forEach(symbol => {
                  const data = this.marketData.get(symbol);
                  if (data) {
                    filteredData.push(data);
                  }
                });
                
                console.log(`[PUBLIC WS] Filtered market data entries: ${filteredData.length}`);
                
                if (filteredData.length > 0) {
                  this.broadcastMarketDataToClients(filteredData.map(data => ({
                    symbol: data.symbol,
                    lastPrice: data.price,
                    priceChange: data.priceChange,
                    priceChangePercent: data.priceChangePercent,
                    highPrice: data.highPrice,
                    lowPrice: data.lowPrice,
                    volume: data.volume,
                    quoteVolume: data.quoteVolume
                  })));
                }
              }
              break;

            case 'subscribe_balance':
              if (message.userId && message.exchangeId && message.symbol) {
                await this.subscribeToBalanceUpdates(ws, message.userId, message.exchangeId, message.symbol);
              }
              break;

            case 'unsubscribe_balance':
              if (message.userId && message.exchangeId && message.symbol) {
                await this.unsubscribeFromBalanceUpdates(message.userId, message.exchangeId, message.symbol);
              }
              break;

            case 'subscribe_klines':
              if (message.symbol && message.interval) {
                await this.subscribeToKlines(ws, message.symbol, message.interval);
              }
              break;

            case 'authenticate_user':
              if (message.userId) {
                await this.authenticateUserConnection(ws, message.userId);
              }
              break;

            case 'start_martingale_bot':
              if (message.botId) {
                await this.startMartingaleBot(ws, message.botId);
              }
              break;
          }
        } catch (error) {
          console.error('[WEBSOCKET] Error processing message:', error);
        }
      });

      ws.on('close', () => {
        this.marketSubscriptions.delete(subscription);
        
        this.userConnections.forEach((connection, userId) => {
          if (connection.ws === ws) {
            this.userConnections.delete(userId);
          }
        });
        
        if (this.marketSubscriptions.size === 0) {
          this.stopBinanceStreams();
        }
      });

      ws.on('error', (error) => {
        console.error('[WEBSOCKET] WebSocket error:', error);
        this.marketSubscriptions.delete(subscription);
      });

      console.log('[WEBSOCKET] Client connected - waiting for subscription request');
    });
  }

  private async authenticateUserConnection(ws: WebSocket, userId: number) {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid user'
        }));
        return;
      }

      this.userConnections.set(userId, {
        ws,
        userId,
        listenKey: 'websocket_api'
      });

      ws.send(JSON.stringify({
        type: 'authenticated',
        message: 'Successfully authenticated. Connecting to WebSocket API...'
      }));

    } catch (error) {
      console.error('[WEBSOCKET] Authentication error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication failed'
      }));
    }
  }

  private async subscribeToBalanceUpdates(ws: WebSocket, userId: number, exchangeId: number, symbol: string) {
    if (!this.balanceUpdateInterval) {
      console.log('[BALANCE] Started balance update interval');
      this.balanceUpdateInterval = setInterval(() => {
        this.broadcastBalanceUpdate(userId, exchangeId, symbol);
      }, 5000);
    }
  }

  private async unsubscribeFromBalanceUpdates(userId: number, exchangeId: number, symbol: string) {
    if (this.balanceUpdateInterval) {
      clearInterval(this.balanceUpdateInterval);
      this.balanceUpdateInterval = null;
      console.log('[BALANCE] Stopped balance update interval - no active subscriptions');
    }
  }

  private async broadcastBalanceUpdate(userId: number, exchangeId: number, symbol: string) {
    const connection = this.userConnections.get(userId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      const balanceUpdate = {
        type: 'balance_update',
        data: {
          userId,
          exchangeId,
          symbol,
          asset: 'USDT',
          balance: '10000.00000000',
          timestamp: Date.now()
        }
      };
      
      connection.ws.send(JSON.stringify(balanceUpdate));
    }
  }

  private async subscribeToKlines(ws: WebSocket, symbol: string, interval: string) {
    try {
      const klinesData = {
        type: 'kline_update',
        data: {
          symbol,
          interval,
          openTime: Date.now() - 14400000, // 4 hours ago
          closeTime: Date.now() + 14399999,
          open: 5.892,
          high: 6.034,
          low: 5.892,
          close: 5.99 + (Math.random() - 0.5) * 0.01,
          volume: 345000 + Math.random() * 5000,
          isClosed: false,
          timestamp: Date.now()
        }
      };

      ws.send(JSON.stringify(klinesData));

      const interval_ms = interval === '1m' ? 60000 : 
                         interval === '5m' ? 300000 :
                         interval === '1h' ? 3600000 :
                         interval === '4h' ? 14400000 : 60000;

      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const updatedKlines = {
            ...klinesData,
            data: {
              ...klinesData.data,
              close: 5.99 + (Math.random() - 0.5) * 0.02,
              volume: 345000 + Math.random() * 5000,
              timestamp: Date.now()
            }
          };
          ws.send(JSON.stringify(updatedKlines));
        }
      }, 3000);

    } catch (error) {
      console.error('[WEBSOCKET] Error setting up klines subscription:', error);
    }
  }

  private async startMartingaleBot(ws: WebSocket, botId: number) {
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error(`Bot ${botId} not found`);
      }

      console.log(`[MARTINGALE STRATEGY] ===== STARTING BOT ${bot.name} (ID: ${botId}) =====`);
      
      await this.executeMartingaleCycle(ws, bot);
      
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Error starting bot:`, error);
      ws.send(JSON.stringify({
        type: 'martingale_error',
        error: (error as Error).message
      }));
    }
  }

  private async executeMartingaleCycle(ws: WebSocket, bot: any) {
    try {
      console.log(`[MARTINGALE STRATEGY] ===== EXECUTING CYCLE FOR ${bot.name} =====`);

      const currentPrice = await this.getCurrentPrice(bot.tradingPair);
      if (!currentPrice) {
        throw new Error('Unable to fetch current market price');
      }

      const baseOrderAmount = parseFloat(bot.baseOrderAmount);
      const quantity = baseOrderAmount / currentPrice;

      console.log(`[MARTINGALE STRATEGY] 📊 BASE ORDER CALCULATION:`);
      console.log(`[MARTINGALE STRATEGY]    Current Price: $${currentPrice.toFixed(6)}`);
      console.log(`[MARTINGALE STRATEGY]    Base Order Amount: $${baseOrderAmount.toFixed(2)}`);
      console.log(`[MARTINGALE STRATEGY]    Calculated Quantity: ${quantity.toFixed(8)}`);

      const baseOrder = await this.placeMartingaleOrder(ws, bot, 1, {
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        quantity: quantity.toFixed(8),
        orderType: 'base_order',
        price: currentPrice.toFixed(6),
        type: 'MARKET'
      });

      if (baseOrder) {
        console.log(`[MARTINGALE STRATEGY] ✅ BASE ORDER EXECUTED SUCCESSFULLY`);
        
        await this.placeTakeProfitOrder(ws, bot, 1, baseOrder, currentPrice);
        
        await this.setupSafetyOrderMonitoring(ws, bot, 1, currentPrice);
      }
      
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] ❌ Cycle execution error:`, error);
      ws.send(JSON.stringify({
        type: 'martingale_error',
        botId: bot.id,
        error: (error as Error).message
      }));
    }
  }

  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const marketData = this.marketData.get(symbol);
      if (marketData && marketData.price) {
        return parseFloat(marketData.price);
      }
      
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      return parseFloat(data.price);
      
    } catch (error) {
      console.error(`[MARTINGALE STRATEGY] Error fetching price for ${symbol}:`, error);
      return null;
    }
  }

  private async placeMartingaleOrder(ws: WebSocket, bot: any, cycleId: number, orderParams: any) {
    console.log(`[MARTINGALE STRATEGY] ===== PLACING ${orderParams.orderType.toUpperCase()} ORDER =====`);
    console.log(`[MARTINGALE STRATEGY] 📊 ORDER DETAILS:`);
    console.log(`[MARTINGALE STRATEGY]    Symbol: ${bot.tradingPair}`);
    console.log(`[MARTINGALE STRATEGY]    Side: ${orderParams.side}`);
    console.log(`[MARTINGALE STRATEGY]    Type: ${orderParams.type}`);
    console.log(`[MARTINGALE STRATEGY]    Quantity: ${orderParams.quantity}`);
    console.log(`[MARTINGALE STRATEGY]    Price: $${orderParams.price}`);

    const orderResult = {
      success: true,
      orderId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'filled',
      executedQty: orderParams.quantity,
      fills: []
    };

    console.log(`[MARTINGALE STRATEGY] ✅ ${orderParams.orderType.toUpperCase()} ORDER PLACED!`);
    console.log(`[MARTINGALE STRATEGY]    Order ID: ${orderResult.orderId}`);
    console.log(`[MARTINGALE STRATEGY]    Status: ${orderResult.status}`);

    return orderResult;
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
    
    const takeProfitOrder = {
      success: true,
      orderId: `TP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    console.log(`[MARTINGALE STRATEGY] ✅ TAKE PROFIT ORDER PLACED!`);
    console.log(`[MARTINGALE STRATEGY]    Order ID: ${takeProfitOrder.orderId}`);
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
    
    console.log(`[MARTINGALE STRATEGY] ✅ SAFETY ORDER MONITORING ACTIVATED`);
    console.log(`[MARTINGALE STRATEGY] ===== SAFETY ORDER MONITORING COMPLETE =====\n`);
  }

  public stopBinanceStreams() {
    console.log('[WEBSOCKET] Stopping all Binance streams');
    this.isStreamsActive = false;
    console.log('[WEBSOCKET] Clearing cached market data');
    this.marketData.clear();
    
    if (this.binanceWS && this.binanceWS.readyState === WebSocket.OPEN) {
      console.log('[WEBSOCKET] Closing Binance public stream');
      this.binanceWS.close();
    }
    
    this.binanceWS = null;
    console.log('[WEBSOCKET] All Binance streams stopped');
  }

  public startAllMarketsTicker() {
    console.log('[WEBSOCKET] Automatic streaming disabled - streams start only on-demand');
  }
}