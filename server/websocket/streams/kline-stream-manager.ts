import WebSocket from 'ws';
import { KlineClient, KlineUpdate } from '../types';
import { ExchangeApiService } from '../services/exchange-api-service';
import { HistoricalKlinesService } from '../services/historical-klines-service';

export class KlineStreamManager {
  private klineClients = new Map<string, KlineClient>();
  private klineBinanceWs: WebSocket | null = null;
  private activeKlineSubscriptions = new Set<string>();
  private historicalData = new Map<string, Map<string, any[]>>();
  private exchangeApiService: ExchangeApiService;
  private historicalKlinesService: HistoricalKlinesService;
  private currentExchangeId: number = 1; // Default exchange ID

  constructor() {
    this.exchangeApiService = new ExchangeApiService();
    this.historicalKlinesService = new HistoricalKlinesService();
    console.log('[UNIFIED WS] [KLINE STREAM MANAGER] Initialized');
  }
  // Setup kline client
  async setupKlineClient(ws: WebSocket, clientId: string, symbol: string, interval: string, exchangeId: number = 1): Promise<void> {
    console.log(`[KLINE CLIENT] Setting up kline client ${clientId} for ${symbol} at ${interval} on exchange ${exchangeId}`);
    
    // Store exchange ID for this session
    this.currentExchangeId = exchangeId;
    
    // Remove existing client if it exists
    if (this.klineClients.has(clientId)) {
      const existingClient = this.klineClients.get(clientId)!;
      console.log(`[KLINE CLIENT] Removing existing client ${clientId} for ${existingClient.symbol} at ${existingClient.interval}`);
      this.klineClients.delete(clientId);
    }
    
    // Create new client
    const client: KlineClient = {
      ws,
      clientId,
      symbol: symbol.toUpperCase(),
      interval,
      isActive: true
    };
    
    console.log(`[KLINE CLIENT] Created new client ${clientId} for ${client.symbol} at ${client.interval}`);
    this.klineClients.set(clientId, client);
    
    // Ensure kline stream is running
    await this.ensureKlineStream(symbol, interval);
  }

  // Remove kline client
  removeClient(clientId: string): void {
    if (this.klineClients.has(clientId)) {
      const client = this.klineClients.get(clientId)!;
      console.log(`[KLINE CLIENT] Removing client ${clientId} for ${client.symbol} at ${client.interval}`);
      this.klineClients.delete(clientId);
      this.updateKlineSubscriptions();
    }
  }

  // Mark client as inactive
  deactivateClient(clientId: string): void {
    const client = this.klineClients.get(clientId);
    if (client) {
      console.log(`[KLINE CLIENT] Deactivating client ${clientId} for ${client.symbol} at ${client.interval}`);
      client.isActive = false;
      this.updateKlineSubscriptions();
    }
  }
  // Ensure kline stream is running
  private async ensureKlineStream(symbol: string, interval: string): Promise<void> {
    if (this.klineBinanceWs && this.klineBinanceWs.readyState === WebSocket.OPEN) {
      console.log(`[KLINE STREAM] Kline stream already active, updating subscriptions`);
      this.updateKlineSubscriptions();
      return;
    }

    try {
      console.log(`[UNIFIED WS] [KLINE STREAM] Starting kline stream for ${symbol} at ${interval} on exchange ${this.currentExchangeId}`);
        // Get the WebSocket URL from the exchange API service
      const wsUrl = await this.exchangeApiService.getWebSocketStreamUrl(this.currentExchangeId);
      
      if (!wsUrl) {
        throw new Error(`No WebSocket URL found for exchange ${this.currentExchangeId}`);
      }

      console.log(`[KLINE STREAM] Using WebSocket URL: ${wsUrl}`);
      this.klineBinanceWs = new WebSocket(wsUrl);
      
      this.klineBinanceWs.on('open', () => {
        console.log('[UNIFIED WS] [KLINE STREAM] Connected to exchange kline stream');
        this.updateKlineSubscriptions();
      });
      
      this.klineBinanceWs.on('message', (data) => {
        this.handleKlineMessage(data);
      });
      
      this.klineBinanceWs.on('close', () => {
        console.log('[KLINE STREAM] Disconnected from exchange kline stream');
        this.klineBinanceWs = null;
      });
      
      this.klineBinanceWs.on('error', (error) => {
        console.error('[KLINE STREAM] Error:', error);
        this.klineBinanceWs = null;
      });
    } catch (error) {
      console.error('[KLINE STREAM] Failed to start kline stream:', error);
      throw error;
    }
  }

