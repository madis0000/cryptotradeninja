import { useWebSocketManager } from '@/hooks/useWebSocketManager';
import { audioService } from './audioService';

interface OrderFillNotification {
  type: 'order_fill';
  data: {
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: 'base_order' | 'safety_order' | 'take_profit';
    quantity: string;
    price: string;
    botId: number;
    cycleId?: number;
  };
}

interface MarketUpdate {
  type: 'market_update';
  data: {
    symbol: string;
    price: string;
    priceChange: string;
    priceChangePercent: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
    timestamp: number;
  };
}

type WebSocketMessage = OrderFillNotification | MarketUpdate | any;

export class WebSocketConnectionService {
  private static instance: WebSocketConnectionService;
  private connections = new Map<string, any>();
  private userSettings: any = null;

  private constructor() {}

  public static getInstance(): WebSocketConnectionService {
    if (!WebSocketConnectionService.instance) {
      WebSocketConnectionService.instance = new WebSocketConnectionService();
    }
    return WebSocketConnectionService.instance;
  }

  public setUserSettings(settings: any) {
    this.userSettings = settings;
  }

  public createConnection(connectionId: string, url: string, options: any = {}) {
    // Close existing connection if it exists
    if (this.connections.has(connectionId)) {
      this.closeConnection(connectionId);
    }

    const connection = {
      id: connectionId,
      url,
      isConnected: false,
      ws: null as WebSocket | null,
      reconnectAttempts: 0,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      reconnectDelay: options.reconnectDelay || 1000,
      autoReconnect: options.autoReconnect !== false,
      listeners: new Set<(message: any) => void>(),
    };

    this.connections.set(connectionId, connection);
    this.connect(connectionId);
    
    return connection;
  }

  private connect(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      console.log(`[WS Connection] Connecting to ${connection.url} (${connectionId})`);
      
      connection.ws = new WebSocket(connection.url);

      connection.ws.onopen = () => {
        console.log(`[WS Connection] Connected to ${connection.url} (${connectionId})`);
        connection.isConnected = true;
        connection.reconnectAttempts = 0;
      };

      connection.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Handle order fill notifications with audio
          if (message.type === 'order_fill') {
            this.handleOrderFillNotification(message);
          }

          // Broadcast to all listeners
          connection.listeners.forEach(listener => {
            try {
              listener(message);
            } catch (error) {
              console.warn(`[WS Connection] Listener error:`, error);
            }
          });
        } catch (error) {
          console.warn(`[WS Connection] Failed to parse message:`, error);
        }
      };

      connection.ws.onclose = (event) => {
        console.log(`[WS Connection] Connection closed - ${connectionId} - Code: ${event.code}`);
        connection.isConnected = false;
        connection.ws = null;

        // Auto-reconnect if enabled
        if (connection.autoReconnect && connection.reconnectAttempts < connection.maxReconnectAttempts) {
          const delay = Math.min(connection.reconnectDelay * Math.pow(2, connection.reconnectAttempts), 30000);
          console.log(`[WS Connection] Reconnecting ${connectionId} in ${delay}ms`);
          
          setTimeout(() => {
            if (this.connections.has(connectionId)) {
              connection.reconnectAttempts++;
              this.connect(connectionId);
            }
          }, delay);
        }
      };

      connection.ws.onerror = (error) => {
        console.error(`[WS Connection] Error in ${connectionId}:`, error);
      };

    } catch (error) {
      console.error(`[WS Connection] Failed to create connection ${connectionId}:`, error);
    }
  }

  private async handleOrderFillNotification(message: OrderFillNotification) {
    console.log(`[Audio Notification] Order filled:`, message.data);
    
    try {
      await audioService.playOrderFillNotification(
        message.data.orderType,
        this.userSettings
      );
    } catch (error) {
      console.warn(`[Audio Notification] Failed to play sound:`, error);
    }
  }

  public addMessageListener(connectionId: string, listener: (message: any) => void) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.listeners.add(listener);
    }
  }

  public removeMessageListener(connectionId: string, listener: (message: any) => void) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.listeners.delete(listener);
    }
  }

  public sendMessage(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId);
    if (connection?.ws?.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public closeConnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      if (connection.ws) {
        connection.ws.close(1000, 'Connection closed by client');
      }
      this.connections.delete(connectionId);
      console.log(`[WS Connection] Closed connection: ${connectionId}`);
    }
  }

  public getConnection(connectionId: string) {
    return this.connections.get(connectionId);
  }

  public isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return connection?.isConnected || false;
  }

  public closeAllConnections() {
    console.log(`[WS Connection] Closing all connections`);
    for (const connectionId of this.connections.keys()) {
      this.closeConnection(connectionId);
    }
  }
}

export const wsConnectionService = WebSocketConnectionService.getInstance();