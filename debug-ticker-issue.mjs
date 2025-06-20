#!/usr/bin/env node

import { storage } from './server/storage.ts';

async function debugTickerIssue() {
  console.log('🔍 Debugging Ticker Broadcasting Issue...\n');
  
  try {
    // Check what exchanges are configured
    const exchanges = await storage.getAllExchanges();
    console.log(`📊 Found ${exchanges.length} exchanges:`);
    
    exchanges.forEach(exchange => {
      console.log(`   - Exchange ${exchange.id}: ${exchange.name} (Active: ${exchange.isActive})`);
      console.log(`     REST URL: ${exchange.restUrl}`);
      console.log(`     WS URL: ${exchange.wsUrl}`);
      console.log(`     Testnet: ${exchange.isTestnet}`);
      console.log('');
    });
    
    // Check if there are any active bots that would need ticker data
    const bots = await storage.getAllTradingBots();
    console.log(`🤖 Found ${bots.length} trading bots:`);
    
    bots.forEach(bot => {
      console.log(`   - Bot ${bot.id}: ${bot.name} (${bot.tradingPair}) - Exchange ${bot.exchangeId} - Active: ${bot.isActive}`);
    });
    
    // Check for active exchanges
    const activeExchanges = exchanges.filter(ex => ex.isActive);
    console.log(`\n✅ Active exchanges: ${activeExchanges.length}`);
    
    if (activeExchanges.length === 0) {
      console.log('❌ No active exchanges found! This would cause ticker subscription failures.');
    } else {
      console.log('Active exchanges have WebSocket URLs:');
      activeExchanges.forEach(ex => {
        console.log(`   - Exchange ${ex.id}: ${ex.wsUrl ? 'YES' : 'NO'}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugTickerIssue().then(() => process.exit(0));
