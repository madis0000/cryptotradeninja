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
      
      if (ex.isTestnet) {        console.log('\n=== UPDATING TESTNET ENDPOINTS ===');
        // Update with correct testnet endpoints from Binance documentation (2025-04-01 changelog)
        // New endpoints as per https://developers.binance.com/docs/binance-spot-api-docs/testnet
        const correctWsStreamEndpoint = 'wss://stream.testnet.binance.vision/ws';
        const correctWsApiEndpoint = 'wss://ws-api.testnet.binance.vision/ws-api/v3';
        const correctRestApiEndpoint = 'https://testnet.binance.vision';
        
        await db.update(exchanges)
        .set({ 
          wsStreamEndpoint: correctWsStreamEndpoint,
          wsApiEndpoint: correctWsApiEndpoint,
          restApiEndpoint: correctRestApiEndpoint
        })
        .where(eq(exchanges.id, 4));        
        console.log(`✅ Updated WebSocket stream endpoint to: ${correctWsStreamEndpoint}`);
        console.log(`✅ Updated WebSocket API endpoint to: ${correctWsApiEndpoint}`);
        console.log(`✅ Updated REST API endpoint to: ${correctRestApiEndpoint}`);
        
        // Verify the update
        const updatedExchange = await db.select().from(exchanges).where(eq(exchanges.id, 4));
        console.log('\n=== VERIFICATION ===');
        console.log(`New WS Stream Endpoint: ${updatedExchange[0].wsStreamEndpoint}`);
        console.log(`New WS API Endpoint: ${updatedExchange[0].wsApiEndpoint}`);
        console.log(`New REST API Endpoint: ${updatedExchange[0].restApiEndpoint}`);
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
