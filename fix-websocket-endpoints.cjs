// Fix WebSocket endpoints for both testnet and live Binance exchanges
// This script will update the WebSocket URLs to the correct format

require('dotenv').config();
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { eq } = require('drizzle-orm');
const { pgTable, text, boolean, timestamp, serial, integer } = require('drizzle-orm/pg-core');

// Define the exchanges table schema inline
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

async function fixWebSocketEndpoints() {
  console.log('🔧 Fixing WebSocket endpoints for Binance exchanges...');
  
  try {    // Database connection
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja';
    console.log(`Using database: ${connectionString.replace(/:[^:]*@/, ':***@')}`);
    const client = postgres(connectionString);
    const db = drizzle(client);

    // Get all exchanges
    const allExchanges = await db.select().from(exchanges);
    console.log(`Found ${allExchanges.length} exchanges`);

    for (const exchange of allExchanges) {
      console.log(`\n📊 Processing: ${exchange.name} (ID: ${exchange.id})`);
      console.log(`   Current wsStreamEndpoint: ${exchange.wsStreamEndpoint}`);
      console.log(`   isTestnet: ${exchange.isTestnet}`);

      let newWsStreamEndpoint = exchange.wsStreamEndpoint;
      let needsUpdate = false;

      // Fix testnet endpoints
      if (exchange.isTestnet || exchange.name.toLowerCase().includes('testnet')) {
        let needsWsStreamUpdate = false;
        let needsWsApiUpdate = false;
        let needsRestApiUpdate = false;

        // Check and fix wsStreamEndpoint
        if (exchange.wsStreamEndpoint !== 'wss://stream.binance.vision/ws') {
          newWsStreamEndpoint = 'wss://stream.binance.vision/ws';
          needsWsStreamUpdate = true;
          console.log(`   ✅ Fixing testnet wsStreamEndpoint to: ${newWsStreamEndpoint}`);
        }

        // Check and fix wsApiEndpoint
        if (exchange.wsApiEndpoint !== 'wss://ws-api.testnet.binance.vision/ws-api/v3') {
          await db.update(exchanges)
            .set({ wsApiEndpoint: 'wss://ws-api.testnet.binance.vision/ws-api/v3' })
            .where(eq(exchanges.id, exchange.id));
          console.log(`   ✅ Fixed testnet wsApiEndpoint`);
        }

        // Check and fix restApiEndpoint
        if (exchange.restApiEndpoint !== 'https://testnet.binance.vision') {
          await db.update(exchanges)
            .set({ restApiEndpoint: 'https://testnet.binance.vision' })
            .where(eq(exchanges.id, exchange.id));
          console.log(`   ✅ Fixed testnet restApiEndpoint`);
        }

        needsUpdate = needsWsStreamUpdate;
      }
      // Fix live endpoints
      else if (exchange.exchangeType === 'binance') {
        if (exchange.wsStreamEndpoint !== 'wss://stream.binance.com:9443') {
          newWsStreamEndpoint = 'wss://stream.binance.com:9443';
          needsUpdate = true;
          console.log(`   ✅ Fixing live endpoint to: ${newWsStreamEndpoint}`);
        }
      }

      if (needsUpdate) {
        await db.update(exchanges)
          .set({ wsStreamEndpoint: newWsStreamEndpoint })
          .where(eq(exchanges.id, exchange.id));
        
        console.log(`   💾 Updated WebSocket endpoint for ${exchange.name}`);
      } else {
        console.log(`   ✓ WebSocket endpoint is already correct`);
      }
    }

    console.log('\n🎉 WebSocket endpoint fix completed!');
    
    // Show final status
    console.log('\n📋 Final WebSocket endpoints:');
    const updatedExchanges = await db.select().from(exchanges);
    updatedExchanges.forEach(exchange => {
      console.log(`   ${exchange.name}: ${exchange.wsStreamEndpoint} ${exchange.isTestnet ? '(testnet)' : '(live)'}`);
    });

    await client.end();
  } catch (error) {
    console.error('❌ Error fixing WebSocket endpoints:', error);
    process.exit(1);
  }
}

// Run the fix
if (require.main === module) {
  fixWebSocketEndpoints();
}

module.exports = { fixWebSocketEndpoints };
