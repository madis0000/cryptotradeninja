// Simple script to check WebSocket endpoints in database
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja'
});

async function checkEndpoints() {
  try {
    await client.connect();
    console.log('Connected to database');    // Query exchanges table
    console.log('Checking table structure...');
    const tableInfo = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'exchanges'");
    console.log('Columns:', tableInfo.rows.map(r => r.column_name));
    
    const result = await client.query('SELECT * FROM exchanges ORDER BY id');
      console.log('\n=== EXCHANGE ENDPOINTS ===');
    result.rows.forEach(row => {
      console.log(`Exchange ${row.id} (${row.name}):`);
      console.log(`  - WS Stream: ${row.ws_stream_endpoint}`);
      console.log(`  - WS API: ${row.ws_api_endpoint}`);
      console.log(`  - REST API: ${row.rest_api_endpoint}`);
      console.log(`  - Testnet: ${row.is_testnet}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkEndpoints();
