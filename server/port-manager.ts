import { createServer } from 'http';
import { AddressInfo } from 'net';

interface PortConfig {
  vitePort: number;
  wsPort: number;
  expressPort: number;
}

export class PortManager {
  private static instance: PortManager;
  private portConfig: PortConfig | null = null;
  
  // Replit's commonly available ports
  private readonly REPLIT_PORTS = [3000, 5000, 8000, 8080, 3001, 5001, 8001, 8081, 4000, 6000];
  
  static getInstance(): PortManager {
    if (!PortManager.instance) {
      PortManager.instance = new PortManager();
    }
    return PortManager.instance;
  }

  /**
   * Check if a port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', () => resolve(false));
    });
  }

  /**
   * Find available ports for all services
   */
  async findAvailablePorts(): Promise<PortConfig> {
    if (this.portConfig) {
      return this.portConfig;
    }

    const availablePorts: number[] = [];
    
    // Check which Replit ports are available
    for (const port of this.REPLIT_PORTS) {
      if (await this.isPortAvailable(port)) {
        availablePorts.push(port);
      }
    }

    if (availablePorts.length < 3) {
      throw new Error('Not enough available ports in Replit environment');
    }

    // Assign ports strategically
    const expressPort = availablePorts[0]; // Main application port
    const vitePort = availablePorts[1];    // Vite dev server
    const wsPort = availablePorts[2];      // WebSocket server

    this.portConfig = {
      expressPort,
      vitePort,
      wsPort
    };

    console.log('[PORT MANAGER] Port assignments:');
    console.log(`  Express Server: ${expressPort}`);
    console.log(`  Vite Dev Server: ${vitePort}`);
    console.log(`  WebSocket Server: ${wsPort}`);

    return this.portConfig;
  }

  /**
   * Get the current port configuration
   */
  getPortConfig(): PortConfig {
    if (!this.portConfig) {
      throw new Error('Port configuration not initialized. Call findAvailablePorts() first.');
    }
    return this.portConfig;
  }

  /**
   * Get WebSocket URL for client connections
   */
  getWebSocketUrl(): string {
    if (!this.portConfig) {
      throw new Error('Port configuration not initialized');
    }

    // In Replit, use the main domain with WebSocket path
    const protocol = process.env.NODE_ENV === 'production' ? 'wss:' : 'wss:';
    const host = process.env.REPL_SLUG 
      ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER || 'replit'}.repl.co`
      : 'localhost';
    
    // Use express port with /ws path instead of separate WebSocket port
    return `${protocol}//${host}/ws`;
  }

  /**
   * Get Vite dev server URL
   */
  getViteUrl(): string {
    if (!this.portConfig) {
      throw new Error('Port configuration not initialized');
    }

    const protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'https:';
    const host = process.env.REPL_SLUG 
      ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER || 'replit'}.repl.co`
      : 'localhost';
    
    return `${protocol}//${host}:${this.portConfig.vitePort}`;
  }

  /**
   * Check if we're running in Replit environment
   */
  isReplitEnvironment(): boolean {
    return !!(process.env.REPL_SLUG || process.env.REPLIT_DB_URL);
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig() {
    return {
      isReplit: this.isReplitEnvironment(),
      replSlug: process.env.REPL_SLUG,
      replOwner: process.env.REPL_OWNER,
      nodeEnv: process.env.NODE_ENV || 'development'
    };
  }
}

export const portManager = PortManager.getInstance();