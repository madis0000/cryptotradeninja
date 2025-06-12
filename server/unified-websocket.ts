import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { parse } from 'url';

/**
 * Professional unified WebSocket solution that eliminates port conflicts
 * by using path-based routing and a single WebSocket server instance
 */
export class UnifiedWebSocketManager {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocket>();
  private messageHandlers = new Map<string, Function>();

  constructor(server: Server) {
    // Create a single WebSocket server attached to the HTTP server
    this.wss = new WebSocketServer({ 
      noServer: true  // Critical: no separate server, use HTTP upgrade
    });
    
    // Handle HTTP upgrade requests for WebSocket connections
    server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
      const url = parse(request.url || '', true);
      
      // Only handle /ws path, let Vite handle everything else
      if (url.pathname === '/ws') {
        console.log('[Unified WS] Handling WebSocket upgrade for /ws');
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.handleConnection(ws, request);
        });
      } else {
        // Let other handlers (Vite) handle non-trading WebSocket requests
        console.log(`[Unified WS] Ignoring upgrade request for ${url.pathname}`);
      }
    });

    this.setupMessageHandlers();
    console.log('[Unified WS] WebSocket manager initialized with HTTP upgrade handling');
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage) {
    const clientId = this.generateClientId();
    this.connections.set(clientId, ws);
    
    console.log(`[Unified WS] New connection: ${clientId}`);
    
    // Send welcome message
    this.sendMessage(ws, {
      type: 'connected',
      clientId,
      message: 'Connected to trading WebSocket server'
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.routeMessage(ws, message, clientId);
      } catch (error) {
        console.error('[Unified WS] Message parsing error:', error);
      }
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
      console.log(`[Unified WS] Connection ${clientId} closed: ${code}`);
      this.connections.delete(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[Unified WS] Connection ${clientId} error:`, error);
      this.connections.delete(clientId);
    });
  }

  private setupMessageHandlers() {
    this.messageHandlers.set('ping', this.handlePing.bind(this));
    this.messageHandlers.set('subscribe', this.handleSubscribe.bind(this));
    this.messageHandlers.set('unsubscribe', this.handleUnsubscribe.bind(this));
    this.messageHandlers.set('market_data', this.handleMarketData.bind(this));
    this.messageHandlers.set('order_notification', this.handleOrderNotification.bind(this));
  }

  private routeMessage(ws: WebSocket, message: any, clientId: string) {
    const handler = this.messageHandlers.get(message.type);
    
    if (handler) {
      handler(ws, message, clientId);
    } else {
      console.warn(`[Unified WS] Unknown message type: ${message.type}`);
      this.sendMessage(ws, {
        type: 'error',
        message: `Unknown message type: ${message.type}`
      });
    }
  }

  private handlePing(ws: WebSocket, message: any, clientId: string) {
    this.sendMessage(ws, {
      type: 'pong',
      timestamp: Date.now(),
      clientId
    });
  }

  private handleSubscribe(ws: WebSocket, message: any, clientId: string) {
    console.log(`[Unified WS] Subscribe request from ${clientId}:`, message.symbols);
    
    // Handle subscription logic here
    // This would connect to external data sources like Binance
    
    this.sendMessage(ws, {
      type: 'subscription_confirmed',
      symbols: message.symbols,
      clientId
    });
  }

  private handleUnsubscribe(ws: WebSocket, message: any, clientId: string) {
    console.log(`[Unified WS] Unsubscribe request from ${clientId}:`, message.symbols);
    
    // Handle unsubscription logic here
    
    this.sendMessage(ws, {
      type: 'unsubscription_confirmed',
      symbols: message.symbols,
      clientId
    });
  }

  private handleMarketData(ws: WebSocket, message: any, clientId: string) {
    // Handle market data requests
    console.log(`[Unified WS] Market data request from ${clientId}`);
  }

  private handleOrderNotification(ws: WebSocket, message: any, clientId: string) {
    // Broadcast order notifications to all connected clients
    this.broadcast(message);
  }

  private sendMessage(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[Unified WS] Send error:', error);
      }
    }
  }

  public broadcast(message: any) {
    const messageString = JSON.stringify(message);
    let sent = 0;
    let failed = 0;

    this.connections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageString);
          sent++;
        } catch (error) {
          console.error(`[Unified WS] Broadcast error for ${clientId}:`, error);
          failed++;
          this.connections.delete(clientId);
        }
      } else {
        this.connections.delete(clientId);
      }
    });

    return { sent, failed, total: this.connections.size };
  }

  public broadcastToClient(clientId: string, message: any) {
    const ws = this.connections.get(clientId);
    if (ws) {
      this.sendMessage(ws, message);
      return true;
    }
    return false;
  }

  private generateClientId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  public getStats() {
    return {
      activeConnections: this.connections.size,
      connectionIds: Array.from(this.connections.keys()),
      timestamp: Date.now()
    };
  }

  public shutdown() {
    console.log('[Unified WS] Shutting down WebSocket manager');
    
    this.connections.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Server shutdown');
      }
    });
    
    this.connections.clear();
    
    if (this.wss) {
      this.wss.close();
    }
  }
}