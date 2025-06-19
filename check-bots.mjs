/**
 * Simple Bot Deletion Test
 * Tests the bot deletion functionality using proper imports
 */
import { storage } from './server/storage.js';

async function checkCurrentBots() {
  console.log('🧪 Checking Current Bot State...\n');
  
  try {
    const bots = await storage.getAllTradingBots();
    console.log(`Found ${bots.length} trading bots:`);
    
    for (const bot of bots) {
      console.log(`\n🤖 Bot ${bot.id}: ${bot.name}`);
      console.log(`   Status: ${bot.status} (Active: ${bot.isActive})`);
      console.log(`   Pair: ${bot.tradingPair}`);
      console.log(`   Strategy: ${bot.strategy}`);
      
      // Get related data
      const cycles = await storage.getBotCyclesByBotId(bot.id);
      const orders = await storage.getCycleOrdersByBotId(bot.id);
      const trades = await storage.getTradesByBotId(bot.id);
      const pendingOrders = await storage.getPendingCycleOrders(bot.id);
      
      console.log(`   📊 Data:`);
      console.log(`     - ${cycles.length} cycles`);
      console.log(`     - ${orders.length} total orders`);
      console.log(`     - ${pendingOrders.length} pending orders`);
      console.log(`     - ${trades.length} trades`);
      
      if (pendingOrders.length > 0) {
        console.log(`   🔍 Pending Orders:`);
        pendingOrders.forEach(order => {
          console.log(`     - Order ${order.id}: ${order.exchangeOrderId || 'No Exchange ID'} (${order.status})`);
        });
      }
    }
    
    if (bots.length === 0) {
      console.log('No bots found. Create a bot first to test deletion functionality.');
    }
      
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkCurrentBots();
