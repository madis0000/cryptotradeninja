import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { parse } from 'url';

/**
 * Professional WebSocket handler that avoids port conflicts
 * by using path-based routing instead of separate ports
 */
export class WebSocketHandler {
  private tradingClients = new Set<WebSocket>();
  private messageHandlers = new Map<string, Function>();

  constructor() {
    this.setupMessageHandlers();
  }

  /**
   * Handle WebSocket upgrade requests with path-based routing
   */
  handleUpgrade(request: IncomingMessage, socket: any, head: Buffer, wss: WebSocketServer) {
    const url = parse(request.url || '', true);
    const pathname = url.pathname;

    // Only handle trading WebSocket connections on /ws path
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleTradingConnection(ws, request);
      });
    } else {
      // Reject non-trading WebSocket connections
      socket.destroy();
    }
  }

  /**
   * Handle new trading WebSocket connection
   */
  private handleTradingConnection(ws: WebSocket, request: IncomingMessage) {
    console.log('[WS Handler] New trading connection established');
    
    this.tradingClients.add(ws);
    
    // Send welcome message
    this.sendMessage(ws, {
      type: 'connected',
      clientId: this.generateClientId(),
      message: 'Connected to trading WebSocket server'
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('[WS Handler] Message parsing error:', error);
        this.sendMessage(ws, {
          type: 'error',
          message: 'Invalid message format'
        });
      }
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
      console.log(`[WS Handler] Connection closed - Code: ${code}`);
      this.tradingClients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WS Handler] Connection error:', error);
      this.tradingClients.delete(ws);
    });
  }

  /**
   * Set up message handlers for different message types
   */
  private setupMessageHandlers() {
    this.messageHandlers.set('subscribe', this.handleSubscribe.bind(this));
    this.messageHandlers.set('unsubscribe', this.handleUnsubscribe.bind(this));
    this.messageHandlers.set('ping', this.handlePing.bind(this));
  }

  /**
   * Route incoming messages to appropriate handlers
   */
  private handleMessage(ws: WebSocket, message: any) {
    const handler = this.messageHandlers.get(message.type);
    
    if (handler) {
      handler(ws, message);
    } else {
      console.warn(`[WS Handler] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle subscription requests
   */
  private handleSubscribe(ws: WebSocket, message: any) {
    console.log('[WS Handler] Subscribe request:', message);
    // Implementation for subscription logic
  }

  /**
   * Handle unsubscription requests
   */
  private handleUnsubscribe(ws: WebSocket, message: any) {
    console.log('[WS Handler] Unsubscribe request:', message);
    // Implementation for unsubscription logic
  }

  /**
   * Handle ping messages for keepalive
   */
  private handlePing(ws: WebSocket, message: any) {
    this.sendMessage(ws, { type: 'pong', timestamp: Date.now() });
  }

  /**
   * Send message to specific client
   */
  private sendMessage(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[WS Handler] Send error:', error);
      }
    }
  }

  /**
   * Broadcast message to all connected trading clients
   */
  public broadcast(message: any) {
    const messageString = JSON.stringify(message);
    let sent = 0;
    let failed = 0;

    this.tradingClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageString);
          sent++;
        } catch (error) {
          console.error('[WS Handler] Broadcast error:', error);
          failed++;
          this.tradingClients.delete(client);
        }
      } else {
        this.tradingClients.delete(client);
      }
    });

    return { sent, failed, total: this.tradingClients.size };
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get connection statistics
   */
  public getStats() {
    return {
      connectedClients: this.tradingClients.size,
      timestamp: Date.now()
    };
  }

  /**
   * Gracefully close all connections
   */
  public shutdown() {
    console.log('[WS Handler] Shutting down WebSocket handler');
    
    this.tradingClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server shutdown');
      }
    });
    
    this.tradingClients.clear();
  }
}