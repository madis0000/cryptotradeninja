// Check database endpoints using ES modules
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pgTable, text, boolean, timestamp, serial, integer } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

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

const connectionString = 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja';

async function checkEndpoints() {
  const sql = postgres(connectionString);
  const db = drizzle(sql);
  
  try {
    console.log('=== CHECKING EXCHANGE ENDPOINTS ===');
    
    // Get all exchanges
    const allExchanges = await db.select().from(exchanges);
    
    console.log(`Found ${allExchanges.length} exchanges:`);
    console.log('');
    
    allExchanges.forEach(exchange => {
      console.log(`📊 Exchange: ${exchange.name} (ID: ${exchange.id})`);
      console.log(`   Active: ${exchange.isActive}`);
      console.log(`   Testnet: ${exchange.isTestnet}`);
      console.log(`   Type: ${exchange.exchangeType}`);
      console.log(`   REST API: ${exchange.restApiEndpoint || 'NOT SET'}`);
      console.log(`   WS Stream: ${exchange.wsStreamEndpoint || 'NOT SET'}`);
      console.log(`   WS API: ${exchange.wsApiEndpoint || 'NOT SET'}`);
      console.log('   ---');
    });
    
    // Focus on exchange 4 (the one with issues)
    console.log('\n=== EXCHANGE 4 DETAILS ===');
    const exchange4 = await db.select().from(exchanges).where(eq(exchanges.id, 4));
    
    if (exchange4.length > 0) {
      const ex = exchange4[0];
      console.log(`Exchange 4 Configuration:`);
      console.log(`  Name: ${ex.name}`);
      console.log(`  Testnet: ${ex.isTestnet}`);
      console.log(`  REST API Endpoint: "${ex.restApiEndpoint}"`);
      console.log(`  WS Stream Endpoint: "${ex.wsStreamEndpoint}"`);
      console.log(`  WS API Endpoint: "${ex.wsApiEndpoint}"`);
      
      // Show what the user data stream URL would be constructed as
      if (ex.wsStreamEndpoint) {
        console.log(`\n🔍 URL Construction Analysis:`);
        console.log(`  Database wsStreamEndpoint: "${ex.wsStreamEndpoint}"`);
        console.log(`  Current code constructs: "${ex.wsStreamEndpoint}/ws/{listenKey}"`);
        console.log(`  This results in: "${ex.wsStreamEndpoint}/ws/someListenKey"`);
        
        if (ex.wsStreamEndpoint.includes('/ws')) {
          console.log(`  ⚠️  PROBLEM: Database already contains '/ws', code adds another '/ws'`);
          console.log(`  ✅ SOLUTION: Code should construct: "${ex.wsStreamEndpoint}/{listenKey}"`);
        } else {
          console.log(`  ✅ Database doesn't contain '/ws', current construction is correct`);
        }
      }
    } else {
      console.log('Exchange 4 not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
  }
}

checkEndpoints();
