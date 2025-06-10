// Quick fix for Binance PRICE_FILTER errors
export async function getBinanceSymbolFilters(symbol: string, exchangeEndpoint: string) {
  try {
    console.log(`[BINANCE FILTERS] Fetching exchange info for ${symbol}...`);
    
    const response = await fetch(`${exchangeEndpoint}/api/v3/exchangeInfo?symbol=${symbol}`);
    const data = await response.json();
    
    if (data.symbols && data.symbols.length > 0) {
      const symbolInfo = data.symbols[0];
      const filters = symbolInfo.filters;
      
      // Extract LOT_SIZE filter
      const lotSizeFilter = filters.find((f: any) => f.filterType === 'LOT_SIZE');
      const minQty = parseFloat(lotSizeFilter?.minQty || '0.1');
      const stepSize = parseFloat(lotSizeFilter?.stepSize || '0.1');
      
      // Extract PRICE_FILTER
      const priceFilter = filters.find((f: any) => f.filterType === 'PRICE_FILTER');
      const tickSize = parseFloat(priceFilter?.tickSize || '0.001');
      
      const result = {
        symbol,
        minQty,
        stepSize,
        tickSize,
        qtyDecimals: getDecimalPlaces(stepSize),
        priceDecimals: getDecimalPlaces(tickSize)
      };
      
      console.log(`[BINANCE FILTERS] ${symbol}: MinQty=${minQty}, StepSize=${stepSize}, TickSize=${tickSize}`);
      console.log(`[BINANCE FILTERS] ${symbol}: QtyDecimals=${result.qtyDecimals}, PriceDecimals=${result.priceDecimals}`);
      
      return result;
    }
  } catch (error) {
    console.error(`[BINANCE FILTERS] Error fetching filters for ${symbol}:`, error);
  }
  
  // Fallback values
  return {
    symbol,
    minQty: 0.1,
    stepSize: 0.1,
    tickSize: 0.001,
    qtyDecimals: 1,
    priceDecimals: 3
  };
}

function getDecimalPlaces(value: number): number {
  const str = value.toString();
  if (str.includes('.')) {
    return str.split('.')[1].length;
  }
  return 0;
}

export function adjustPrice(price: number, tickSize: number, decimals: number): number {
  const adjusted = Math.round(price / tickSize) * tickSize;
  return Math.round(adjusted * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function adjustQuantity(quantity: number, stepSize: number, minQty: number, decimals: number): number {
  let adjusted = Math.floor(quantity / stepSize) * stepSize;
  
  if (adjusted < minQty) {
    adjusted = minQty;
  }
  
  if (decimals === 0) {
    return Math.floor(adjusted);
  }
  
  return Math.round(adjusted * Math.pow(10, decimals)) / Math.pow(10, decimals);
}