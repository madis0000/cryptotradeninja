// Quick script to check exchanges and their status
import { storage } from './server/storage.js';

async function checkExchanges() {
  try {
    console.log('=== CHECKING ALL EXCHANGES ===');
    const exchanges = await storage.getAllExchanges();
    
    console.log(`Found ${exchanges.length} exchanges:`);
    exchanges.forEach(exchange => {
      console.log(`- Exchange ID: ${exchange.id}, Name: ${exchange.name}, Active: ${exchange.isActive}, Type: ${exchange.exchangeType}`);
      console.log(`  WS Stream: ${exchange.wsStreamEndpoint}`);
      console.log(`  REST API: ${exchange.restApiEndpoint}`);
      console.log(`  Testnet: ${exchange.isTestnet || false}`);
      console.log('---');
    });
    
    console.log('\n=== CHECKING BOTS ===');
    const bots = await storage.getAllBots();
    console.log(`Found ${bots.length} bots:`);
    bots.forEach(bot => {
      console.log(`- Bot ID: ${bot.id}, Name: ${bot.name}, Exchange: ${bot.exchangeId}, Active: ${bot.isActive}, Status: ${bot.status}`);
    });
    
    console.log('\n=== CHECKING SPECIFICALLY EXCHANGE ID 4 ===');
    try {
      const exchange4 = await storage.getExchange(4);
      if (exchange4) {
        console.log('Exchange 4 exists:', exchange4);
      } else {
        console.log('Exchange 4 does NOT exist');
      }
    } catch (error) {
      console.log('Error getting exchange 4:', error.message);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkExchanges();