  // Update kline subscriptions
  private updateKlineSubscriptions(): void {
    if (!this.klineBinanceWs || this.klineBinanceWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const currentlyNeeded = this.getActiveKlineStreams();
    const currentlyActive = new Set(this.activeKlineSubscriptions);

    console.log(`[KLINE STREAM] Currently needed streams: ${Array.from(currentlyNeeded).join(', ')}`);
    console.log(`[KLINE STREAM] Currently active on Binance: ${Array.from(currentlyActive).join(', ')}`);

    // Calculate streams to unsubscribe from
    const toUnsubscribe = Array.from(currentlyActive).filter(stream => !currentlyNeeded.has(stream));

    // Calculate streams to subscribe to
    const toSubscribe = Array.from(currentlyNeeded).filter(stream => !currentlyActive.has(stream));

    // Unsubscribe from old streams
    if (toUnsubscribe.length > 0) {
      console.log(`[KLINE STREAM] Unsubscribing from: ${toUnsubscribe.join(', ')}`);
      toUnsubscribe.forEach(stream => {
        const [symbol, intervalPart] = stream.split('@');
        const interval = intervalPart.replace('kline_', '');
        this.removeKlineSubscription(symbol.toUpperCase(), interval);
        this.activeKlineSubscriptions.delete(stream);
      });
    }

    // Subscribe to new streams
    if (toSubscribe.length > 0) {
      console.log(`[KLINE STREAM] Subscribing to: ${toSubscribe.join(', ')}`);
      
      const subscribeMessage = {
        method: 'SUBSCRIBE',
        params: toSubscribe,
        id: Date.now()
      };
      
      this.klineBinanceWs.send(JSON.stringify(subscribeMessage));
      toSubscribe.forEach(stream => this.activeKlineSubscriptions.add(stream));
    }

    // Close connection if no streams are needed
    if (currentlyNeeded.size === 0 && this.klineBinanceWs) {
      console.log('[KLINE STREAM] No streams needed, closing connection');
      this.klineBinanceWs.close();
      this.klineBinanceWs = null;
      this.activeKlineSubscriptions.clear();
    }
  }

  // Remove kline subscription
  private removeKlineSubscription(symbol: string, interval: string): void {
    if (!this.klineBinanceWs || this.klineBinanceWs.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const klineStream = `${symbol.toLowerCase()}@kline_${interval}`;
    const unsubscribeMessage = {
      method: 'UNSUBSCRIBE',
      params: [klineStream],
      id: Date.now()
    };
    
    this.klineBinanceWs.send(JSON.stringify(unsubscribeMessage));
  }

  // Get active kline streams
  private getActiveKlineStreams(): Set<string> {
    const activeStreams = new Set<string>();
    this.klineClients.forEach(client => {
      if (client.isActive) {
        const stream = `${client.symbol.toLowerCase()}@kline_${client.interval}`;
        activeStreams.add(stream);
      }
    });
    return activeStreams;
  }

  // Handle kline messages
  private handleKlineMessage(data: any): void {
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
        const klineUpdate: KlineUpdate = {
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

  // Broadcast to kline clients
  private broadcastToKlineClients(klineUpdate: KlineUpdate): void {
    let activeClientCount = 0;
    
    this.klineClients.forEach(client => {
      if (client.isActive && 
          client.symbol.toUpperCase() === klineUpdate.symbol.toUpperCase() && 
          client.interval === klineUpdate.interval) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'kline_update',
            data: klineUpdate
          }));
          activeClientCount++;
        } else {
          client.isActive = false;
        }
      }
    });
    
