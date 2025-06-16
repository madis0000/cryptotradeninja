// Utility functions for balance calculations and conversions

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
 * Calculate total USDT value of all balances using current market prices
 * @param balances Array of balance objects from exchange
 * @param prices Array of current price data for each asset
 * @returns Total USDT value as string
 */
export const calculateTotalUsdtValue = async (
  balances: Balance[], 
  exchangeId: number
): Promise<string> => {
  if (!balances || balances.length === 0) {
    return '0.00';
  }

  let totalUsdtValue = 0;

  for (const balance of balances) {
    const totalBalance = parseFloat(balance.free || '0') + parseFloat(balance.locked || '0');
    
    if (totalBalance === 0) {
      continue; // Skip assets with zero balance
    }

    if (balance.asset === 'USDT') {
      // USDT is already in USDT, so add directly
      totalUsdtValue += totalBalance;
    } else {
      // For other assets, we need to get the current price
      try {
        const priceInUsdt = await getCurrentPrice(balance.asset, exchangeId);
        totalUsdtValue += totalBalance * priceInUsdt;
      } catch (error) {
        console.warn(`Failed to get price for ${balance.asset}:`, error);
        // Skip assets where we can't get price data
      }
    }
  }

  return totalUsdtValue.toFixed(2);
};

/**
 * Get current price of an asset in USDT
 * @param asset Asset symbol (e.g., 'BTC', 'ETH')
 * @param exchangeId Exchange ID to get price from
 * @returns Current price in USDT
 */
const getCurrentPrice = async (asset: string, exchangeId: number): Promise<number> => {
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
