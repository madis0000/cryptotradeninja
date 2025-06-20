import WebSocket from 'ws';
import { TickerClient, MarketUpdate } from '../types';
import { ExchangeApiService } from '../services/exchange-api-service';
import { broadcastManager } from '../services/broadcast-manager';

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
    
    // Create ticker channel in broadcast manager
    broadcastManager.createChannel('ticker_updates', 'ticker');
  }  // Setup ticker client
  async setupTickerClient(ws: WebSocket, clientId: string, symbols: string[], exchangeId: number = 1): Promise<void> {
    console.log(`[UNIFIED WS] [TICKER CLIENT] Setting up ticker client ${clientId} for symbols: ${symbols.join(', ')} on exchange ${exchangeId}`);
    
    // Store exchange ID for this session
    this.currentExchangeId = exchangeId;
    
    // Subscribe to broadcast manager with symbol filters
    const filters = symbols.length > 0 ? symbols.map(s => s.toUpperCase()) : undefined;
    broadcastManager.subscribe(clientId, ws, 'ticker_updates', filters);
    
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
    
    // Send current cached market data immediately to new client
    this.sendCurrentMarketData(ws, symbols);
    
    // Ensure ticker stream is running
    await this.ensureTickerStream();
  }
  // Remove ticker client
  removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      console.log(`[UNIFIED WS] [TICKER CLIENT] Removing client ${clientId}`);
      this.clients.delete(clientId);
      broadcastManager.unsubscribe(clientId, 'ticker_updates');
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
    }    // Determine the correct WebSocket URL based on the endpoint
    let wsUrl: string;    if (baseWsUrl.includes('testnet.binance.vision')) {
      // For testnet public streams, use wss://stream.testnet.binance.vision/ws
      wsUrl = 'wss://stream.testnet.binance.vision/ws';
    } else if (baseWsUrl.includes('stream.binance.com')) {
      // For mainnet public streams, use combined stream endpoint
      wsUrl = 'wss://stream.binance.com:9443/stream';
    } else {
      // Generic handling for other endpoints
      if (baseWsUrl.endsWith('/stream')) {
        wsUrl = baseWsUrl;
      } else {
        wsUrl = `${baseWsUrl}/stream`;
      }
    }
    
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
      
      // If this is a 404 error, clear the exchange API cache to force re-fetch of endpoints
      if (error.message && error.message.includes('404')) {
        console.log(`[TICKER STREAM] 404 error detected, clearing exchange ${this.currentExchangeId} cache`);
        this.exchangeApiService.clearCache(this.currentExchangeId);
      }
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
    }    // Close connection if no streams are needed - but add a small delay to avoid rapid reconnections
    if (currentlyNeeded.size === 0 && this.tickerBinanceWs) {
      console.log('[TICKER STREAM] No streams needed, scheduling connection close in 2 seconds...');
      // Use setTimeout to avoid immediate disconnection during page transitions
      setTimeout(() => {
        // Re-check if streams are still not needed
        const stillNeeded = this.getActiveTickerSymbols();
        if (stillNeeded.size === 0 && this.tickerBinanceWs) {
          console.log('[TICKER STREAM] Still no streams needed, closing connection');
          this.tickerBinanceWs.close();
          this.tickerBinanceWs = null;
          this.activeTickerSubscriptions.clear();
        } else {
          console.log('[TICKER STREAM] Streams now needed again, keeping connection open');
        }
      }, 2000); // 2 second delay to handle page transitions
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
    const activeSymbols = new Set<string>();    this.clients.forEach(client => {
      if (client.isActive) {
        client.symbols.forEach((symbol: string) => activeSymbols.add(symbol.toUpperCase()));
      }
    });
    return activeSymbols;
  }

  // Handle ticker messages
  private handleTickerMessage(data: any): void {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle different message formats
      let tickerData = null;
      
      if (message.stream && message.data) {
        tickerData = message.data;
      } else if (message.s && message.c) {
        tickerData = message;
      }
      
      if (tickerData && tickerData.s) {        const marketUpdate: MarketUpdate = {
          symbol: tickerData.s,
          price: tickerData.c,
          priceChange: tickerData.p,
          priceChangePercent: tickerData.P,
          volume: tickerData.v,
          quoteVolume: tickerData.q,
          highPrice: tickerData.h,
          lowPrice: tickerData.l,
          timestamp: Date.now()
        };
        
        // Cache the price
        this.cachedPrices.set(marketUpdate.symbol, marketUpdate);
        
        // Broadcast using the broadcast manager
        broadcastManager.broadcast('ticker_updates', {
          type: 'market_update',
          data: marketUpdate
        }, 'normal');
        
        console.log(`[TICKER STREAM] Broadcasted ${marketUpdate.symbol} update via broadcast manager`);
      }
    } catch (error) {
      console.error('[TICKER STREAM] Error processing ticker message:', error);
    }
  }  // Enhanced broadcast to ticker clients with performance optimization
  private broadcastToTickerClients(marketUpdate: MarketUpdate): void {
    // Cache the latest price
    this.cachedPrices.set(marketUpdate.symbol, marketUpdate);
    
    let activeClientCount = 0;
    
    // Create both market_update and ticker_update messages
    const marketUpdateMessage = JSON.stringify({
      type: 'market_update',
      data: marketUpdate
    });
    
    const tickerUpdateMessage = JSON.stringify({
      type: 'ticker_update',
      data: {
        symbol: marketUpdate.symbol,
        price: marketUpdate.price,
        priceChange: marketUpdate.priceChange,
        priceChangePercent: marketUpdate.priceChangePercent,
        volume: marketUpdate.volume,
        timestamp: new Date().toISOString()
      }
    });
    
    // Use Promise.allSettled for better performance with multiple clients
    const sendPromises: Promise<void>[] = [];
    
    this.clients.forEach(client => {
      if (client.isActive && client.symbols.has(marketUpdate.symbol.toUpperCase())) {
        if (client.ws.readyState === WebSocket.OPEN) {
          sendPromises.push(
            new Promise<void>((resolve, reject) => {
              try {
                // Send market_update (for compatibility with trading-bots page)
                client.ws.send(marketUpdateMessage);
                // Also send ticker_update (for my-bots and bot-details pages)
                client.ws.send(tickerUpdateMessage);
                activeClientCount++;
                resolve();
              } catch (error) {
                client.isActive = false;
                reject(error);
              }
            })
          );
        } else {
          client.isActive = false;
        }
      }
    });
    
    // Execute all sends in parallel for minimal latency
    if (sendPromises.length > 0) {
      Promise.allSettled(sendPromises).then(() => {
        if (activeClientCount > 0) {
          console.log(`[TICKER BROADCAST] ⚡ Sent market_update AND ticker_update to ${activeClientCount} ticker clients for ${marketUpdate.symbol}`);
        }
      });
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
    console.log(`[TICKER STREAM] Sending current market data for symbols: ${symbols.join(', ')}`);
    
    // Send cached market data immediately to new clients
    symbols.forEach(symbol => {
      const cachedData = this.cachedPrices.get(symbol.toUpperCase());
      if (cachedData && ws.readyState === WebSocket.OPEN) {
        try {
          // Send both market_update and ticker_update formats for compatibility
          const marketUpdateMessage = JSON.stringify({
            type: 'market_update',
            data: cachedData
          });
          
          const tickerUpdateMessage = JSON.stringify({
            type: 'ticker_update',
            data: {
              symbol: cachedData.symbol,
              price: cachedData.price,
              priceChange: cachedData.priceChange,
              priceChangePercent: cachedData.priceChangePercent,
              volume: cachedData.volume,
              timestamp: new Date().toISOString()
            }
          });
          
          ws.send(marketUpdateMessage);
          ws.send(tickerUpdateMessage);
          console.log(`[TICKER STREAM] Sent cached data for ${symbol}: $${cachedData.price}`);
        } catch (error) {
          console.error(`[TICKER STREAM] Error sending cached data for ${symbol}:`, error);
        }
      } else {
        console.log(`[TICKER STREAM] No cached data available for ${symbol}`);
      }
    });
  }
}
