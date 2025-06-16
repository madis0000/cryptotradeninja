/**
 * Test encryption/decryption functionality
 */
const { encrypt, decrypt, encryptApiCredentials, decryptApiCredentials } = require('./server/encryption.js');

console.log('Testing encryption/decryption...');

// Test basic encryption/decryption
const testData = 'test-api-key-12345';
const encrypted = encrypt(testData);
console.log('Encrypted:', encrypted);

const decrypted = decrypt(encrypted.encryptedText, encrypted.iv);
console.log('Decrypted:', decrypted);
console.log('Match:', testData === decrypted);

// Test API credentials encryption/decryption
const testApiKey = 'test-api-key-abcdef';
const testApiSecret = 'test-api-secret-123456';

const encryptedCreds = encryptApiCredentials(testApiKey, testApiSecret);
console.log('Encrypted credentials:', encryptedCreds);

const decryptedCreds = decryptApiCredentials(
  encryptedCreds.apiKey,
  encryptedCreds.apiSecret,
  encryptedCreds.encryptionIv
);
console.log('Decrypted credentials:', decryptedCreds);
console.log('API Key match:', testApiKey === decryptedCreds.apiKey);
console.log('API Secret match:', testApiSecret === decryptedCreds.apiSecret);
