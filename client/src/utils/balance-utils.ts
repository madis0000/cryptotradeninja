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
 * Calculate total USDT value of all balances using WebSocket ticker prices with timeout fallback
 * @param balances Array of balance objects from exchange
 * @param exchangeId Exchange ID (not used for WebSocket pricing but kept for compatibility)
 * @param timeoutMs Timeout in milliseconds (default: 2000ms)
 * @returns Total USDT value as string
 */
export const calculateTotalUsdtValue = async (
  balances: Balance[], 
  exchangeId?: number,
  timeoutMs: number = 2000
): Promise<string> => {
  console.log(`[BALANCE UTILS] 🔄 Starting calculation for ${balances?.length || 0} balances with ${timeoutMs}ms timeout`);
  
  if (!balances || balances.length === 0) {
    console.log(`[BALANCE UTILS] ❌ No balances provided`);
    return '0.00';
  }

  // Create a timeout promise FIRST
  const timeoutPromise = new Promise<string>((resolve) => {
    setTimeout(() => {
      console.warn(`[BALANCE UTILS] ⏰ Calculation timed out after ${timeoutMs}ms, using USDT-only fallback`);
      const usdtOnly = calculateUsdtBalance(balances);
      console.log(`[BALANCE UTILS] 🔄 Timeout fallback to USDT-only: $${usdtOnly}`);
      resolve(usdtOnly);
    }, timeoutMs);
  });

  // Create a promise that resolves with the calculation
  const calculationPromise = new Promise<string>((resolve) => {
    console.log(`[BALANCE UTILS] 📊 Starting calculation promise...`);
    
    // Use setTimeout to ensure this runs asynchronously and doesn't block
    setTimeout(() => {
      try {
        let totalUsdtValue = 0;

        // Filter balances to only include assets with non-zero balance
        const nonZeroBalances = balances.filter(balance => {
          const totalBalance = parseFloat(balance.free || '0') + parseFloat(balance.locked || '0');
          return totalBalance > 0;
        });

        console.log(`[BALANCE UTILS] 📊 Processing ${nonZeroBalances.length} assets with non-zero balance out of ${balances.length} total assets`);

        // Process USDT first (no price lookup needed)
        const usdtBalance = nonZeroBalances.find(balance => balance.asset === 'USDT');
        if (usdtBalance) {
          const totalBalance = parseFloat(usdtBalance.free || '0') + parseFloat(usdtBalance.locked || '0');
          totalUsdtValue += totalBalance;
          console.log(`[BALANCE UTILS] 💵 USDT balance: ${totalBalance}`);
        } else {
          console.log(`[BALANCE UTILS] ⚠️ No USDT balance found`);
        }

        // For major assets only, get prices from WebSocket ticker service
        const MAJOR_ASSETS = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'DOT', 'LINK', 'UNI', 'DOGE', 'AVAX'];
        
        const majorAssetBalances = nonZeroBalances.filter(balance => 
          MAJOR_ASSETS.includes(balance.asset) && balance.asset !== 'USDT'
        );
        console.log(`[BALANCE UTILS] 🔍 Processing ${majorAssetBalances.length} major assets for price conversion using WebSocket ticker`);

        // Get current prices from ticker service
        const allPrices = tickerPriceService.getAllPrices();
        console.log(`[BALANCE UTILS] 📈 Available ticker prices:`, Object.keys(allPrices).length, 'symbols');

        // If no prices are available, return USDT-only balance immediately
        if (Object.keys(allPrices).length === 0) {
          console.log(`[BALANCE UTILS] ⚠️ No ticker prices available, returning USDT-only balance: $${totalUsdtValue.toFixed(2)}`);
          resolve(totalUsdtValue.toFixed(2));
          return;
        }

        for (const balance of majorAssetBalances) {
          const totalBalance = parseFloat(balance.free || '0') + parseFloat(balance.locked || '0');
          
          try {
            const priceInUsdt = getCurrentPriceFromTicker(balance.asset);
            console.log(`[BALANCE UTILS] 🔍 Price lookup for ${balance.asset}: ${priceInUsdt || 'not found'}`);
            
            if (priceInUsdt && priceInUsdt > 0) {
              const assetUsdtValue = totalBalance * priceInUsdt;
              totalUsdtValue += assetUsdtValue;
              console.log(`[BALANCE UTILS] ✅ ${balance.asset}: ${totalBalance} × $${priceInUsdt} = $${assetUsdtValue.toFixed(2)} (from WebSocket)`);
            } else {
              console.warn(`[BALANCE UTILS] ⚠️ No WebSocket price available for ${balance.asset}, skipping`);
            }
          } catch (error) {
            console.warn(`[BALANCE UTILS] ❌ Failed to get price for ${balance.asset}:`, error);
            // Skip assets where we can't get price data
          }
        }

        console.log(`[BALANCE UTILS] ✅ Total USDT value: $${totalUsdtValue.toFixed(2)} (calculated using WebSocket prices)`);
        resolve(totalUsdtValue.toFixed(2));
      } catch (error) {
        console.error(`[BALANCE UTILS] ❌ Error in calculation:`, error);
        // Fallback to USDT-only calculation
        const usdtOnly = calculateUsdtBalance(balances);
        console.log(`[BALANCE UTILS] 🔄 Fallback to USDT-only: $${usdtOnly}`);
        resolve(usdtOnly);
      }
    }, 10); // Small delay to ensure async execution
  });

  // Race between calculation and timeout
  console.log(`[BALANCE UTILS] 🏁 Starting Promise.race with ${timeoutMs}ms timeout...`);
  const result = await Promise.race([calculationPromise, timeoutPromise]);
  console.log(`[BALANCE UTILS] 🏁 Promise.race completed with result: $${result}`);
  return result;
};

