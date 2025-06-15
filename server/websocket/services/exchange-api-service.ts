import { storage } from '../../storage';

interface ExchangeEndpoints {
  wsStreamEndpoint: string;
  wsApiEndpoint: string;
  restApiEndpoint: string;
  exchangeType: string;
  isTestnet: boolean;
}

export class ExchangeApiService {
  private endpointsCache = new Map<number, ExchangeEndpoints>();
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    console.log('[UNIFIED WS] [EXCHANGE API SERVICE] Initialized');
  }  /**
   * Get exchange endpoints for a specific exchange ID
   */
  async getExchangeEndpoints(exchangeId: number): Promise<ExchangeEndpoints | null> {
    // Check cache first
    const now = Date.now();
    if (this.endpointsCache.has(exchangeId) && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
      return this.endpointsCache.get(exchangeId) || null;
    }

    try {
      // Fetch from database
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange || !exchange.isActive) {
        console.error(`[EXCHANGE API SERVICE] Exchange ${exchangeId} not found or inactive`);
        return null;
      }

      const endpoints: ExchangeEndpoints = {
        wsStreamEndpoint: exchange.wsStreamEndpoint || '',
        wsApiEndpoint: exchange.wsApiEndpoint || '',
        restApiEndpoint: exchange.restApiEndpoint || '',
        exchangeType: exchange.exchangeType || 'binance',
        isTestnet: exchange.isTestnet || false
      };

      // Validate required endpoints
      if (!endpoints.wsStreamEndpoint || !endpoints.restApiEndpoint) {
        console.error(`[EXCHANGE API SERVICE] Exchange ${exchangeId} missing required endpoints`);
        return null;
      }

      // Cache the result
      this.endpointsCache.set(exchangeId, endpoints);
      this.lastCacheUpdate = now;

      console.log(`[EXCHANGE API SERVICE] Cached endpoints for exchange ${exchangeId}: ${endpoints.exchangeType} (testnet: ${endpoints.isTestnet})`);
      return endpoints;
    } catch (error) {
      console.error(`[EXCHANGE API SERVICE] Error fetching endpoints for exchange ${exchangeId}:`, error);
      return null;
    }
  }

  /**
   * Get the default exchange for a user (first active exchange)
   */
  async getDefaultExchangeForUser(userId: number): Promise<{ exchangeId: number, endpoints: ExchangeEndpoints } | null> {
    try {
      const exchanges = await storage.getExchangesByUserId(userId);
      const activeExchange = exchanges.find(ex => ex.isActive);
      
      if (!activeExchange) {
        console.error(`[EXCHANGE API SERVICE] No active exchanges found for user ${userId}`);
        return null;
      }

      const endpoints = await this.getExchangeEndpoints(activeExchange.id);
      if (!endpoints) {
        return null;
      }

      return {
        exchangeId: activeExchange.id,
        endpoints
      };
    } catch (error) {
      console.error(`[EXCHANGE API SERVICE] Error getting default exchange for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Clear cache for specific exchange or all exchanges
   */
  clearCache(exchangeId?: number): void {
    if (exchangeId) {
      this.endpointsCache.delete(exchangeId);
      console.log(`[EXCHANGE API SERVICE] Cleared cache for exchange ${exchangeId}`);
    } else {
      this.endpointsCache.clear();
      this.lastCacheUpdate = 0;
      console.log('[EXCHANGE API SERVICE] Cleared all cache');
    }
  }

  /**
   * Get WebSocket stream URL for specific exchange
   */
  async getWebSocketStreamUrl(exchangeId: number): Promise<string | null> {
    const endpoints = await this.getExchangeEndpoints(exchangeId);
    return endpoints ? endpoints.wsStreamEndpoint : null;
  }

  /**
   * Get REST API URL for specific exchange
   */
  async getRestApiUrl(exchangeId: number): Promise<string | null> {
    const endpoints = await this.getExchangeEndpoints(exchangeId);
    return endpoints ? endpoints.restApiEndpoint : null;
  }
}
