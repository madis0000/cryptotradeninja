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
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

export const encryptApiCredentials = (apiKey: string, apiSecret: string) => {
  const encryptedApiKey = encrypt(apiKey);
  const encryptedApiSecret = encrypt(apiSecret);
  
  return {
    apiKey: encryptedApiKey.encryptedText,
    apiSecret: encryptedApiSecret.encryptedText,
    encryptionIv: encryptedApiKey.iv, // Using same IV for both (in production, use separate IVs)
  };
};

export const decryptApiCredentials = (encryptedApiKey: string, encryptedApiSecret: string, ivHex: string) => {
  return {
    apiKey: decrypt(encryptedApiKey, ivHex),
    apiSecret: decrypt(encryptedApiSecret, ivHex),
  };
};