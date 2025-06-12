import { spawn } from 'child_process';
import { portManager } from './port-manager';

/**
 * Replit-optimized startup script that manages port conflicts
 * between Vite HMR and custom WebSocket server
 */
export class StartupManager {
  private static instance: StartupManager;
  private processes: { [key: string]: any } = {};

  static getInstance(): StartupManager {
    if (!StartupManager.instance) {
      StartupManager.instance = new StartupManager();
    }
    return StartupManager.instance;
  }

  async initialize(): Promise<void> {
    console.log('[STARTUP] Initializing Replit-optimized server startup...');
    
    // Detect Replit environment
    const envConfig = portManager.getEnvironmentConfig();
    console.log('[STARTUP] Environment:', envConfig);

    if (envConfig.isReplit) {
      console.log('[STARTUP] Running in Replit environment - using unified port strategy');
      await this.startUnifiedServer();
    } else {
      console.log('[STARTUP] Running in standard environment');
      await this.startStandardServer();
    }
  }

  private async startUnifiedServer(): Promise<void> {
    // In Replit, we use a single port (5000) for both Express and WebSocket
    // This eliminates port conflicts with Vite's HMR
    console.log('[STARTUP] Starting unified server on port 5000...');
    
    // Set environment variables for consistent port usage
    process.env.PORT = '5000';
    process.env.WS_PORT = '5000'; // Same port, different path
    
    // The existing server startup in index.ts will handle this
    console.log('[STARTUP] Unified server configuration ready');
  }

  private async startStandardServer(): Promise<void> {
    // For non-Replit environments, use separate ports if needed
    const portConfig = await portManager.findAvailablePorts();
    
    process.env.PORT = portConfig.expressPort.toString();
    process.env.WS_PORT = portConfig.wsPort.toString();
    process.env.VITE_PORT = portConfig.vitePort.toString();
    
    console.log('[STARTUP] Standard server configuration ready');
  }

  /**
   * Get WebSocket connection URL for clients
   */
  getWebSocketUrl(): string {
    if (portManager.isReplitEnvironment()) {
      // In Replit, use the main domain with /ws path
      const protocol = 'wss:';
      const host = process.env.REPL_SLUG 
        ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER || 'replit'}.repl.co`
        : window?.location?.host || 'localhost:5000';
      
      return `${protocol}//${host}/ws`;
    } else {
      return portManager.getWebSocketUrl();
    }
  }

  /**
   * Handle graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[STARTUP] Shutting down all processes...');
    
    for (const [name, process] of Object.entries(this.processes)) {
      if (process && process.kill) {
        console.log(`[STARTUP] Terminating ${name}...`);
        process.kill('SIGTERM');
      }
    }
    
    // Give processes time to cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('[STARTUP] Shutdown complete');
  }

  /**
   * Health check for all services
   */
  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const health = {
      express: false,
      websocket: false,
      replit: portManager.isReplitEnvironment()
    };

    try {
      // Check if main server is responding
      const response = await fetch('http://localhost:5000/api/auth/me').catch(() => null);
      health.express = response?.status === 401 || response?.status === 200; // Auth endpoint should return 401 without token
      
      // WebSocket health is checked through the unified server
      health.websocket = health.express; // Same server in Replit
      
    } catch (error) {
      console.error('[STARTUP] Health check failed:', error);
    }

    return health;
  }
}

export const startupManager = StartupManager.getInstance();