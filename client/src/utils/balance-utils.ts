// Utility functions for balance calculations and conversions
import { tickerPriceService } from '@/services/TickerPriceService';

interface Balance {
  asset: string;
  free: string;
  locked: string;
}

interface PriceData {
  symbol: string;
  price: string;
}

/**
 * Calculate total USDT value of all balances using WebSocket ticker prices
 * @param balances Array of balance objects from exchange
 * @param exchangeId Exchange ID (not used for WebSocket pricing but kept for compatibility)
 * @returns Total USDT value as string
 */
export const calculateTotalUsdtValue = async (
  balances: Balance[], 
  exchangeId?: number
): Promise<string> => {
  if (!balances || balances.length === 0) {
    return '0.00';
  }

  let totalUsdtValue = 0;

  // Filter balances to only include assets with non-zero balance
  const nonZeroBalances = balances.filter(balance => {
    const totalBalance = parseFloat(balance.free || '0') + parseFloat(balance.locked || '0');
    return totalBalance > 0;
  });

  console.log(`[BALANCE UTILS] Processing ${nonZeroBalances.length} assets with non-zero balance out of ${balances.length} total assets`);

  // Process USDT first (no price lookup needed)
  const usdtBalance = nonZeroBalances.find(balance => balance.asset === 'USDT');
  if (usdtBalance) {
    const totalBalance = parseFloat(usdtBalance.free || '0') + parseFloat(usdtBalance.locked || '0');
    totalUsdtValue += totalBalance;
    console.log(`[BALANCE UTILS] USDT balance: ${totalBalance}`);
  }

  // For major assets only, get prices from WebSocket ticker service
  const MAJOR_ASSETS = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'DOT', 'LINK', 'UNI', 'DOGE', 'AVAX'];
  
  const majorAssetBalances = nonZeroBalances.filter(balance => 
    MAJOR_ASSETS.includes(balance.asset) && balance.asset !== 'USDT'
  );

  console.log(`[BALANCE UTILS] Processing ${majorAssetBalances.length} major assets for price conversion using WebSocket ticker`);

  // Get current prices from ticker service
  const allPrices = tickerPriceService.getAllPrices();

  for (const balance of majorAssetBalances) {
    const totalBalance = parseFloat(balance.free || '0') + parseFloat(balance.locked || '0');
    
    try {
      const priceInUsdt = getCurrentPriceFromTicker(balance.asset);
      if (priceInUsdt && priceInUsdt > 0) {
        const assetUsdtValue = totalBalance * priceInUsdt;
        totalUsdtValue += assetUsdtValue;
        console.log(`[BALANCE UTILS] ${balance.asset}: ${totalBalance} × $${priceInUsdt} = $${assetUsdtValue.toFixed(2)} (from WebSocket)`);
      } else {
        console.warn(`[BALANCE UTILS] No WebSocket price available for ${balance.asset}, skipping`);
      }
    } catch (error) {
      console.warn(`[BALANCE UTILS] Failed to get price for ${balance.asset}:`, error);
      // Skip assets where we can't get price data
    }
  }

  console.log(`[BALANCE UTILS] Total USDT value: $${totalUsdtValue.toFixed(2)} (calculated using WebSocket prices)`);
  return totalUsdtValue.toFixed(2);
};

/**
 * Get current price of an asset in USDT from WebSocket ticker service
 * @param asset Asset symbol (e.g., 'BTC', 'ETH')
 * @returns Current price in USDT or null if not available
 */
const getCurrentPriceFromTicker = (asset: string): number | null => {
  return tickerPriceService.getCurrentPrice(asset);
};

/**
 * DEPRECATED: Get current price using REST API
 * This function is kept for fallback scenarios but should not be used
 * in normal operations to avoid excessive API calls
 */
const getCurrentPrice = async (asset: string, exchangeId: number): Promise<number> => {
  console.warn(`[BALANCE UTILS] DEPRECATED: Using REST API for price lookup of ${asset}. Consider using WebSocket ticker instead.`);
  
  const symbol = `${asset}USDT`;
  
  try {
    const response = await fetch(`/api/ticker/${symbol}?exchangeId=${exchangeId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch price for ${symbol}`);
    }
    
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    throw error;
  }
};

/**
 * Calculate USDT-only balance from balances array
 * @param balances Array of balance objects
 * @returns USDT balance as string
 */
export const calculateUsdtBalance = (balances: Balance[]): string => {
  const usdtBalance = balances.find(balance => balance.asset === 'USDT');
  if (usdtBalance) {
    return (parseFloat(usdtBalance.free || '0') + parseFloat(usdtBalance.locked || '0')).toFixed(2);
  }
  return '0.00';
};

/**
 * Calculate total free balances (not converted to USDT)
 * @param balances Array of balance objects
 * @returns Total free balance count as string
 */
export const calculateTotalFree = (balances: Balance[]): string => {
  const totalAssets = balances.filter(balance => parseFloat(balance.free || '0') > 0).length;
  return totalAssets.toString();
};

/**
 * Calculate total locked balances (not converted to USDT)
 * @param balances Array of balance objects  
 * @returns Total locked balance count as string
 */
export const calculateTotalLocked = (balances: Balance[]): string => {
  const totalAssets = balances.filter(balance => parseFloat(balance.locked || '0') > 0).length;
  return totalAssets.toString();
};

/**
 * Format balance for display
 * @param balance Balance value as string or number
 * @returns Formatted balance string
 */
export const formatBalance = (balance: string | number): string => {
  const num = typeof balance === 'string' ? parseFloat(balance) : balance;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};
