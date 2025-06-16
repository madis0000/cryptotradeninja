/**
 * Migration script to fix encryption for existing exchanges
 * This script will decrypt existing credentials using the old method and re-encrypt with the fixed method
 */
import { db } from './server/db.js';
import { exchanges } from './shared/schema.js';
import { encryptApiCredentials } from './server/encryption.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

console.log('🔧 Starting encryption migration for existing exchanges...\n');

async function migrateExchangeEncryption() {
  try {
    // Get all exchanges
    const allExchanges = await db.select().from(exchanges);
    
    console.log(`Found ${allExchanges.length} exchanges to migrate`);
    
    for (const exchange of allExchanges) {
      console.log(`\nMigrating exchange: ${exchange.name} (ID: ${exchange.id})`);
      
      try {
        // Try to decrypt with old method first (fallback in decrypt function should handle this)
        let decryptedApiKey, decryptedApiSecret;
        
        try {
          // Try new method first
          const iv = Buffer.from(exchange.encryptionIv, 'hex');
          const decipher1 = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
          decryptedApiKey = decipher1.update(exchange.apiKey, 'hex', 'utf8') + decipher1.final('utf8');
          
          const decipher2 = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
          decryptedApiSecret = decipher2.update(exchange.apiSecret, 'hex', 'utf8') + decipher2.final('utf8');
          
          console.log('✓ Successfully decrypted with new method');
        } catch (newMethodError) {
          console.log('New method failed, trying old method...');
          
          // Try old method (createDecipher)
          try {
            const decipher1 = crypto.createDecipher('aes-256-cbc', getEncryptionKey());
            decryptedApiKey = decipher1.update(exchange.apiKey, 'hex', 'utf8') + decipher1.final('utf8');
            
            const decipher2 = crypto.createDecipher('aes-256-cbc', getEncryptionKey());
            decryptedApiSecret = decipher2.update(exchange.apiSecret, 'hex', 'utf8') + decipher2.final('utf8');
            
            console.log('✓ Successfully decrypted with old method, will re-encrypt');
            
            // Re-encrypt with fixed method
            const newEncryption = encryptApiCredentials(decryptedApiKey, decryptedApiSecret);
            
            // Update in database
            await db.update(exchanges)
              .set({
                apiKey: newEncryption.apiKey,
                apiSecret: newEncryption.apiSecret,
                encryptionIv: newEncryption.encryptionIv
              })
              .where(eq(exchanges.id, exchange.id));
            
            console.log('✓ Re-encrypted and updated in database');
          } catch (oldMethodError) {
            console.error(`❌ Failed to decrypt exchange ${exchange.name}:`, oldMethodError);
            continue;
          }
        }
        
      } catch (error) {
        console.error(`❌ Error migrating exchange ${exchange.name}:`, error);
      }
    }
    
    console.log('\n🎉 Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Helper functions
function getEncryptionKey() {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'crypto-bot-encryption-key-32-chars';
  const key = ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32);
  return Buffer.from(key, 'utf8');
}

// Run migration
migrateExchangeEncryption().then(() => {
  console.log('Migration script completed');
  process.exit(0);
}).catch(error => {
  console.error('Migration script failed:', error);
  process.exit(1);
});
