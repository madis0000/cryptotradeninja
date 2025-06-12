import { WebSocketServer } from 'ws';
import { Server } from 'http';

/**
 * Professional solution: Use Vite's proxy capability to route WebSocket traffic
 * This eliminates port conflicts by letting Vite handle the initial connection
 * and then proxying WebSocket traffic to our trading server
 */

export class ViteWebSocketProxy {
  private wss: WebSocketServer | null = null;
  private connections = new Set<any>();

  constructor(server: Server) {
    // Create WebSocket server that attaches to the existing HTTP server
    this.wss = new WebSocketServer({ 
      server: server,
      path: '/ws',
      // Allow Vite to handle the initial HTTP request and upgrade
      verifyClient: (info) => {
        console.log('[WS Proxy] Connection verification from:', info.origin);
        return true; // Accept all connections on /ws path
      }
    });

    this.setupWebSocketHandling();
  }

  private setupWebSocketHandling() {
    if (!this.wss) return;

    this.wss.on('connection', (ws, request) => {
      console.log('[WS Proxy] New WebSocket connection established');
      
      this.connections.add(ws);

      // Send immediate connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        clientId: Math.random().toString(36).substr(2, 9),
        message: 'Connected to trading WebSocket server',
        timestamp: Date.now()
      }));

      // Handle messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('[WS Proxy] Message parsing error:', error);
        }
      });

      // Handle disconnection
      ws.on('close', (code, reason) => {
        console.log(`[WS Proxy] Connection closed - Code: ${code}`);
        this.connections.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('[WS Proxy] WebSocket error:', error);
        this.connections.delete(ws);
      });
    });

    console.log('[WS Proxy] WebSocket server attached to HTTP server on /ws path');
  }

  private handleMessage(ws: any, message: any) {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      
      case 'subscribe':
        console.log('[WS Proxy] Subscribe request:', message.symbols);
        // Handle subscription logic here
        break;
      
      case 'order_notification':
        // Broadcast order notifications to all connected clients
        this.broadcast(message);
        break;
      
      default:
        console.log('[WS Proxy] Unknown message type:', message.type);
        break;
    }
  }

  public broadcast(message: any) {
    const messageString = JSON.stringify(message);
    let sent = 0;

    this.connections.forEach((ws) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        try {
          ws.send(messageString);
          sent++;
        } catch (error) {
          console.error('[WS Proxy] Broadcast error:', error);
          this.connections.delete(ws);
        }
      }
    });

    return { sent, total: this.connections.size };
  }

  public getStats() {
    return {
      activeConnections: this.connections.size,
      serverReady: !!this.wss,
      timestamp: Date.now()
    };
  }

  public shutdown() {
    console.log('[WS Proxy] Shutting down WebSocket proxy');
    
    if (this.wss) {
      this.wss.close();
    }
    
    this.connections.forEach((ws) => {
      if (ws.readyState === 1) {
        ws.close(1000, 'Server shutdown');
      }
    });
    
    this.connections.clear();
  }
}