const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

// Database schema imports
const { exchanges } = require('./server/schema');

async function checkExchangeCredentials() {
  try {
    // Initialize database
    const dbPath = path.join(__dirname, 'trading_bot.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    
    console.log('🔍 Checking exchange credentials in database...\n');
    
    // Get all exchanges
    const allExchanges = await db.select().from(exchanges);
    
    if (allExchanges.length === 0) {
      console.log('❌ No exchanges found in database');
      return;
    }
    
    console.log(`📊 Found ${allExchanges.length} exchanges:\n`);
    
    for (const exchange of allExchanges) {
      console.log(`Exchange ID: ${exchange.id}`);
      console.log(`Name: ${exchange.name}`);
      console.log(`Type: ${exchange.type}`);
      console.log(`Is Testnet: ${exchange.isTestnet ? 'Yes' : 'No'}`);
      console.log(`Status: ${exchange.status}`);
      
      if (exchange.encryptedCredentials) {
        console.log('✅ Has encrypted credentials');
        
        try {
          // Try to decrypt credentials to verify they exist
          const encryptionKey = process.env.ENCRYPTION_KEY || 'your-encryption-key-here';
          if (encryptionKey === 'your-encryption-key-here') {
            console.log('⚠️  ENCRYPTION_KEY not set in environment variables');
          } else {
            // Decrypt credentials
            const decrypted = decryptCredentials(exchange.encryptedCredentials, encryptionKey);
            console.log('✅ Credentials can be decrypted');
            console.log(`API Key (first 8 chars): ${decrypted.apiKey.substring(0, 8)}...`);
            console.log(`API Secret (length): ${decrypted.apiSecret.length} characters`);
          }
        } catch (error) {
          console.log('❌ Failed to decrypt credentials:', error.message);
        }
      } else {
        console.log('❌ No encrypted credentials found');
      }
      
      console.log('---\n');
    }
    
    sqlite.close();
    
  } catch (error) {
    console.error('❌ Error checking exchange credentials:', error);
  }
}

function decryptCredentials(encryptedData, encryptionKey) {
  try {
    const data = JSON.parse(encryptedData);
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

checkExchangeCredentials();
