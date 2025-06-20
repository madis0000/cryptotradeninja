import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'crypto-bot-encryption-key-32-chars';
const ALGORITHM = 'aes-256-cbc';

// Ensure key is exactly 32 bytes for AES-256
const getEncryptionKey = (): Buffer => {
  const key = ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32);
  return Buffer.from(key, 'utf8');
};

export interface EncryptedData {
  encryptedText: string;
  iv: string;
}

export const encrypt = (text: string): EncryptedData => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encryptedText: encrypted,
    iv: iv.toString('hex')
  };
};

export const decrypt = (encryptedText: string, ivHex: string): string => {
  try {
    // Try new method first (createDecipheriv)
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // Fall back to old method for existing encrypted data
    try {
      const decipher = crypto.createDecipher(ALGORITHM, getEncryptionKey());
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (fallbackError) {
      throw new Error(`Decryption failed: ${error}`);
    }
  }
};

export const encryptApiCredentials = (apiKey: string, apiSecret: string) => {
  // Use the same IV for both credentials to ensure consistent decryption
  const iv = crypto.randomBytes(16);
  const ivHex = iv.toString('hex');
  
  const cipher1 = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encryptedApiKey = cipher1.update(apiKey, 'utf8', 'hex');
  encryptedApiKey += cipher1.final('hex');
  
  const cipher2 = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encryptedApiSecret = cipher2.update(apiSecret, 'utf8', 'hex');
  encryptedApiSecret += cipher2.final('hex');
  
  return {
    apiKey: encryptedApiKey,
    apiSecret: encryptedApiSecret,
    encryptionIv: ivHex, // Same IV for both credentials
  };
};

export const decryptApiCredentials = (encryptedApiKey: string, encryptedApiSecret: string, ivHex: string) => {
  return {
    apiKey: decrypt(encryptedApiKey, ivHex),
    apiSecret: decrypt(encryptedApiSecret, ivHex),
  };
};