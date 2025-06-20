// Debug Balance Calculation Test
import { calculateTotalUsdtValue } from '../client/src/utils/balance-utils.js';

// Mock balance data similar to what Binance would return
const mockBalances = [
  { asset: 'USDT', free: '1000.50', locked: '0.00' },
  { asset: 'BTC', free: '0.01', locked: '0.00' },
  { asset: 'ETH', free: '0.5', locked: '0.00' },
  { asset: 'BNB', free: '10.0', locked: '0.00' },
  { asset: 'ADA', free: '0.0', locked: '0.0' },
];

console.log('🧪 Testing balance calculation...');
console.log('📊 Mock balances:', mockBalances);

// Test the calculation
calculateTotalUsdtValue(mockBalances, 1)
  .then(totalValue => {
    console.log('✅ Balance calculation result:', totalValue);
  })
  .catch(error => {
    console.error('❌ Balance calculation failed:', error);
    console.error('Stack trace:', error.stack);
  });
