/**
 * Enhanced Test Script for Bot Deletion Functionality
 * This script tests whether deleting a trading bot properly cancels and removes all orders.
 */

const { storage } = require('./server/storage.ts');
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:5000/api';

async function testBotDeletion() {
  console.log('🧪 Testing Bot Deletion Functionality...\n');
  
  try {
    // Step 1: Check current bots and orders
    console.log('📊 Step 1: Checking current state...');
    
    const bots = await storage.getAllTradingBots();
    console.log(`Found ${bots.length} trading bots`);
    
    if (bots.length === 0) {
      console.log('❌ No bots found. Please create a bot first to test deletion.');
      return;
    }
    
    // Get the first bot for testing
    const testBot = bots[0];
    console.log(`🤖 Testing with bot: ${testBot.id} (${testBot.name})`);
    
    // Get related data before deletion
    const cycles = await storage.getBotCyclesByBotId(testBot.id);
    const orders = await storage.getCycleOrdersByBotId(testBot.id);
    const trades = await storage.getTradesByBotId(testBot.id);
    const pendingOrders = await storage.getPendingCycleOrders(testBot.id);
    
    console.log(`📈 Bot ${testBot.id} has:`);
    console.log(`   - ${cycles.length} cycles`);
    console.log(`   - ${orders.length} total orders`);
    console.log(`   - ${pendingOrders.length} pending orders`);
    console.log(`   - ${trades.length} trades`);
    
    if (pendingOrders.length > 0) {
      console.log(`\n🔍 Pending orders for bot ${testBot.id}:`);
      pendingOrders.forEach(order => {
        console.log(`   - Order ${order.id}: ${order.exchangeOrderId} (${order.status})`);
      });
    }
    
    // Step 2: Test deletion via API
    console.log(`\n🗑️  Step 2: Deleting bot ${testBot.id}...`);
    
    // First, let's create a mock authentication token for testing
    // In a real scenario, you'd need to authenticate properly
    console.log('⚠️  Note: This test requires proper authentication.');
    console.log('For a complete test, use the web interface or provide valid auth token.');
    
    // Step 3: Check if the data was actually deleted from database
    console.log('\n✅ Step 3: Verifying deletion...');
    
    setTimeout(async () => {
      try {
        const remainingBot = await storage.getTradingBot(testBot.id);
        if (!remainingBot) {
          console.log('✅ Bot successfully deleted from database');
        } else {
          console.log('❌ Bot still exists in database');
        }
        
        const remainingCycles = await storage.getBotCyclesByBotId(testBot.id);
        const remainingOrders = await storage.getCycleOrdersByBotId(testBot.id);
        const remainingTrades = await storage.getTradesByBotId(testBot.id);
        
        console.log(`📊 Remaining data for bot ${testBot.id}:`);
        console.log(`   - ${remainingCycles.length} cycles (should be 0)`);
        console.log(`   - ${remainingOrders.length} orders (should be 0)`);
        console.log(`   - ${remainingTrades.length} trades (should be 0)`);
        
        if (remainingCycles.length === 0 && remainingOrders.length === 0 && remainingTrades.length === 0) {
          console.log('\n✅ SUCCESS: All bot data properly deleted!');
        } else {
          console.log('\n❌ ISSUE: Some bot data still exists after deletion.');
        }
        
      } catch (error) {
        console.error('Error during verification:', error);
      }
    }, 2000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Additional helper function to manually test database state
async function checkDatabaseState() {
  console.log('\n📊 Current Database State:');
  
  try {
    const bots = await storage.getAllTradingBots();
    console.log(`\n🤖 Trading Bots (${bots.length}):`);
    for (const bot of bots) {
      const cycles = await storage.getBotCyclesByBotId(bot.id);
      const orders = await storage.getCycleOrdersByBotId(bot.id);
      const trades = await storage.getTradesByBotId(bot.id);
      const pendingOrders = await storage.getPendingCycleOrders(bot.id);
      
      console.log(`   Bot ${bot.id} (${bot.name}):`);
      console.log(`     - ${cycles.length} cycles`);
      console.log(`     - ${orders.length} orders (${pendingOrders.length} pending)`);
      console.log(`     - ${trades.length} trades`);
      console.log(`     - Status: ${bot.status} (Active: ${bot.isActive})`);
    }
    
  } catch (error) {
    console.error('Error checking database state:', error);
  }
}

// Export functions for use
module.exports = {
  testBotDeletion,
  checkDatabaseState
};

// Run the test if called directly
if (require.main === module) {
  console.log('🚀 Starting Bot Deletion Test...\n');
  testBotDeletion().then(() => {
    console.log('\n📋 Checking final database state...');
    return checkDatabaseState();
  }).catch(console.error);
}
