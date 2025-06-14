/**
 * Server configuration for deployment compatibility
 */

export const config = {
  // Port configuration - Use PORT for main server, separate port for dev WebSocket
  port: process.env.PORT ? parseInt(process.env.PORT) : 5000,
  host: process.env.HOST || "0.0.0.0",
  
  // WebSocket port - only used in development mode  
  wsPort: process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001,
  
  // Environment detection
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
  
  // Deployment detection for local development
  isDeployment: !!(process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL || process.env.DEPLOYMENT),
  
  // Security
  allowedOrigins: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    (process.env.NODE_ENV === 'production' ? ['*'] : ['*']),
  
  // Database
  databaseUrl: process.env.DATABASE_URL,
  
  // API Keys
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-change-in-production',
  
  // WebSocket configuration
  websocket: {
    // In production/deployment, use same port as HTTP server
    // In development, use separate port to avoid Vite HMR conflicts
    useSeparatePort: process.env.NODE_ENV !== 'production' && !process.env.DEPLOYMENT,
    path: '/api/ws'
  }
};

export default config;