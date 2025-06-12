import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

/**
 * Minimal WebSocket solution that eliminates port conflicts with Vite HMR
 * Uses HTTP upgrade on /api/ws path to avoid conflicting with Vite's WebSocket
 */
export class MinimalWebSocket {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocket>();

  constructor(server: Server) {
    // Create WebSocket server using HTTP upgrade on /api/ws path
    this.wss = new WebSocketServer({ 
      server: server,
      path: '/api/ws',
      // Enhanced configuration for stability
      perMessageDeflate: false,
      maxPayload: 1024 * 1024, // 1MB limit
      clientTracking: true
    });

    this.setupConnectionHandling();
    console.log('[Minimal WS] WebSocket server attached to HTTP server on /api/ws path');
  }

  private setupConnectionHandling() {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      this.connections.set(clientId, ws);
      
      console.log(`[Minimal WS] Client ${clientId} connected`);
      
      // Configure WebSocket settings for better stability
      ws.binaryType = 'nodebuffer';
      
      // Send immediate connection confirmation
      this.sendToClient(ws, {
        type: 'connected',
        clientId,
        message: 'Connected to backend server',
        timestamp: Date.now()
      });

      // Set up keepalive mechanism
      const keepaliveInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          this.sendToClient(ws, {
            type: 'keepalive',
            timestamp: Date.now()
          });
        } else {
          clearInterval(keepaliveInterval);
        }
      }, 30000); // Send keepalive every 30 seconds

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message, clientId);
        } catch (error) {
          console.error(`[Minimal WS] Message parsing error for ${clientId}:`, error);
        }
      });

      // Handle connection close
      ws.on('close', (code, reason) => {
        console.log(`[Minimal WS] Client ${clientId} disconnected: ${code}`);
        clearInterval(keepaliveInterval);
        this.connections.delete(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[Minimal WS] Client ${clientId} error:`, error);
        clearInterval(keepaliveInterval);
        this.connections.delete(clientId);
      });

      // Handle pong responses
      ws.on('pong', () => {
        // Connection is alive, no action needed
      });
    });
  }

  private handleMessage(ws: WebSocket, message: any, clientId: string) {
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, { 
          type: 'pong', 
          timestamp: Date.now(),
          clientId 
        });
        break;
        
      case 'subscribe':
        console.log(`[Minimal WS] Subscribe request from ${clientId}:`, message.symbols);
        this.sendToClient(ws, {
          type: 'subscription_confirmed',
          symbols: message.symbols || [],
          clientId
        });
        break;
        
      case 'configure_stream':
        console.log(`[Minimal WS] Stream configuration from ${clientId}:`, message.dataType, message.symbols);
        this.sendToClient(ws, {
          type: 'stream_configured',
          dataType: message.dataType,
          symbols: message.symbols || [],
          interval: message.interval,
          clientId
        });
        break;
        
      case 'order_notification':
        // Broadcast order notifications to all connected clients
        this.broadcast({
          ...message,
          timestamp: Date.now()
        });
        break;
        
      default:
        // Don't log unknown message types to reduce noise
        break;
    }
  }

  private sendToClient(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[Minimal WS] Send error:', error);
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
          console.error(`[Minimal WS] Broadcast error for ${clientId}:`, error);
          failed++;
          this.connections.delete(clientId);
        }
      } else {
        this.connections.delete(clientId);
      }
    });

    return { sent, failed, total: this.connections.size };
  }

  public sendToClientId(clientId: string, message: any) {
    const ws = this.connections.get(clientId);
    if (ws) {
      this.sendToClient(ws, message);
      return true;
    }
    return false;
  }

  private generateClientId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  public getConnectionStats() {
    return {
      activeConnections: this.connections.size,
      connectionIds: Array.from(this.connections.keys()),
      timestamp: Date.now()
    };
  }

  public shutdown() {
    console.log('[Minimal WS] Shutting down WebSocket server');
    
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