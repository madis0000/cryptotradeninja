// Quick script to check exchanges and their status
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { exchanges, bots } = require('./shared/schema.ts');

const connectionString = 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja';

async function checkExchanges() {
  const sql = postgres(connectionString);
  const db = drizzle(sql);
  
  try {
    console.log('=== CHECKING ALL EXCHANGES ===');
    const allExchanges = await db.select().from(exchanges);
    
    console.log(`Found ${allExchanges.length} exchanges:`);
    allExchanges.forEach(exchange => {
      console.log(`- Exchange ID: ${exchange.id}, Name: ${exchange.name}, Active: ${exchange.isActive}, Type: ${exchange.exchangeType}`);
      console.log(`  WS Stream: ${exchange.wsStreamEndpoint}`);
      console.log(`  REST API: ${exchange.restApiEndpoint}`);
      console.log(`  Testnet: ${exchange.isTestnet || false}`);
      console.log('---');
    });
    
    console.log('\n=== CHECKING BOTS ===');
    const allBots = await db.select().from(bots);
    console.log(`Found ${allBots.length} bots:`);
    allBots.forEach(bot => {
      console.log(`- Bot ID: ${bot.id}, Name: ${bot.name}, Exchange: ${bot.exchangeId}, Active: ${bot.isActive}, Status: ${bot.status}`);
    });
    
    console.log('\n=== CHECKING SPECIFICALLY EXCHANGE ID 4 ===');
    try {
      const exchange4 = await db.select().from(exchanges).where(exchanges.id.eq(4));
      if (exchange4.length > 0) {
        console.log('Exchange 4 exists:', exchange4[0]);
      } else {
        console.log('Exchange 4 does NOT exist');
      }
    } catch (error) {
      console.log('Error getting exchange 4:', error.message);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

checkExchanges();
