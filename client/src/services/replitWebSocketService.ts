/**
 * Replit-optimized WebSocket service that eliminates port conflicts
 * and ensures stable connections with Vite HMR
 */

interface ConnectionConfig {
  maxRetries: number;
  retryDelay: number;
  connectionTimeout: number;
  heartbeatInterval: number;
}

interface WebSocketConnection {
  id: string;
  ws: WebSocket | null;
  isConnected: boolean;
  retryCount: number;
  lastError?: string;
  listeners: Set<(data: any) => void>;
}

export class ReplitWebSocketService {
  private static instance: ReplitWebSocketService;
  private connections = new Map<string, WebSocketConnection>();
  private config: ConnectionConfig = {
    maxRetries: 10,
    retryDelay: 3000,
    connectionTimeout: 15000,
    heartbeatInterval: 30000
  };

  private constructor() {}

  static getInstance(): ReplitWebSocketService {
    if (!ReplitWebSocketService.instance) {
      ReplitWebSocketService.instance = new ReplitWebSocketService();
    }
    return ReplitWebSocketService.instance;
  }

  /**
   * Get WebSocket URL optimized for Replit
   */
  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    return `${protocol}//${host}:5001`;
  }

  /**
   * Create a new WebSocket connection
   */
  createConnection(
    connectionId: string, 
    onMessage?: (data: any) => void,
    onConnect?: () => void,
    onDisconnect?: () => void
  ): Promise<WebSocketConnection> {
    return new Promise((resolve, reject) => {
      // Close existing connection if it exists
      if (this.connections.has(connectionId)) {
        this.closeConnection(connectionId);
      }

      const connection: WebSocketConnection = {
        id: connectionId,
        ws: null,
        isConnected: false,
        retryCount: 0,
        listeners: new Set()
      };

      if (onMessage) {
        connection.listeners.add(onMessage);
      }

      this.connections.set(connectionId, connection);

      this.connect(connection)
        .then(() => {
          if (onConnect) onConnect();
          resolve(connection);
        })
        .catch((error) => {
          connection.lastError = error.message;
          reject(error);
        });
    });
  }

  /**
   * Establish WebSocket connection with optimized settings
   */
  private async connect(connection: WebSocketConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.getWebSocketUrl();
      
      console.log(`[Replit WS] Connecting to ${url} (${connection.id})`);
      
      try {
        connection.ws = new WebSocket(url);
        
        // Connection timeout
        const timeout = setTimeout(() => {
          if (connection.ws && connection.ws.readyState === WebSocket.CONNECTING) {
            console.warn(`[Replit WS] Connection timeout for ${connection.id}`);
            connection.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, this.config.connectionTimeout);

        connection.ws.onopen = () => {
          clearTimeout(timeout);
          console.log(`[Replit WS] Connected successfully (${connection.id})`);
          connection.isConnected = true;
          connection.retryCount = 0;
          connection.lastError = undefined;
          
          // Start heartbeat
          this.startHeartbeat(connection);
          
          resolve();
        };

        connection.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Broadcast to all listeners
            connection.listeners.forEach(listener => {
              try {
                listener(data);
              } catch (error) {
                console.error(`[Replit WS] Listener error:`, error);
              }
            });
          } catch (error) {
            console.error(`[Replit WS] Message parsing error:`, error);
          }
        };

        connection.ws.onclose = (event) => {
          clearTimeout(timeout);
          console.log(`[Replit WS] Connection closed (${connection.id}) - Code: ${event.code}`);
          connection.isConnected = false;
          
          // Auto-reconnect if not manually closed
          if (event.code !== 1000 && connection.retryCount < this.config.maxRetries) {
            this.scheduleReconnect(connection);
          }
        };

        connection.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error(`[Replit WS] Connection error (${connection.id}):`, error);
          connection.lastError = error.toString();
          
          if (connection.retryCount === 0) {
            reject(error);
          }
        };

      } catch (error) {
        console.error(`[Replit WS] Failed to create WebSocket:`, error);
        reject(error);
      }
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(connection: WebSocketConnection): void {
    connection.retryCount++;
    const delay = this.config.retryDelay * Math.min(connection.retryCount, 5); // Exponential backoff cap
    
    console.log(`[Replit WS] Scheduling reconnect attempt ${connection.retryCount} in ${delay}ms (${connection.id})`);
    
    setTimeout(() => {
      if (this.connections.has(connection.id) && !connection.isConnected) {
        this.connect(connection).catch((error) => {
          console.error(`[Replit WS] Reconnect failed (${connection.id}):`, error);
        });
      }
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(connection: WebSocketConnection): void {
    const heartbeatInterval = setInterval(() => {
      if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        clearInterval(heartbeatInterval);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Send message through connection
   */
  sendMessage(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId);
    
    if (connection && connection.ws && connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error(`[Replit WS] Send error (${connectionId}):`, error);
      }
    }
    
    return false;
  }

  /**
   * Add message listener to connection
   */
  addListener(connectionId: string, listener: (data: any) => void): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.listeners.add(listener);
    }
  }

  /**
   * Remove message listener from connection
   */
  removeListener(connectionId: string, listener: (data: any) => void): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.listeners.delete(listener);
    }
  }

  /**
   * Close connection
   */
  closeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      if (connection.ws) {
        connection.ws.close(1000, 'Manual close');
      }
      
      this.connections.delete(connectionId);
      console.log(`[Replit WS] Connection closed and removed (${connectionId})`);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(connectionId: string): { connected: boolean; retryCount: number; lastError?: string } {
    const connection = this.connections.get(connectionId);
    
    return {
      connected: connection?.isConnected || false,
      retryCount: connection?.retryCount || 0,
      lastError: connection?.lastError
    };
  }

  /**
   * Test WebSocket connectivity
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const testId = 'test-connection';
    const startTime = Date.now();
    
    try {
      await this.createConnection(testId);
      const latency = Date.now() - startTime;
      this.closeConnection(testId);
      
      return { success: true, latency };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo() {
    return {
      url: this.getWebSocketUrl(),
      connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
        id,
        connected: conn.isConnected,
        retryCount: conn.retryCount,
        lastError: conn.lastError,
        listenerCount: conn.listeners.size
      })),
      config: this.config
    };
  }
}

export const replitWsService = ReplitWebSocketService.getInstance();