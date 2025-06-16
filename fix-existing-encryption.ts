/**
 * Script to re-encrypt existing exchange credentials with the fixed encryption
 */
import { db } from './server/db.js';
import { exchanges } from './shared/schema.js';
import { encryptApiCredentials, decrypt } from './server/encryption.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

console.log('🔧 Re-encrypting existing exchanges with fixed encryption...\n');

// Helper function to get encryption key
function getEncryptionKey() {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'crypto-bot-encryption-key-32-chars';
  const key = ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32);
  return Buffer.from(key, 'utf8');
}

// Helper function to decrypt using old method
function decryptOldMethod(encryptedText) {
  const decipher = crypto.createDecipher('aes-256-cbc', getEncryptionKey());
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Helper function to decrypt using new method
function decryptNewMethod(encryptedText, ivHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function reEncryptExchanges() {
  try {
    // Get all exchanges
    const allExchanges = await db.select().from(exchanges);
    
    console.log(`Found ${allExchanges.length} exchanges to check`);
    
    let migrated = 0;
    
    for (const exchange of allExchanges) {
      console.log(`\nChecking exchange: ${exchange.name} (ID: ${exchange.id})`);
      
      try {
        let decryptedApiKey, decryptedApiSecret;
        let needsMigration = false;
        
        // Try new method first
        try {
          decryptedApiKey = decryptNewMethod(exchange.apiKey, exchange.encryptionIv);
          decryptedApiSecret = decryptNewMethod(exchange.apiSecret, exchange.encryptionIv);
          console.log('✓ Already using new encryption method');
        } catch (newMethodError) {
          console.log('New method failed, trying old method...');
          
          // Try old method
          try {
            decryptedApiKey = decryptOldMethod(exchange.apiKey);
            decryptedApiSecret = decryptOldMethod(exchange.apiSecret);
            needsMigration = true;
            console.log('✓ Decrypted with old method, will migrate');
          } catch (oldMethodError) {
            console.error(`❌ Failed to decrypt exchange ${exchange.name} with both methods`);
            console.error('Old method error:', oldMethodError.message);
            console.error('New method error:', newMethodError.message);
            continue;
          }
        }
        
        // If needs migration, re-encrypt with fixed method
        if (needsMigration) {
          const newEncryption = encryptApiCredentials(decryptedApiKey, decryptedApiSecret);
          
          // Update in database
          await db.update(exchanges)
            .set({
              apiKey: newEncryption.apiKey,
              apiSecret: newEncryption.apiSecret,
              encryptionIv: newEncryption.encryptionIv
            })
            .where(eq(exchanges.id, exchange.id));
          
          console.log('✅ Re-encrypted and updated in database');
          migrated++;
        }
        
      } catch (error) {
        console.error(`❌ Error processing exchange ${exchange.name}:`, error);
      }
    }
    
    console.log(`\n🎉 Migration completed! ${migrated} exchanges were re-encrypted.`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
reEncryptExchanges().then(() => {
  console.log('Migration script completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('Migration script failed:', error);
  process.exit(1);
});
