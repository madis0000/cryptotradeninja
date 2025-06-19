// Quick script to check exchange 4 WebSocket endpoints
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { exchanges } = require('./shared/schema.ts');

const connectionString = 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja';

async function checkExchange4() {
  const sql = postgres(connectionString);
  const db = drizzle(sql);
  
  try {
    console.log('=== CHECKING EXCHANGE ID 4 ===');
    const exchange4 = await db.select().from(exchanges).where(exchanges.id.eq(4));
    
    if (exchange4.length > 0) {
      const ex = exchange4[0];
      console.log('Exchange 4 found:');
      console.log(`- Name: ${ex.name}`);
      console.log(`- Active: ${ex.isActive}`);
      console.log(`- Type: ${ex.exchangeType}`);
      console.log(`- Testnet: ${ex.isTestnet}`);
      console.log(`- WS Stream Endpoint: ${ex.wsStreamEndpoint}`);
      console.log(`- WS API Endpoint: ${ex.wsApiEndpoint}`);
      console.log(`- REST API Endpoint: ${ex.restApiEndpoint}`);
      
      // Test the WebSocket endpoint
      if (ex.wsStreamEndpoint) {
        console.log('\n=== TESTING WEBSOCKET ENDPOINT ===');
        console.log(`Testing: ${ex.wsStreamEndpoint}/stream`);
        
        const WebSocket = require('ws');
        const ws = new WebSocket(`${ex.wsStreamEndpoint}/stream`);
        
        ws.on('open', () => {
          console.log('✅ WebSocket connection successful');
          ws.close();
        });
        
        ws.on('error', (error) => {
          console.log('❌ WebSocket connection failed:', error.message);
        });
        
        ws.on('close', (code, reason) => {
          console.log(`🔌 WebSocket closed: ${code} ${reason}`);
          sql.end();
          process.exit(0);
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.log('⏰ WebSocket connection timeout');
            ws.terminate();
            sql.end();
            process.exit(0);
          }
        }, 5000);
      } else {
        console.log('❌ No WebSocket stream endpoint configured');
        sql.end();
        process.exit(0);
      }
    } else {
      console.log('❌ Exchange 4 not found');
      sql.end();
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Error:', error);
    sql.end();
    process.exit(1);
  }
}

checkExchange4();
