import { webSocketSingleton } from './WebSocketSingleton';

interface MarketData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  timestamp: number;
}

interface TickerPriceMap {
  [symbol: string]: number;
}

class TickerPriceService {
  private static instance: TickerPriceService;
  private prices: TickerPriceMap = {};
  private subscribers = new Set<(prices: TickerPriceMap) => void>();
  private isSubscribedToWebSocket = false;
  private requestedSymbols = new Set<string>();
  private unsubscribeFromWebSocket: (() => void) | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): TickerPriceService {
    if (!TickerPriceService.instance) {
      TickerPriceService.instance = new TickerPriceService();
    }
    return TickerPriceService.instance;
  }

  /**
   * Subscribe to price updates for specific symbols
   * @param symbols Array of symbols to subscribe to (e.g., ['BTC', 'ETH'])
   * @param callback Function to call when prices are updated
   * @returns Unsubscribe function
   */
  public subscribeToSymbols(symbols: string[], callback: (prices: TickerPriceMap) => void): () => void {
    // Add symbols to requested set (convert to USDT pairs)
    const usdtSymbols = symbols.map(symbol => 
      symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`
    );
    
    usdtSymbols.forEach(symbol => this.requestedSymbols.add(symbol));
    
    // Add callback to subscribers
    this.subscribers.add(callback);
    
    // Ensure WebSocket subscription is active
    this.ensureWebSocketSubscription();
    
    // Return current prices immediately if available
    if (Object.keys(this.prices).length > 0) {
      callback(this.prices);
    }
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
      // Remove symbols that are no longer needed
      usdtSymbols.forEach(symbol => {
        // Only remove if no other subscribers need this symbol
        const stillNeeded = Array.from(this.subscribers).some(() => 
          this.isSymbolStillNeeded(symbol)
        );
        if (!stillNeeded) {
          this.requestedSymbols.delete(symbol);
        }
      });
      
      // Update WebSocket subscription
      this.updateWebSocketSubscription();
    };
  }
  
  /**
   * Get current price for a specific symbol
   * @param symbol Symbol to get price for (e.g., 'BTC' or 'BTCUSDT')
   * @returns Current price or null if not available
   */
  public getCurrentPrice(symbol: string): number | null {
    const usdtSymbol = symbol.toUpperCase().endsWith('USDT') ? 
      symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
    return this.prices[usdtSymbol] || null;
  }
  
  /**
   * Get all current prices
   * @returns Object with all current prices
   */
  public getAllPrices(): TickerPriceMap {
    return { ...this.prices };
  }
  
  /**
   * Update price for a specific symbol
   * @param symbol Symbol to update price for (e.g., 'BTCUSDT')
   * @param price New price value
   */
  public updatePrice(symbol: string, price: number): void {
    const normalizedSymbol = symbol.toUpperCase();
    console.log(`[TICKER PRICE SERVICE] Updating price: ${normalizedSymbol} = $${price}`);
    
    // Update price in our cache
    this.prices[normalizedSymbol] = price;
    
    // Only notify subscribers if they're tracking this symbol
    if (this.requestedSymbols.has(normalizedSymbol)) {
      // Notify all subscribers
      this.subscribers.forEach(callback => {
        try {
          callback(this.prices);
        } catch (error) {
          console.error('[TICKER PRICE SERVICE] Error calling subscriber callback:', error);
        }
      });
    }
  }
  
  private isSymbolStillNeeded(symbol: string): boolean {
    // This is a simplified check - in a real implementation,
    // you might want to track which subscribers need which symbols
    return this.requestedSymbols.has(symbol);
  }  private ensureWebSocketSubscription(): void {
    if (this.isSubscribedToWebSocket) {
      // Already subscribed, just update the symbols we're interested in
      return;
    }
    
    console.log('[TICKER PRICE SERVICE] Setting up WebSocket subscription');
      // Subscribe to WebSocket messages - listen to all ticker messages
    const unsubscribe = webSocketSingleton.subscribe((message) => {
      if (message.type === 'market_update') {
        this.handleMarketUpdate(message.data);
      } else if (message.type === 'ticker_update') {
        this.handleTickerUpdate(message.data);
      }
    });
    
    // Store unsubscribe function for cleanup
    this.unsubscribeFromWebSocket = unsubscribe;
    
    // Ensure WebSocket is connected and add reference
    if (!webSocketSingleton.isConnected()) {
      console.log('[TICKER PRICE SERVICE] WebSocket not connected, adding reference');
      webSocketSingleton.addReference();
    }
    
    // The ticker stream is already established by the main WebSocket connection
    // We don't need to send separate subscribe_ticker messages
    console.log('[TICKER PRICE SERVICE] Listening to existing ticker stream for symbols:', Array.from(this.requestedSymbols));
    
    this.isSubscribedToWebSocket = true;
  }
  private updateWebSocketSubscription(): void {
    // Since we're listening to the existing ticker stream,
    // we don't need to send separate subscription messages
    // The ticker stream is already established by the main WebSocket connection
    const symbolsArray = Array.from(this.requestedSymbols);
    console.log('[TICKER PRICE SERVICE] Tracking symbols for price updates:', symbolsArray);
  }
    private handleMarketUpdate(data: MarketData): void {
    // Update price in our cache regardless of whether it's in requestedSymbols
    // This ensures we capture all price updates from the WebSocket
    console.log(`[TICKER PRICE SERVICE] Received price update: ${data.symbol} = $${data.price}`);
    
    // Update price in our cache
    this.prices[data.symbol] = data.price;
    
    // Only notify subscribers if they're tracking this symbol
    if (this.requestedSymbols.has(data.symbol)) {
      // Notify all subscribers
      this.subscribers.forEach(callback => {
        try {
          callback(this.prices);
        } catch (error) {
          console.error('[TICKER PRICE SERVICE] Error calling subscriber callback:', error);
        }
      });    }
  }

  private handleTickerUpdate(data: any): void {
    // Handle ticker_update messages from WebSocket
    if (data && data.symbol && data.price) {
      const price = typeof data.price === 'string' ? parseFloat(data.price) : data.price;
      console.log(`[TICKER PRICE SERVICE] Received ticker update: ${data.symbol} = $${price}`);
      
      // Update price in our cache
      this.prices[data.symbol] = price;
      
      // Only notify subscribers if they're tracking this symbol
      if (this.requestedSymbols.has(data.symbol)) {
        // Notify all subscribers
        this.subscribers.forEach(callback => {
          try {
            callback(this.prices);
          } catch (error) {
            console.error('[TICKER PRICE SERVICE] Error calling subscriber callback:', error);
          }
        });
      }
    }
  }  /**
   * Clear all cached prices and subscriptions
   */
  public reset(): void {
    this.prices = {};
    this.subscribers.clear();
    this.requestedSymbols.clear();
    if (this.unsubscribeFromWebSocket) {
      this.unsubscribeFromWebSocket();
      this.unsubscribeFromWebSocket = null;
    }
    this.isSubscribedToWebSocket = false;
    
    // Remove WebSocket reference when resetting
    console.log('[TICKER PRICE SERVICE] Removing WebSocket reference during reset');
    webSocketSingleton.removeReference();
  }
}

export const tickerPriceService = TickerPriceService.getInstance();
export type { MarketData, TickerPriceMap };
