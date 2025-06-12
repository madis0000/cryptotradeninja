import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

/**
 * Simple WebSocket implementation focused on stability
 */
export class SimpleWebSocket {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      // Minimal configuration for maximum compatibility
      perMessageDeflate: false,
      maxPayload: 16 * 1024, // 16KB
      skipUTF8Validation: false,
      clientTracking: false
    });

    this.setupHandlers();
    console.log('[Simple WS] WebSocket server ready on /ws');
  }

  private setupHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[Simple WS] New client connected');
      this.clients.add(ws);

      // Send immediate confirmation
      this.send(ws, { type: 'connected', message: 'WebSocket ready' });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (err) {
          console.warn('[Simple WS] Invalid message format');
        }
      });

      ws.on('close', () => {
        console.log('[Simple WS] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('[Simple WS] Client error:', err.message);
        this.clients.delete(ws);
      });
    });
  }

  private handleMessage(ws: WebSocket, message: any) {
    if (message.type === 'subscribe' && message.dataType === 'ticker') {
      console.log('[Simple WS] Ticker subscription:', message.symbols);
      
      // Acknowledge subscription
      this.send(ws, {
        type: 'subscribed',
        dataType: 'ticker',
        symbols: message.symbols
      });

      // Start sending mock ticker data for testing
      this.startMockData(ws, message.symbols);
    }
  }

  private startMockData(ws: WebSocket, symbols: string[]) {
    const interval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }

      // Send mock data for one random symbol
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const price = (Math.random() * 100 + 1).toFixed(8);
      
      this.send(ws, {
        type: 'ticker_update',
        symbol,
        price,
        priceChange: '0.00000000',
        priceChangePercent: '0.00',
        volume: '1000000.00000000',
        timestamp: Date.now()
      });
    }, 2000);
  }

  private send(ws: WebSocket, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (err) {
        console.error('[Simple WS] Send error:', err);
      }
    }
  }

  public broadcast(data: any) {
    this.clients.forEach(ws => this.send(ws, data));
  }

  public getStats() {
    return {
      clients: this.clients.size,
      uptime: Date.now()
    };
  }
}