    if (activeClientCount > 0) {
      console.log(`[KLINE BROADCAST] Sent to ${activeClientCount} kline clients for ${klineUpdate.symbol} ${klineUpdate.interval}`);
    }
  }
  // Store historical kline data
  private storeHistoricalKlineData(klineUpdate: KlineUpdate): void {
    const key = `${klineUpdate.symbol}_${klineUpdate.interval}`;
    
    if (!this.historicalData.has(klineUpdate.symbol)) {
      this.historicalData.set(klineUpdate.symbol, new Map());
    }
    
    const symbolData = this.historicalData.get(klineUpdate.symbol)!;
    
    if (!symbolData.has(klineUpdate.interval)) {
      symbolData.set(klineUpdate.interval, []);
    }
    
    const intervalData = symbolData.get(klineUpdate.interval)!;
    
    // Find existing candle or add new one
    const existingIndex = intervalData.findIndex(k => k.openTime === klineUpdate.openTime);
    if (existingIndex !== -1) {
      intervalData[existingIndex] = klineUpdate;
    } else {
      intervalData.push(klineUpdate);
      // Keep only last 1000 candles
      if (intervalData.length > 1000) {
        intervalData.shift();
      }
    }
    
    // Sort by openTime to maintain order
    intervalData.sort((a, b) => a.openTime - b.openTime);
  }

  // Store multiple historical klines at once (bulk operation)
  private storeHistoricalKlinesBulk(klines: KlineUpdate[]): void {
    if (klines.length === 0) return;
    
    const symbol = klines[0].symbol;
    const interval = klines[0].interval;
    
    if (!this.historicalData.has(symbol)) {
      this.historicalData.set(symbol, new Map());
    }
    
    const symbolData = this.historicalData.get(symbol)!;
    
    if (!symbolData.has(interval)) {
      symbolData.set(interval, []);
    }
    
    const intervalData = symbolData.get(interval)!;
    
    // Add all klines
    klines.forEach(klineUpdate => {
      const existingIndex = intervalData.findIndex(k => k.openTime === klineUpdate.openTime);
      if (existingIndex !== -1) {
        intervalData[existingIndex] = klineUpdate;
      } else {
        intervalData.push(klineUpdate);
      }
    });
    
    // Sort by openTime to maintain order
    intervalData.sort((a, b) => a.openTime - b.openTime);
    
    // Keep only last 1000 candles
    if (intervalData.length > 1000) {
      intervalData.splice(0, intervalData.length - 1000);
    }
    
    console.log(`[KLINE STREAM] Stored ${klines.length} historical klines for ${symbol} ${interval}, total: ${intervalData.length}`);
  }
  // Send historical kline data
  async sendHistoricalKlineData(ws: WebSocket, symbol: string, interval: string): Promise<void> {
    try {
      // First try to get cached data from WebSocket stream
      const symbolData = this.historicalData.get(symbol.toUpperCase());
      let historicalKlines: any[] = [];
      
      if (symbolData) {
        const intervalData = symbolData.get(interval);
        if (intervalData && intervalData.length > 0) {
          historicalKlines = intervalData;
          console.log(`[KLINE STREAM] Using ${historicalKlines.length} cached klines for ${symbol} ${interval}`);
        }
      }
      
      // If no cached data or insufficient data, fetch from exchange REST API
      if (historicalKlines.length < 50) {
        console.log(`[KLINE STREAM] Fetching historical klines from exchange REST API for ${symbol} ${interval}`);
        
        try {
          const restKlines = await this.historicalKlinesService.getDefaultHistoricalKlines(
            this.currentExchangeId, 
            symbol, 
            interval
          );
          
          // Convert REST API format to our WebSocket format
          const convertedKlines = restKlines.map(kline => ({
            symbol: symbol.toUpperCase(),
            interval,
            openTime: kline.openTime,
            closeTime: kline.closeTime,
            open: parseFloat(kline.open),
            high: parseFloat(kline.high),
            low: parseFloat(kline.low),
            close: parseFloat(kline.close),
            volume: parseFloat(kline.volume),
            isFinal: true, // Historical klines are always final
            timestamp: Date.now()
          }));
          
          historicalKlines = convertedKlines;
          console.log(`[KLINE STREAM] Fetched ${historicalKlines.length} historical klines from REST API for ${symbol} ${interval}`);
          
          // Store in cache for future use
          this.storeHistoricalKlinesBulk(convertedKlines);
          
        } catch (error) {
          console.error(`[KLINE STREAM] Error fetching historical klines from REST API:`, error);
          // Fall back to cached data if available
          if (historicalKlines.length === 0) {
            console.log(`[KLINE STREAM] No historical data available for ${symbol} ${interval}`);
            return;
          }
        }
      }
      
      if (historicalKlines.length > 0) {
        console.log(`[KLINE STREAM] Sending ${historicalKlines.length} historical klines for ${symbol} ${interval}`);
        
        ws.send(JSON.stringify({
          type: 'historical_klines',
          data: {
            symbol: symbol.toUpperCase(),
            interval,
            klines: historicalKlines
          }
        }));
      }
    } catch (error) {
      console.error(`[KLINE STREAM] Error sending historical kline data:`, error);
    }
  }

  // Get active clients count
  getActiveClientsCount(): number {
    return Array.from(this.klineClients.values()).filter(client => client.isActive).length;
  }

  // Get active subscriptions count
  getActiveSubscriptionsCount(): number {
    return this.activeKlineSubscriptions.size;
  }
}
