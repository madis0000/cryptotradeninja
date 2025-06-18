const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const { exchanges } = require('./server/db/schema');
const { eq } = require('drizzle-orm');

async function fixBinanceTestnetEndpoints() {
  console.log('🔧 Fixing Binance testnet WebSocket endpoints...');
  
  // Initialize database connection
  const sqlite = new Database('./database.db');
  const db = drizzle(sqlite);
  
  try {
    // Find Binance testnet exchange (exchange ID 4)
    const testnetExchange = await db.select().from(exchanges).where(eq(exchanges.id, 4)).get();
    
    if (!testnetExchange) {
      console.log('❌ Exchange ID 4 (Binance testnet) not found');
      return;
    }
    
    console.log('📊 Current exchange configuration:');
    console.log('- Name:', testnetExchange.name);
    console.log('- wsStreamEndpoint:', testnetExchange.wsStreamEndpoint);
    console.log('- wsApiEndpoint:', testnetExchange.wsApiEndpoint);
    console.log('- restApiEndpoint:', testnetExchange.restApiEndpoint);
    
    // Update with correct endpoints
    const correctEndpoints = {
      wsStreamEndpoint: 'wss://testnet.binance.vision/ws',  // Corrected URL
      wsApiEndpoint: 'wss://testnet.binance.vision/ws-api/v3',
      restApiEndpoint: 'https://testnet.binance.vision/api/v3'
    };
    
    console.log('🔄 Updating to correct endpoints:');
    console.log('- wsStreamEndpoint:', correctEndpoints.wsStreamEndpoint);
    console.log('- wsApiEndpoint:', correctEndpoints.wsApiEndpoint);
    console.log('- restApiEndpoint:', correctEndpoints.restApiEndpoint);
    
    // Update the exchange
    await db.update(exchanges)
      .set(correctEndpoints)
      .where(eq(exchanges.id, 4))
      .run();
    
    console.log('✅ Binance testnet endpoints updated successfully!');
    
    // Verify the update
    const updatedExchange = await db.select().from(exchanges).where(eq(exchanges.id, 4)).get();
    console.log('📋 Verification - Updated configuration:');
    console.log('- wsStreamEndpoint:', updatedExchange.wsStreamEndpoint);
    console.log('- wsApiEndpoint:', updatedExchange.wsApiEndpoint);
    console.log('- restApiEndpoint:', updatedExchange.restApiEndpoint);
    
  } catch (error) {
    console.error('❌ Error updating exchange endpoints:', error);
  } finally {
    sqlite.close();
  }
}

// Run the fix
fixBinanceTestnetEndpoints().catch(console.error);
