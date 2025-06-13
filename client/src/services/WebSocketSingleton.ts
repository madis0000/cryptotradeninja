class WebSocketSingleton {
  private static instance: WebSocketSingleton;
  private ws: WebSocket | null = null;
  private status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private subscribers = new Set<(data: any) => void>();
  private connectionCallbacks = new Set<() => void>();
  private disconnectionCallbacks = new Set<() => void>();
  private errorCallbacks = new Set<(error: Event) => void>();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageQueue: any[] = [];

  private constructor() {}

  public static getInstance(): WebSocketSingleton {
    if (!WebSocketSingleton.instance) {
      WebSocketSingleton.instance = new WebSocketSingleton();
    }
    return WebSocketSingleton.instance;
  }

  public async connect(symbols?: string[]): Promise<void> {
    // Comprehensive connection state checking to prevent duplicates
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (this.status === 'connecting') {
      return;
    }

    // Clean up any existing connection
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      try {
        this.ws.close();
      } catch (e) {
        // Silent cleanup
      }
    }

    this.status = 'connecting';
    
    // If no symbols provided, fetch active bot symbols
    let symbolsToUse = symbols;
    if (!symbolsToUse) {
      try {
        const response = await fetch('/api/active-bot-symbols', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          symbolsToUse = data.symbols;
          console.log('[WS SINGLETON] Fetched active bot symbols:', symbolsToUse);
        } else {
          // Fallback to basic symbols if API fails
          symbolsToUse = ['BTCUSDT'];
          console.log('[WS SINGLETON] Failed to fetch active symbols, using fallback');
        }
      } catch (error) {
        console.error('[WS SINGLETON] Error fetching active symbols:', error);
        symbolsToUse = ['BTCUSDT'];
      }
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    
    // In development, use port 8080 for WebSocket
    // In production/deployment, use the same port as the main application
    let wsUrl;
    
    // Check if we're in development environment
    const isDev = window.location.port === '5173' || window.location.port === '3000' || 
                  hostname === 'localhost' || hostname === '127.0.0.1' || 
                  hostname.includes('replit.dev');
    
    if (isDev && !hostname.includes('.replit.app')) {
      // Development mode - always use port 8080 for WebSocket
      wsUrl = `${protocol}//${hostname}:8080/api/ws`;
    } else {
      // Production mode - use same host and port as main application
      const port = window.location.port;
      if (port && port !== '80' && port !== '443') {
        wsUrl = `${protocol}//${hostname}:${port}/api/ws`;
      } else {
        wsUrl = `${protocol}//${hostname}/api/ws`;
      }
    }
    
    console.log(`[CLIENT WS] Connecting to: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);
    this.setupEventHandlers(symbolsToUse);
  }

  private setupEventHandlers(symbols?: string[]): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('[WS SINGLETON] Connected to backend WebSocket server');
      this.status = 'connected';
      this.reconnectAttempts = 0;
      
      // Send any queued messages
      while (this.messageQueue.length > 0) {
        const queuedMessage = this.messageQueue.shift();
        console.log('[WS SINGLETON] Sending queued message:', queuedMessage);
        this.ws!.send(JSON.stringify(queuedMessage));
      }
      
      // Notify all connection callbacks
      this.connectionCallbacks.forEach(callback => callback());
      
      // Send test message to verify connection
      console.log('[WS SINGLETON] Sending connection test message');
      this.sendMessage({ type: 'test', message: 'connection_test' });
      
      // Send subscription command with symbols
      const symbolsToUse = symbols || ['BTCUSDT'];
      const subscribeMessage = {
        type: 'subscribe',
        symbols: symbolsToUse
      };
      console.log('[WS SINGLETON] Sending initial subscription:', subscribeMessage);
      this.sendMessage(subscribeMessage);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Broadcast to all subscribers
        this.subscribers.forEach(callback => callback(data));
      } catch (error) {
        console.error('[WS SINGLETON] Error parsing message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[WS SINGLETON] Connection closed - Code: ${event.code}`);
      this.status = 'disconnected';
      this.ws = null;
      
      // Notify all disconnection callbacks
      this.disconnectionCallbacks.forEach(callback => callback());
      
      // Attempt reconnection if not intentionally closed
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WS SINGLETON] Connection error:', error);
      this.status = 'error';
      
      // Notify all error callbacks
      this.errorCallbacks.forEach(callback => callback(error));
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      console.log(`[WS SINGLETON] Reconnection attempt ${this.reconnectAttempts}`);
      this.connect();
    }, delay);
  }

  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    
    this.status = 'disconnected';
    this.reconnectAttempts = 0;
  }

  public sendMessage(message: any): void {
    console.log('[WS SINGLETON] Attempting to send message:', message);
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WS SINGLETON] Sending message immediately');
      this.ws.send(JSON.stringify(message));
    } else {
      console.log('[WS SINGLETON] Connection not ready, queuing message');
      this.messageQueue.push(message);
    }
  }

  public subscribe(callback: (data: any) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  public onConnect(callback: () => void): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }

  public onDisconnect(callback: () => void): () => void {
    this.disconnectionCallbacks.add(callback);
    return () => this.disconnectionCallbacks.delete(callback);
  }

  public onError(callback: (error: Event) => void): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  public getStatus(): string {
    return this.status;
  }

  public isConnected(): boolean {
    return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }
}

export const webSocketSingleton = WebSocketSingleton.getInstance();