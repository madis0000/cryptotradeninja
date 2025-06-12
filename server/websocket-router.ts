import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse } from 'url';
import { WebSocketService } from './websocket-service';

export class WebSocketRouter {
  private wss: WebSocketServer;
  private wsService: WebSocketService;

  constructor(server: Server) {
    // Create unified WebSocket server on the HTTP server
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      verifyClient: (info) => {
        // Accept all WebSocket connections on /ws path
        const url = parse(info.req.url || '', true);
        return url.pathname === '/ws';
      }
    });

    this.wsService = new WebSocketService(server);
    this.setupRouting();
  }

  private setupRouting() {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const url = parse(request.url || '', true);
      const pathname = url.pathname;
      
      console.log(`[WebSocket Router] New connection to ${pathname}`);
      
      // Route all /ws connections to the trading WebSocket service
      if (pathname === '/ws') {
        this.handleTradingWebSocket(ws, request);
      } else {
        console.log(`[WebSocket Router] Unknown path: ${pathname}`);
        ws.close(1008, 'Unknown WebSocket path');
      }
    });
  }

  private handleTradingWebSocket(ws: WebSocket, request: any) {
    // Set up the WebSocket connection for trading functionality
    console.log('[WebSocket Router] Setting up trading WebSocket connection');
    
    // Add client to WebSocket service using existing method
    this.wsService.addMarketDataClient(ws);
    
    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[WebSocket Router] Received message:', message.type);
        
        // Handle the message directly since there's no generic handleClientMessage method
        await this.handleWebSocketMessage(ws, message);
      } catch (error) {
        console.error('[WebSocket Router] Error parsing message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
      console.log(`[WebSocket Router] Connection closed - Code: ${code}, Reason: ${reason}`);
      this.wsService.removeMarketDataClient(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WebSocket Router] WebSocket error:', error);
      this.wsService.removeMarketDataClient(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId: this.generateClientId(),
      message: 'Connected to backend WebSocket server'
    }));
  }

  private async handleWebSocketMessage(ws: WebSocket, message: any) {
    // Route messages to appropriate handlers based on message type
    switch (message.type) {
      case 'subscribe':
        // Handle market data subscription
        if (message.symbols && Array.isArray(message.symbols)) {
          console.log('[WebSocket Router] Subscribing to symbols:', message.symbols);
          // The existing service should handle this through its internal routing
        }
        break;
      
      case 'configure_stream':
        // Handle stream configuration
        console.log('[WebSocket Router] Configuring stream:', message);
        break;
      
      case 'place_order':
        // Handle order placement
        console.log('[WebSocket Router] Order placement request:', message);
        break;
      
      default:
        console.log('[WebSocket Router] Unknown message type:', message.type);
        break;
    }
  }

  private generateClientId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  getWebSocketService(): WebSocketService {
    return this.wsService;
  }

  // Get connection statistics
  getStats() {
    return {
      totalConnections: this.wss.clients.size,
      timestamp: new Date().toISOString()
    };
  }

  // Broadcast to all connected clients
  broadcast(message: any) {
    const messageString = JSON.stringify(message);
    let sent = 0;
    let failed = 0;

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageString);
          sent++;
        } catch (error) {
          console.error('[WebSocket Router] Broadcast error:', error);
          failed++;
        }
      }
    });

    return { sent, failed };
  }

  // Close all connections gracefully
  closeAll() {
    console.log('[WebSocket Router] Closing all WebSocket connections');
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server shutdown');
      }
    });
  }
}