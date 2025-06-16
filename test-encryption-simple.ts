/**
 * Simple test to verify the encryption fix - using tsx to run TypeScript directly
 */

// Test with sample credentials
const testApiKey = 'test-api-key-1234567890abcdef';
const testApiSecret = 'test-api-secret-abcdef1234567890';

console.log('🔧 Testing encryption fix...\n');

console.log('Original credentials:');
console.log('API Key:', testApiKey);
console.log('API Secret:', testApiSecret);
console.log();

// Import the functions dynamically to test
async function testEncryption() {
  try {
    // We'll use tsx to run this, so we can import TypeScript modules
    const { encryptApiCredentials, decryptApiCredentials } = await import('./server/encryption.js');
    
    // Encrypt credentials
    const encrypted = encryptApiCredentials(testApiKey, testApiSecret);
    console.log('Encrypted data:');
    console.log('Encrypted API Key:', encrypted.apiKey);
    console.log('Encrypted API Secret:', encrypted.apiSecret);
    console.log('IV:', encrypted.encryptionIv);
    console.log();

    // Decrypt credentials
    const decrypted = decryptApiCredentials(
      encrypted.apiKey,
      encrypted.apiSecret,
      encrypted.encryptionIv
    );
    
    console.log('Decrypted credentials:');
    console.log('API Key:', decrypted.apiKey);
    console.log('API Secret:', decrypted.apiSecret);
    console.log();
    
    // Verify matches
    const apiKeyMatch = testApiKey === decrypted.apiKey;
    const apiSecretMatch = testApiSecret === decrypted.apiSecret;
    
    console.log('✅ Verification Results:');
    console.log('API Key match:', apiKeyMatch ? '✓' : '✗');
    console.log('API Secret match:', apiSecretMatch ? '✓' : '✗');
    console.log();
    
    if (apiKeyMatch && apiSecretMatch) {
      console.log('🎉 Encryption fix verified successfully!');
    } else {
      console.log('❌ Encryption fix failed verification');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testEncryption();
