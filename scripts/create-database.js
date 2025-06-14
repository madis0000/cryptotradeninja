import pg from 'pg';

const { Client } = pg;

async function createDatabase() {
  // First connect to the default postgres database
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'postgres',
    port: 5432,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');
    
    // Check if database exists
    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = 'cryptotradeninja'`
    );
    
    if (result.rows.length === 0) {
      // Create the database
      await client.query('CREATE DATABASE cryptotradeninja');
      console.log('✅ Database "cryptotradeninja" created successfully');
    } else {
      console.log('✅ Database "cryptotradeninja" already exists');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDatabase();