/**
 * Get current price of an asset in USDT from WebSocket ticker service
 * @param asset Asset symbol (e.g., 'BTC', 'ETH')
 * @returns Current price in USDT or null if not available
 */
const getCurrentPriceFromTicker = (asset: string): number | null => {
  try {
    const price = tickerPriceService.getCurrentPrice(asset);
    console.log(`[BALANCE UTILS] 🔍 getCurrentPriceFromTicker(${asset}): ${price}`);
    return price;
  } catch (error) {
    console.error(`[BALANCE UTILS] ❌ Error getting price for ${asset}:`, error);
    return null;
  }
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
 * Calculate total USDT value synchronously with basic fallbacks
 * This provides immediate results without waiting for price data
 * @param balances Array of balance objects
 * @returns Total USDT value as string (USDT-only if no prices available)
 */
export const calculateTotalUsdtValueSync = (balances: Balance[]): string => {
  console.log(`[BALANCE UTILS] 🔄 Synchronous calculation for ${balances?.length || 0} balances`);
  
  if (!balances || balances.length === 0) {
    return '0.00';
  }

  let totalUsdtValue = 0;

  // Filter balances to only include assets with non-zero balance
  const nonZeroBalances = balances.filter(balance => {
    const totalBalance = parseFloat(balance.free || '0') + parseFloat(balance.locked || '0');
    return totalBalance > 0;
  });

  // Process USDT first (no price lookup needed)
  const usdtBalance = nonZeroBalances.find(balance => balance.asset === 'USDT');
  if (usdtBalance) {
    const totalBalance = parseFloat(usdtBalance.free || '0') + parseFloat(usdtBalance.locked || '0');
    totalUsdtValue += totalBalance;
    console.log(`[BALANCE UTILS] 💵 USDT balance: ${totalBalance}`);
  }

  // Try to get prices synchronously from ticker service
  const allPrices = tickerPriceService.getAllPrices();
  
  if (Object.keys(allPrices).length === 0) {
    console.log(`[BALANCE UTILS] ⚠️ No ticker prices available for sync calculation, returning USDT-only: $${totalUsdtValue.toFixed(2)}`);
    return totalUsdtValue.toFixed(2);
  }

  // For major assets only, add their values if prices are available
  const MAJOR_ASSETS = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'DOT', 'LINK', 'UNI', 'DOGE', 'AVAX'];
  
  const majorAssetBalances = nonZeroBalances.filter(balance => 
    MAJOR_ASSETS.includes(balance.asset) && balance.asset !== 'USDT'
  );

  for (const balance of majorAssetBalances) {
    const totalBalance = parseFloat(balance.free || '0') + parseFloat(balance.locked || '0');
    
    try {
      const priceInUsdt = getCurrentPriceFromTicker(balance.asset);
      
      if (priceInUsdt && priceInUsdt > 0) {
        const assetUsdtValue = totalBalance * priceInUsdt;
        totalUsdtValue += assetUsdtValue;
        console.log(`[BALANCE UTILS] ✅ ${balance.asset}: ${totalBalance} × $${priceInUsdt} = $${assetUsdtValue.toFixed(2)} (sync)`);
      }
    } catch (error) {
      // Skip assets where we can't get price data
      console.warn(`[BALANCE UTILS] ⚠️ Skipping ${balance.asset} in sync calculation`);
    }
  }

  console.log(`[BALANCE UTILS] ✅ Sync total USDT value: $${totalUsdtValue.toFixed(2)}`);
  return totalUsdtValue.toFixed(2);
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
