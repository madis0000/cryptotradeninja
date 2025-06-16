/**
 * Test script to verify balance fetching functionality
 */
import { TradingOperationsManager } from './server/websocket/managers/trading-operations-manager.js';

console.log('🔧 Testing balance fetching functionality...\n');

async function testBalanceFetching() {
  try {
    const tradingOps = new TradingOperationsManager();
    
    console.log('Testing balance fetch for exchange ID 1...');
    
    // Test balance fetching
    const balanceResult = await tradingOps.getAccountBalance(1, 'USDT');
    
    console.log('✅ Balance fetch successful!');
    console.log('Result:', JSON.stringify(balanceResult, null, 2));
    
    if (balanceResult.data && balanceResult.data.balances) {
      console.log(`\n📊 Found ${balanceResult.data.balances.length} asset balances:`);
      balanceResult.data.balances.forEach(balance => {
        const free = parseFloat(balance.free || '0');
        const locked = parseFloat(balance.locked || '0');
        const total = free + locked;
        if (total > 0) {
          console.log(`  ${balance.asset}: ${total.toFixed(8)} (Free: ${free.toFixed(8)}, Locked: ${locked.toFixed(8)})`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Balance fetch failed:', error);
    
    if (error.message.includes('decrypt')) {
      console.log('\n💡 This appears to be an encryption issue. Try running the migration script first:');
      console.log('   node migrate-encryption.mjs');
    }
    
    process.exit(1);
  }
}

// Run test
testBalanceFetching().then(() => {
  console.log('\n🎉 Balance fetching test completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
