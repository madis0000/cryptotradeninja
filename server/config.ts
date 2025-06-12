/**
 * Server configuration for deployment compatibility
 */

export const config = {
  // Port configuration
  port: process.env.PORT ? parseInt(process.env.PORT) : 5000,
  host: process.env.HOST || "0.0.0.0",
  wsPort: process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080,
  
  // Environment
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
  
  // Security
  allowedOrigins: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    (process.env.NODE_ENV === 'production' ? [] : ['*']),
  
  // Database
  databaseUrl: process.env.DATABASE_URL,
  
  // API Keys
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key',
};

export default config;