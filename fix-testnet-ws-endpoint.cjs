// Fix testnet WebSocket endpoint for exchange 4
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { exchanges } = require('./shared/schema.ts');
const { eq } = require('drizzle-orm');

const connectionString = 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja';

async function fixTestnetEndpoint() {
  const sql = postgres(connectionString);
  const db = drizzle(sql);
  
  try {
    console.log('=== CHECKING CURRENT EXCHANGE 4 CONFIG ===');
    const exchange4 = await db.select().from(exchanges).where(eq(exchanges.id, 4));
    
    if (exchange4.length > 0) {
      const ex = exchange4[0];
      console.log('Current configuration:');
      console.log(`- Name: ${ex.name}`);
      console.log(`- Testnet: ${ex.isTestnet}`);
      console.log(`- WS Stream Endpoint: ${ex.wsStreamEndpoint}`);
      console.log(`- REST API Endpoint: ${ex.restApiEndpoint}`);
      
      if (ex.isTestnet) {
        console.log('\n=== UPDATING TESTNET WEBSOCKET ENDPOINT ===');
          // Update with correct testnet WebSocket endpoint
        // According to frontend code, testnet stream endpoint is: wss://stream.testnet.binance.vision
        const correctWsStreamEndpoint = 'wss://stream.testnet.binance.vision';
        const correctWsApiEndpoint = 'wss://testnet.binance.vision/ws-api/v3';
          await db.update(exchanges)
          .set({ 
            wsStreamEndpoint: correctWsStreamEndpoint,
            wsApiEndpoint: correctWsApiEndpoint
          })
          .where(eq(exchanges.id, 4));
        
        console.log(`✅ Updated WebSocket stream endpoint to: ${correctWsStreamEndpoint}`);
        console.log(`✅ Updated WebSocket API endpoint to: ${correctWsApiEndpoint}`);
        
        // Verify the update
        const updatedExchange = await db.select().from(exchanges).where(eq(exchanges.id, 4));
        console.log('\n=== VERIFICATION ===');        console.log(`New WS Stream Endpoint: ${updatedExchange[0].wsStreamEndpoint}`);
        console.log(`New WS API Endpoint: ${updatedExchange[0].wsApiEndpoint}`);
      } else {
        console.log('Exchange 4 is not marked as testnet - no changes needed');
      }
    } else {
      console.log('❌ Exchange 4 not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

fixTestnetEndpoint();
