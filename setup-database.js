import pkg from 'pg';
const { Client } = pkg;

async function setupDatabase() {
  // First, connect to the default postgres database to create our database
  const defaultClient = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'Dek.09041976',
    port: 5432,
  });

  try {
    await defaultClient.connect();
    console.log('✅ Connected to PostgreSQL server');

    // Check if the database exists
    const dbCheckResult = await defaultClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'cryptotradeninja'"
    );

    if (dbCheckResult.rows.length === 0) {
      console.log('📝 Creating cryptotradeninja database...');
      await defaultClient.query('CREATE DATABASE cryptotradeninja');
      console.log('✅ Database "cryptotradeninja" created successfully');
    } else {
      console.log('✅ Database "cryptotradeninja" already exists');
    }

    // List all databases
    const dbListResult = await defaultClient.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('\n📋 Available databases:');
    dbListResult.rows.forEach(row => {
      console.log(`  - ${row.datname}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await defaultClient.end();
  }

  // Now test connection to our new database
  const appClient = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'cryptotradeninja',
    password: 'Dek.09041976',
    port: 5432,
  });

  try {
    await appClient.connect();
    console.log('✅ Successfully connected to cryptotradeninja database');
    
    // Check for existing tables
    const tablesResult = await appClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('\n📋 Existing tables in cryptotradeninja:');
    if (tablesResult.rows.length === 0) {
      console.log('  - No tables found (database is empty)');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    }

  } catch (error) {
    console.error('❌ Error connecting to cryptotradeninja database:', error.message);
  } finally {
    await appClient.end();
  }
}

setupDatabase().catch(console.error);
