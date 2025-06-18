import WebSocket from 'ws';
import { TickerClient, MarketUpdate } from '../types';
import { ExchangeApiService } from '../services/exchange-api-service';

export class TickerStreamManager {
  private clients: Map<string, TickerClient> = new Map();
  private cachedPrices: Map<string, MarketUpdate> = new Map();
  private tickerBinanceWs: WebSocket | null = null;
  private activeTickerSubscriptions = new Set<string>();
  private exchangeApiService: ExchangeApiService;
  private currentExchangeId: number = 1; // Default exchange ID

  constructor() {
    this.exchangeApiService = new ExchangeApiService();
    console.log('[UNIFIED WS] [TICKER STREAM MANAGER] Initialized');
  }  // Setup ticker client
  async setupTickerClient(ws: WebSocket, clientId: string, symbols: string[], exchangeId: number = 1): Promise<void> {
    console.log(`[UNIFIED WS] [TICKER CLIENT] Setting up ticker client ${clientId} for symbols: ${symbols.join(', ')} on exchange ${exchangeId}`);
    
    // Store exchange ID for this session
    this.currentExchangeId = exchangeId;
    
    // Remove existing client if it exists
    if (this.clients.has(clientId)) {
      const existingClient = this.clients.get(clientId)!;
      console.log(`[UNIFIED WS] [TICKER CLIENT] Removing existing client ${clientId} with symbols: ${Array.from(existingClient.symbols).join(', ')}`);
      this.clients.delete(clientId);
    }
    
    // Create new client
    const client: TickerClient = {
      ws,
      clientId,
      symbols: new Set(symbols.map(s => s.toUpperCase())),
      isActive: true
    };
    
    console.log(`[UNIFIED WS] [TICKER CLIENT] Created new client ${clientId} with symbols: ${Array.from(client.symbols).join(', ')}`);
    this.clients.set(clientId, client);
    
    // Ensure ticker stream is running
    await this.ensureTickerStream();
  }
  // Remove ticker client
  removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      console.log(`[UNIFIED WS] [TICKER CLIENT] Removing client ${clientId}`);
      this.clients.delete(clientId);
      this.updateTickerSubscriptions();
    }
  }

  // Mark client as inactive
  deactivateClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`[TICKER CLIENT] Deactivating client ${clientId}`);
      client.isActive = false;
      this.updateTickerSubscriptions();
    }
  }  // Ensure ticker stream is running
  private async ensureTickerStream(): Promise<void> {
    if (this.tickerBinanceWs && this.tickerBinanceWs.readyState === WebSocket.OPEN) {
      console.log('[UNIFIED WS] [TICKER STREAM] Ticker stream already active, updating subscriptions');
      this.updateTickerSubscriptions();
      return;
    }

    console.log('[UNIFIED WS] [TICKER STREAM] Starting ticker stream');
    
    // Get WebSocket URL from exchange configuration
    const baseWsUrl = await this.exchangeApiService.getWebSocketStreamUrl(this.currentExchangeId);
    if (!baseWsUrl) {
      console.error(`[TICKER STREAM] No WebSocket URL found for exchange ${this.currentExchangeId}`);
      return;
    }

    // Use combined stream endpoint for multiple ticker subscriptions
    // According to Binance docs: /stream?streams=<streamName1>/<streamName2>
    const wsUrl = `${baseWsUrl}/stream`;
    
    console.log(`[TICKER STREAM] Connecting to: ${wsUrl}`);
    this.tickerBinanceWs = new WebSocket(wsUrl);
    
    this.tickerBinanceWs.on('open', () => {
      console.log(`[UNIFIED WS] [TICKER STREAM] Connected to exchange ${this.currentExchangeId} ticker stream`);
      this.updateTickerSubscriptions();
    });
    
    this.tickerBinanceWs.on('message', (data) => {
      this.handleTickerMessage(data);
    });
    
    this.tickerBinanceWs.on('close', () => {
      console.log(`[UNIFIED WS] [TICKER STREAM] Disconnected from exchange ${this.currentExchangeId} ticker stream`);
      this.tickerBinanceWs = null;
    });
    
    this.tickerBinanceWs.on('error', (error) => {
      console.error('[UNIFIED WS] [TICKER STREAM] Error:', error);
      this.tickerBinanceWs = null;
    });
  }

  // Update ticker subscriptions
  private updateTickerSubscriptions(): void {
    if (!this.tickerBinanceWs || this.tickerBinanceWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const currentlyNeeded = this.getActiveTickerSymbols();
    const currentlyActive = new Set(this.activeTickerSubscriptions);

    console.log(`[TICKER STREAM] Currently needed symbols: ${Array.from(currentlyNeeded).join(', ')}`);
    console.log(`[TICKER STREAM] Currently active on Binance: ${Array.from(currentlyActive).join(', ')}`);

    // Calculate streams to unsubscribe from
    const toUnsubscribe = Array.from(currentlyActive).filter(stream => {
      const symbol = stream.replace('@ticker', '').toUpperCase();
      return !currentlyNeeded.has(symbol);
    });

    // Calculate streams to subscribe to
    const toSubscribe = Array.from(currentlyNeeded).filter(symbol => {
      const stream = `${symbol.toLowerCase()}@ticker`;
      return !currentlyActive.has(stream);
    });

    // Unsubscribe from old streams
    if (toUnsubscribe.length > 0) {
      console.log(`[TICKER STREAM] Unsubscribing from: ${toUnsubscribe.join(', ')}`);
      this.removeTickerSubscriptions(toUnsubscribe.map(stream => stream.replace('@ticker', '').toUpperCase()));
      toUnsubscribe.forEach(stream => this.activeTickerSubscriptions.delete(stream));
    }

    // Subscribe to new streams
    if (toSubscribe.length > 0) {
      const tickerStreams = toSubscribe.map(symbol => `${symbol.toLowerCase()}@ticker`);
      console.log(`[TICKER STREAM] Subscribing to: ${tickerStreams.join(', ')}`);
      
      const subscribeMessage = {
        method: 'SUBSCRIBE',
        params: tickerStreams,
        id: Date.now()
      };
      
      this.tickerBinanceWs.send(JSON.stringify(subscribeMessage));
      tickerStreams.forEach(stream => this.activeTickerSubscriptions.add(stream));
    }

    // Close connection if no streams are needed
    if (currentlyNeeded.size === 0 && this.tickerBinanceWs) {
      console.log('[TICKER STREAM] No streams needed, closing connection');
      this.tickerBinanceWs.close();
      this.tickerBinanceWs = null;
      this.activeTickerSubscriptions.clear();
    }
  }

  // Remove ticker subscriptions
  private removeTickerSubscriptions(symbols: string[]): void {
    if (!this.tickerBinanceWs || this.tickerBinanceWs.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const tickerStreams = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`);
    const unsubscribeMessage = {
      method: 'UNSUBSCRIBE',
      params: tickerStreams,
      id: Date.now()
    };
    
    this.tickerBinanceWs.send(JSON.stringify(unsubscribeMessage));
  }

  // Get active ticker symbols
  private getActiveTickerSymbols(): Set<string> {
    const activeSymbols = new Set<string>();
    this.clients.forEach(client => {
      if (client.isActive) {
        client.symbols.forEach(symbol => activeSymbols.add(symbol.toUpperCase()));
      }
    });
    return activeSymbols;
  }

  // Handle ticker messages
  private handleTickerMessage(data: any): void {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.result !== undefined && message.id !== undefined) {
        console.log('[TICKER STREAM] Subscription confirmation');
        return;
      }
      
      if (message.e === '24hrTicker' || (message.stream && message.data && message.data.e === '24hrTicker')) {
        const tickerData = message.data || message;
        
        const marketUpdate: MarketUpdate = {
          symbol: tickerData.s,
          price: parseFloat(tickerData.c),
          priceChange: parseFloat(tickerData.P),
          priceChangePercent: parseFloat(tickerData.P),
          highPrice: parseFloat(tickerData.h),
          lowPrice: parseFloat(tickerData.l),
          volume: parseFloat(tickerData.v),
          quoteVolume: parseFloat(tickerData.q),
          timestamp: Date.now()
        };
        
        console.log(`[TICKER STREAM] Market update: ${marketUpdate.symbol} = $${marketUpdate.price.toFixed(8)}`);
        this.broadcastToTickerClients(marketUpdate);
      }
    } catch (error) {
      console.error('[TICKER STREAM] Error processing message:', error);
    }
  }

  // Broadcast to ticker clients
  private broadcastToTickerClients(marketUpdate: MarketUpdate): void {
    // Cache the latest price
    this.cachedPrices.set(marketUpdate.symbol, marketUpdate);
    
    let activeClientCount = 0;
    
    this.clients.forEach(client => {
      if (client.isActive && client.symbols.has(marketUpdate.symbol.toUpperCase())) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'market_update',
            data: marketUpdate
          }));
          activeClientCount++;
        } else {
          client.isActive = false;
        }
      }
    });
    
    if (activeClientCount > 0) {
      console.log(`[TICKER BROADCAST] Sent to ${activeClientCount} ticker clients for ${marketUpdate.symbol}`);
    }
  }

  // Get ticker clients count
  getActiveClientsCount(): number {
    return Array.from(this.clients.values()).filter(client => client.isActive).length;
  }

  // Get active subscriptions count
  getActiveSubscriptionsCount(): number {
    return this.activeTickerSubscriptions.size;
  }

  // Send current market data to specific client
  sendCurrentMarketData(ws: WebSocket, symbols: string[]): void {
    // This would typically retrieve and send current market data
    // Implementation depends on your data storage strategy
    console.log(`[TICKER STREAM] Sending current market data for symbols: ${symbols.join(', ')}`);
  }
}
