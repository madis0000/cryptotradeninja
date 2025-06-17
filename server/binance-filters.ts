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
  // Convert to avoid floating point precision issues
  const tickSizeStr = tickSize.toString();
  const tickDecimals = tickSizeStr.includes('.') ? tickSizeStr.split('.')[1].length : 0;
  const multiplier = Math.pow(10, Math.max(decimals, tickDecimals));
  
  const priceInt = Math.round(price * multiplier);
  const tickSizeInt = Math.round(tickSize * multiplier);
  
  const adjustedInt = Math.round(priceInt / tickSizeInt) * tickSizeInt;
  const adjusted = adjustedInt / multiplier;
  
  return Math.round(adjusted * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function adjustQuantity(quantity: number, stepSize: number, minQty: number, decimals: number): number {
  // Convert to avoid floating point precision issues
  const stepSizeStr = stepSize.toString();
  const stepDecimals = stepSizeStr.includes('.') ? stepSizeStr.split('.')[1].length : 0;
  const multiplier = Math.pow(10, Math.max(decimals, stepDecimals));
  
  const quantityInt = Math.round(quantity * multiplier);
  const stepSizeInt = Math.round(stepSize * multiplier);
  
  // Use floor to ensure we don't exceed the original quantity
  let adjustedInt = Math.floor(quantityInt / stepSizeInt) * stepSizeInt;
  let adjusted = adjustedInt / multiplier;
  
  // Ensure minimum quantity is met
  if (adjusted < minQty) {
    adjusted = minQty;
  }
  
  // Final precision adjustment
  return Math.round(adjusted * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// Enhanced filter compliance with better error handling
export function ensureFilterCompliance(
  quantity: number, 
  price: number, 
  filters: any
): { quantity: number; price: number; isValid: boolean; error?: string } {
  try {
    const adjustedPrice = adjustPrice(price, filters.tickSize, filters.priceDecimals);
    const adjustedQuantity = adjustQuantity(quantity, filters.stepSize, filters.minQty, filters.qtyDecimals);
    
    // Validate final values with better floating point handling
    const priceRemainder = Math.abs(adjustedPrice / filters.tickSize - Math.round(adjustedPrice / filters.tickSize));
    const qtyRemainder = Math.abs(adjustedQuantity / filters.stepSize - Math.round(adjustedQuantity / filters.stepSize));
    
    const priceValid = priceRemainder < 0.0000001;
    const qtyValid = adjustedQuantity >= filters.minQty && qtyRemainder < 0.0000001;
    
    if (!priceValid) {
      return {
        quantity: adjustedQuantity,
        price: adjustedPrice,
        isValid: false,
        error: `PRICE_FILTER: Price ${adjustedPrice} not compliant with tickSize ${filters.tickSize}`
      };
    }
    
    if (!qtyValid) {
      return {
        quantity: adjustedQuantity,
        price: adjustedPrice,
        isValid: false,
        error: `LOT_SIZE: Quantity ${adjustedQuantity} not compliant with stepSize ${filters.stepSize} or below minQty ${filters.minQty}`
      };
    }
    
    return {
      quantity: adjustedQuantity,
      price: adjustedPrice,
      isValid: true
    };
  } catch (error) {
    return {
      quantity,
      price,
      isValid: false,
      error: `Filter validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}