const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { exchanges } = require('./shared/schema.ts');

const connectionString = 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja';

async function checkExchanges() {
  console.log('🔍 Checking configured exchanges...');
  
  try {
    const sql = postgres(connectionString);
    const db = drizzle(sql);
    
    const results = await db.select().from(exchanges);
    console.log('📊 Found', results.length, 'exchanges:');
    
    if (results.length === 0) {
      console.log('⚠️ No exchanges configured in the database');
      console.log('💡 You need to add a Binance exchange configuration with API credentials');
    } else {
      results.forEach((exchange, i) => {
        console.log(`\n${i+1}. ${exchange.name} (ID: ${exchange.id})`);
        console.log(`   📊 Type: ${exchange.exchangeType}`);
        console.log(`   🧪 Testnet: ${exchange.isTestnet}`);
        console.log(`   🔑 API Key: ${exchange.apiKey ? exchange.apiKey.substring(0, 8) + '...' + exchange.apiKey.slice(-4) : 'None'}`);
        console.log(`   🗝️ API Secret: ${exchange.apiSecret ? 'Present' : 'None'}`);
        console.log(`   🌐 Rest API: ${exchange.restApiEndpoint}`);
        console.log(`   📡 Stream API: ${exchange.wsStreamEndpoint}`);
      });
    }
    
    await sql.end();
  } catch (error) {
    console.error('❌ Error checking exchanges:', error.message);
  }
}

checkExchanges();
