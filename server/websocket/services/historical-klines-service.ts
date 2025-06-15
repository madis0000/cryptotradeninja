import { ExchangeApiService } from './exchange-api-service';

export interface HistoricalKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
}

export interface KlineParams {
  symbol: string;
  interval: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

export class HistoricalKlinesService {
  private exchangeApiService: ExchangeApiService;
  private cache = new Map<string, { data: HistoricalKline[], timestamp: number }>();
  private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor() {
    this.exchangeApiService = new ExchangeApiService();
    console.log('[HISTORICAL KLINES SERVICE] Initialized');
  }

  /**
   * Fetch historical klines from exchange REST API
   */
  async fetchHistoricalKlines(exchangeId: number, params: KlineParams): Promise<HistoricalKline[]> {
    const cacheKey = `${exchangeId}_${params.symbol}_${params.interval}_${params.limit || 500}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.log(`[HISTORICAL KLINES] Returning cached data for ${params.symbol} ${params.interval}`);
      return cached.data;
    }

    try {
      // Get exchange endpoints
      const endpoints = await this.exchangeApiService.getExchangeEndpoints(exchangeId);
      if (!endpoints) {
        throw new Error(`No endpoints found for exchange ${exchangeId}`);
      }

      // Build API URL for historical klines
      const baseUrl = endpoints.restApiEndpoint;
      const url = new URL('/api/v3/klines', baseUrl);
      
      // Add query parameters
      url.searchParams.set('symbol', params.symbol.toUpperCase());
      url.searchParams.set('interval', params.interval);
      url.searchParams.set('limit', (params.limit || 500).toString());
      
      if (params.startTime) {
        url.searchParams.set('startTime', params.startTime.toString());
      }
      if (params.endTime) {
        url.searchParams.set('endTime', params.endTime.toString());
      }

      console.log(`[HISTORICAL KLINES] Fetching historical klines from: ${url.toString()}`);

      // Fetch data from exchange API
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const rawData = await response.json();
      
      // Transform raw data to our format
      const klines: HistoricalKline[] = rawData.map((item: any[]) => ({
        openTime: parseInt(item[0]),
        open: item[1],
        high: item[2],
        low: item[3],
        close: item[4],
        volume: item[5],
        closeTime: parseInt(item[6]),
        quoteAssetVolume: item[7],
        numberOfTrades: parseInt(item[8]),
        takerBuyBaseAssetVolume: item[9],
        takerBuyQuoteAssetVolume: item[10]
      }));

      // Cache the result
      this.cache.set(cacheKey, {
        data: klines,
        timestamp: Date.now()
      });

      console.log(`[HISTORICAL KLINES] Fetched ${klines.length} klines for ${params.symbol} ${params.interval}`);
      return klines;

    } catch (error) {
      console.error(`[HISTORICAL KLINES] Error fetching historical klines:`, error);
      throw error;
    }
  }

  /**
   * Get default historical klines (last 500 candles)
   */
  async getDefaultHistoricalKlines(exchangeId: number, symbol: string, interval: string): Promise<HistoricalKline[]> {
    return this.fetchHistoricalKlines(exchangeId, {
      symbol,
      interval,
      limit: 500
    });
  }

  /**
   * Clear cache for specific symbol or all symbols
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      const keysToDelete = Array.from(this.cache.keys()).filter(key => 
        key.includes(`_${symbol.toUpperCase()}_`)
      );
      keysToDelete.forEach(key => this.cache.delete(key));
      console.log(`[HISTORICAL KLINES] Cleared cache for ${symbol}`);
    } else {
      this.cache.clear();
      console.log('[HISTORICAL KLINES] Cleared all cache');
    }
  }
}
