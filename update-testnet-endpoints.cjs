/**
 * Updates all testnet exchange endpoints to the new Binance testnet URLs
 */
require('dotenv').config();
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { eq, and } = require('drizzle-orm');
const { pgTable, text, boolean, timestamp, serial, integer } = require('drizzle-orm/pg-core');

// Define the exchanges table schema
const exchanges = pgTable("exchanges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull(),
  apiSecret: text("api_secret").notNull(),
  encryptionIv: text("encryption_iv").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  wsApiEndpoint: text("ws_api_endpoint"),
  wsStreamEndpoint: text("ws_stream_endpoint"),
  restApiEndpoint: text("rest_api_endpoint"),
  exchangeType: text("exchange_type").default("binance"),
  isTestnet: boolean("is_testnet").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

async function updateTestnetEndpoints() {
  console.log('🔧 Updating Binance testnet endpoints to new URLs...\n');
  
  const newEndpoints = {
    restApiEndpoint: 'https://testnet.binance.vision',
    wsStreamEndpoint: 'wss://stream.binance.vision/ws',
    wsApiEndpoint: 'wss://ws-api.testnet.binance.vision/ws-api/v3'
  };
  
  console.log('📋 New testnet endpoints:');
  console.log(`   REST API: ${newEndpoints.restApiEndpoint}`);
  console.log(`   WS Stream: ${newEndpoints.wsStreamEndpoint}`);
  console.log(`   WS-API: ${newEndpoints.wsApiEndpoint}\n`);
  
  try {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja';
    const client = postgres(connectionString);
    const db = drizzle(client);

    // Find all testnet exchanges
    const testnetExchanges = await db.select().from(exchanges)
      .where(eq(exchanges.isTestnet, true));
    
    console.log(`Found ${testnetExchanges.length} testnet exchange(s)\n`);

    for (const exchange of testnetExchanges) {
      console.log(`📊 Updating: ${exchange.name} (ID: ${exchange.id})`);
      console.log(`   Current endpoints:`);
      console.log(`     REST: ${exchange.restApiEndpoint || 'not set'}`);
      console.log(`     Stream: ${exchange.wsStreamEndpoint || 'not set'}`);
      console.log(`     WS-API: ${exchange.wsApiEndpoint || 'not set'}`);
      
      // Update the endpoints
      await db.update(exchanges)
        .set(newEndpoints)
        .where(eq(exchanges.id, exchange.id));
      
      console.log(`   ✅ Updated to new endpoints\n`);
    }

    // Also update any exchange with "testnet" in the name, regardless of isTestnet flag
    const testnetNamedExchanges = await db.select().from(exchanges);
    
    for (const exchange of testnetNamedExchanges) {
      if (exchange.name.toLowerCase().includes('testnet') && !exchange.isTestnet) {
        console.log(`⚠️  Found exchange with "testnet" in name but isTestnet=false: ${exchange.name} (ID: ${exchange.id})`);
        console.log(`   Updating endpoints and setting isTestnet=true...`);
        
        await db.update(exchanges)
          .set({
            ...newEndpoints,
            isTestnet: true
          })
          .where(eq(exchanges.id, exchange.id));
        
        console.log(`   ✅ Fixed\n`);
      }
    }

    console.log('🎉 Testnet endpoint update completed!');
    
    // Show final status
    console.log('\n📋 Final testnet endpoints:');
    const updatedExchanges = await db.select().from(exchanges)
      .where(eq(exchanges.isTestnet, true));
    
    updatedExchanges.forEach(exchange => {
      console.log(`\n   ${exchange.name} (ID: ${exchange.id}):`);
      console.log(`     REST: ${exchange.restApiEndpoint}`);
      console.log(`     Stream: ${exchange.wsStreamEndpoint}`);
      console.log(`     WS-API: ${exchange.wsApiEndpoint}`);
    });

    await client.end();
  } catch (error) {
    console.error('❌ Error updating testnet endpoints:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  updateTestnetEndpoints();
}

module.exports = { updateTestnetEndpoints };
