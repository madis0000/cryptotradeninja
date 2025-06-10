// Dynamic symbol filter utility for Binance exchange
export interface SymbolFilters {
  minQty: number;
  stepSize: number;
  qtyDecimals: number;
  priceDecimals: number;
  tickSize: number;
  baseAssetPrecision: number;
  quotePrecision: number;
}

class SymbolFilterService {
  private filtersCache = new Map<string, SymbolFilters>();

  // Calculate decimal places from step size
  private getDecimalPlaces(stepSize: number): number {
    const stepStr = stepSize.toString();
    if (stepStr.includes('.')) {
      return stepStr.split('.')[1].length;
    }
    return 0;
  }

  // Fetch dynamic symbol filters from Binance
  async fetchSymbolFilters(symbol: string, exchange: any): Promise<SymbolFilters> {
    const cacheKey = `${exchange.restApiEndpoint}-${symbol}`;
    
    if (this.filtersCache.has(cacheKey)) {
      return this.filtersCache.get(cacheKey)!;
    }

    try {
      console.log(`[SYMBOL FILTERS] Fetching filters for ${symbol} from ${exchange.name}`);
      
      const response = await fetch(`${exchange.restApiEndpoint}/api/v3/exchangeInfo?symbol=${symbol}`);
      const data = await response.json();
      
      if (data.symbols && data.symbols.length > 0) {
        const symbolInfo = data.symbols[0];
        const filters = symbolInfo.filters;
        
        // Extract LOT_SIZE filter for quantity
        const lotSizeFilter = filters.find((f: any) => f.filterType === 'LOT_SIZE');
        const minQty = parseFloat(lotSizeFilter?.minQty || '0.01');
        const stepSize = parseFloat(lotSizeFilter?.stepSize || '0.01');
        
        // Extract PRICE_FILTER for price
        const priceFilter = filters.find((f: any) => f.filterType === 'PRICE_FILTER');
        const tickSize = parseFloat(priceFilter?.tickSize || '0.01');
        
        // Calculate decimal places from step sizes
        const qtyDecimals = this.getDecimalPlaces(stepSize);
        const priceDecimals = this.getDecimalPlaces(tickSize);
        
        const symbolFilters: SymbolFilters = {
          minQty,
          stepSize,
          qtyDecimals,
          priceDecimals,
          tickSize,
          baseAssetPrecision: symbolInfo.baseAssetPrecision,
          quotePrecision: symbolInfo.quotePrecision
        };
        
        console.log(`[SYMBOL FILTERS] ${symbol} - MinQty: ${minQty}, StepSize: ${stepSize}, TickSize: ${tickSize}`);
        console.log(`[SYMBOL FILTERS] ${symbol} - QtyDecimals: ${qtyDecimals}, PriceDecimals: ${priceDecimals}`);
        
        this.filtersCache.set(cacheKey, symbolFilters);
        return symbolFilters;
      }
    } catch (error) {
      console.error(`[SYMBOL FILTERS] Error fetching filters for ${symbol}:`, error);
    }
    
    // Fallback to default values
    const defaultFilters: SymbolFilters = {
      minQty: 0.01,
      stepSize: 0.01,
      qtyDecimals: 2,
      priceDecimals: 4,
      tickSize: 0.01,
      baseAssetPrecision: 8,
      quotePrecision: 8
    };
    
    console.log(`[SYMBOL FILTERS] Using default filters for ${symbol}`);
    return defaultFilters;
  }

  // Adjust quantity according to LOT_SIZE filter
  adjustQuantity(rawQuantity: number, filters: SymbolFilters): number {
    // Round down to nearest step size
    let quantity = Math.floor(rawQuantity / filters.stepSize) * filters.stepSize;
    
    // Ensure minimum quantity is met
    if (quantity < filters.minQty) {
      quantity = filters.minQty;
    }
    
    // For symbols with 0 decimal places, ensure we return integers
    if (filters.qtyDecimals === 0) {
      return Math.floor(quantity);
    }
    
    // Round to appropriate decimal places
    return Math.round(quantity * Math.pow(10, filters.qtyDecimals)) / Math.pow(10, filters.qtyDecimals);
  }

  // Adjust price according to PRICE_FILTER
  adjustPrice(rawPrice: number, filters: SymbolFilters): number {
    // Round to nearest tick size
    const adjustedPrice = Math.round(rawPrice / filters.tickSize) * filters.tickSize;
    
    // Then round to the correct number of decimal places
    return Math.round(adjustedPrice * Math.pow(10, filters.priceDecimals)) / Math.pow(10, filters.priceDecimals);
  }
}

export const symbolFilterService = new SymbolFilterService();