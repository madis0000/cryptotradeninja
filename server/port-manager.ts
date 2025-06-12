import net from 'net';

export class PortManager {
  private static usedPorts = new Set<number>();

  /**
   * Find an available port starting from the preferred port
   */
  static async findAvailablePort(preferredPort: number, maxAttempts: number = 100): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      const port = preferredPort + i;
      if (await this.isPortAvailable(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error(`No available port found starting from ${preferredPort}`);
  }

  /**
   * Check if a specific port is available
   */
  static async isPortAvailable(port: number): Promise<boolean> {
    if (this.usedPorts.has(port)) {
      return false;
    }

    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.close(() => {
          resolve(true);
        });
      });

      server.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Release a port when no longer needed
   */
  static releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  /**
   * Get WebSocket port configuration
   */
  static getWebSocketConfig(): { port: number; path: string } {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      // Development: Use different port from Vite (5000)
      return {
        port: parseInt(process.env.WS_PORT || '3001'),
        path: '/ws'
      };
    } else {
      // Production: Use same HTTP server but different path
      return {
        port: parseInt(process.env.PORT || '5000'),
        path: '/trading-ws'
      };
    }
  }

  /**
   * Get the WebSocket URL for client connections
   */
  static getClientWebSocketURL(baseURL?: string): string {
    const config = this.getWebSocketConfig();
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      // Development: Connect to separate WebSocket port
      const protocol = 'ws:';
      const hostname = 'localhost';
      return `${protocol}//${hostname}:${config.port}${config.path}`;
    } else {
      // Production: Use same server with different path
      if (baseURL) {
        const url = new URL(baseURL);
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${url.host}${config.path}`;
      }
      return `ws://localhost:${config.port}${config.path}`;
    }
  }

  /**
   * Log current port configuration
   */
  static logConfiguration(): void {
    const config = this.getWebSocketConfig();
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    console.log('[PORT MANAGER] Configuration:');
    console.log(`[PORT MANAGER] Environment: ${isDevelopment ? 'Development' : 'Production'}`);
    console.log(`[PORT MANAGER] WebSocket Port: ${config.port}`);
    console.log(`[PORT MANAGER] WebSocket Path: ${config.path}`);
    console.log(`[PORT MANAGER] Client URL: ${this.getClientWebSocketURL()}`);
  }
}