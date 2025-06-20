// Simple script to check WebSocket endpoints in database
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja'
});

async function checkEndpoints() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Query exchanges table
    const result = await client.query('SELECT id, name, "wsStreamEndpoint", "restApiEndpoint", "isTestnet" FROM exchanges ORDER BY id');
    
    console.log('\n=== EXCHANGE ENDPOINTS ===');
    result.rows.forEach(row => {
      console.log(`Exchange ${row.id} (${row.name}):`);
      console.log(`  - WebSocket: ${row.wsStreamEndpoint}`);
      console.log(`  - REST API: ${row.restApiEndpoint}`);
      console.log(`  - Testnet: ${row.isTestnet}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkEndpoints();
