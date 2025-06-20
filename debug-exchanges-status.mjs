import { storage } from './server/storage.js';

console.log('🔍 Checking Exchange Status...');

async function checkExchanges() {
  try {
    const exchanges = await storage.getExchangesByUserId(1);
    
    console.log(`\n📊 Found ${exchanges.length} exchanges for user 1:`);
    
    exchanges.forEach(exchange => {
      console.log(`\n🏢 Exchange ${exchange.id}: ${exchange.name}`);
      console.log(`   Active: ${exchange.isActive ? '✅ Yes' : '❌ No'}`);
      console.log(`   Testnet: ${exchange.isTestnet ? '🧪 Yes' : '🔴 No'}`);
      console.log(`   Has API Key: ${exchange.apiKey ? '🔑 Yes' : '❌ No'}`);
      console.log(`   API Key Length: ${exchange.apiKey ? exchange.apiKey.length : 0} chars`);
      console.log(`   Has API Secret: ${exchange.apiSecret ? '🔑 Yes' : '❌ No'}`);
      console.log(`   API Secret Length: ${exchange.apiSecret ? exchange.apiSecret.length : 0} chars`);
      console.log(`   Has Encryption IV: ${exchange.encryptionIv ? '🔒 Yes' : '❌ No'}`);
      console.log(`   Created: ${exchange.createdAt}`);
    });
    
    // Check if any exchange is active and has credentials
    const activeExchanges = exchanges.filter(ex => ex.isActive && ex.apiKey && ex.apiSecret);
    console.log(`\n✅ ${activeExchanges.length} exchanges are active and have credentials`);
    
    if (activeExchanges.length === 0) {
      console.log('\n⚠️  WARNING: No active exchanges with complete credentials found!');
      console.log('   This would cause balance requests to fail.');
    }
    
  } catch (error) {
    console.error('❌ Error checking exchanges:', error);
  }
}

checkExchanges();
