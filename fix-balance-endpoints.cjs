const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { exchanges } = require('./server/db/schema');
const { eq } = require('drizzle-orm');

async function fixBalanceEndpoints() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:mmdl072404@localhost:5432/crypto_trade_ninja'
  });
  
  const db = drizzle(pool);
  
  try {
    console.log('🔧 Checking and fixing exchange endpoints...\n');
    
    // Get all exchanges
    const allExchanges = await db.select().from(exchanges);
    
    for (const exchange of allExchanges) {
      console.log(`\n📊 Exchange: ${exchange.name} (ID: ${exchange.id})`);
      console.log(`   Type: ${exchange.exchangeType || 'binance'}`);
      console.log(`   Testnet: ${exchange.isTestnet ? 'Yes' : 'No'}`);
      console.log(`   Current REST: ${exchange.restApiEndpoint || 'Not set'}`);
      console.log(`   Current WS: ${exchange.wsStreamEndpoint || 'Not set'}`);
      
      // Determine correct endpoints
      const isTestnet = exchange.isTestnet || false;
      const correctRest = isTestnet 
        ? 'https://testnet.binance.vision'
        : 'https://api.binance.com';
      const correctWs = isTestnet
        ? 'wss://testnet.binance.vision/ws'
        : 'wss://stream.binance.com:9443/ws';
      
      // Update if needed
      if (exchange.restApiEndpoint !== correctRest || exchange.wsStreamEndpoint !== correctWs) {
        console.log('\n   ⚠️  Endpoints need updating!');
        console.log(`   New REST: ${correctRest}`);
        console.log(`   New WS: ${correctWs}`);
        
        await db.update(exchanges)
          .set({
            restApiEndpoint: correctRest,
            wsStreamEndpoint: correctWs,
            wsApiEndpoint: correctWs // Also update wsApiEndpoint if it exists
          })
          .where(eq(exchanges.id, exchange.id));
          
        console.log('   ✅ Updated successfully!');
      } else {
        console.log('   ✅ Endpoints are correct');
      }
    }
    
    console.log('\n✅ Endpoint check complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

// Test balance fetching function
async function testBalanceFetch(exchangeId) {
  const crypto = require('crypto');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:mmdl072404@localhost:5432/crypto_trade_ninja'
  });
  
  const db = drizzle(pool);
  
  try {
    const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId));
    
    if (!exchange) {
      console.log(`Exchange ${exchangeId} not found`);
      return;
    }
    
    console.log(`\n🧪 Testing balance fetch for ${exchange.name}...`);
    
    const baseUrl = exchange.isTestnet 
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';
    
    // Decrypt credentials (simple example - adjust based on your encryption)
    const apiKey = exchange.apiKey; // You'll need to decrypt this
    const apiSecret = exchange.apiSecret; // You'll need to decrypt this
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');
    
    const url = `${baseUrl}/api/v3/account?${queryString}&signature=${signature}`;
    
    console.log(`   URL: ${url}`);
    console.log('   Fetching...');
    
    const response = await fetch(url, {
      headers: {
        'X-MBX-APIKEY': apiKey
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const nonZeroBalances = data.balances.filter(b => 
        parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
      );
      
      console.log(`   ✅ Success! Found ${nonZeroBalances.length} non-zero balances`);
      nonZeroBalances.forEach(b => {
        console.log(`      ${b.asset}: ${b.free} (locked: ${b.locked})`);
      });
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${response.status} - ${error}`);
    }
    
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixBalanceEndpoints().then(() => {
  // Optionally test a specific exchange after fixing
  // testBalanceFetch(4); // Test exchange ID 4
});
