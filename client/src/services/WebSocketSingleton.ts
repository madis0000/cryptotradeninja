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
  private referenceCount = 0; // Track active component references
  private currentSymbol: string = 'BTCUSDT';
  private currentInterval: string = '4h';

  private constructor() {
    // Add page visibility handler to clean up WebSocket when page is hidden
    this.setupPageVisibilityHandler();
    
    // Add beforeunload handler to clean up WebSocket before page unload
    this.setupBeforeUnloadHandler();
  }

  public static getInstance(): WebSocketSingleton {
    if (!WebSocketSingleton.instance) {
      WebSocketSingleton.instance = new WebSocketSingleton();
    }
    return WebSocketSingleton.instance;
  }

  public async connect(symbols?: string[]): Promise<void> {
    // Check if already connected or connecting to prevent duplicates
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WS SINGLETON] Already connected, skipping connect()');
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('[WS SINGLETON] Already connecting, skipping connect()');
      return;
    }

    if (this.status === 'connecting') {
      console.log('[WS SINGLETON] Status is connecting, skipping connect()');
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
    console.log('[WS SINGLETON] Starting new WebSocket connection...');
    
    // If no symbols provided, use default symbols for testing
    let symbolsToUse = symbols;
    if (!symbolsToUse) {
      // Use default symbols instead of API call for testing
      symbolsToUse = ['BTCUSDT'];
      console.log('[WS SINGLETON] Using default symbols for testing:', symbolsToUse);
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
      // Development mode - use port 3001 for WebSocket (separate WebSocket server)
      wsUrl = `${protocol}//${hostname}:3001/api/ws`;
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
      
      // Restore previous subscriptions using current symbol
      console.log(`[WS SINGLETON] Restoring subscriptions for ${this.currentSymbol}`);
      this.sendMessage({
        type: 'subscribe',
        symbols: [this.currentSymbol]
      });
      
      this.sendMessage({
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [this.currentSymbol],
        interval: this.currentInterval
      });
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
    console.log('[WS SINGLETON] Disconnect requested');
    this.removeReference();
  }

  private performDisconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    
    this.status = 'disconnected';
    this.reconnectAttempts = 0;
    console.log('[WS SINGLETON] Disconnect complete');
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

  // Debug method to get current reference count
  public getReferenceCount(): number {
    return this.referenceCount;
  }

  public addReference(): void {
    this.referenceCount++;
    console.log(`[WS SINGLETON] Reference added, count: ${this.referenceCount}`);
  }

  public removeReference(): void {
    this.referenceCount = Math.max(0, this.referenceCount - 1);
    console.log(`[WS SINGLETON] Reference removed, count: ${this.referenceCount}`);
    
    // Only disconnect if no references remain
    if (this.referenceCount === 0) {
      console.log('[WS SINGLETON] No references remaining, scheduling disconnect');
      // Delay disconnect to allow for quick remounts
      setTimeout(() => {
        if (this.referenceCount === 0) {
          console.log('[WS SINGLETON] Still no references, disconnecting');
          this.performDisconnect();
        }
      }, 500); // 500ms delay - shorter than before
    }
  }

  public changeSymbolSubscription(symbol: string, interval: string = '4h'): void {
    if (!this.isConnected()) {
      console.log('[WS SINGLETON] Cannot change subscription - not connected');
      // Still update current symbol/interval for when connection is restored
      this.setCurrentSymbol(symbol, interval);
      return;
    }
    
    const previousSymbol = this.currentSymbol;
    const previousInterval = this.currentInterval;
    
    // Update current symbol/interval
    this.setCurrentSymbol(symbol, interval);
    
    console.log(`[WS SINGLETON] Changing subscription from ${previousSymbol}@${previousInterval} to ${symbol}@${interval}`);
    
    // Use the new efficient change subscription message
    this.sendMessage({
      type: 'change_subscription',
      symbol: symbol,
      interval: interval
    });
  }

  public unsubscribe(): void {
    if (!this.isConnected()) {
      console.log('[WS SINGLETON] Cannot unsubscribe - not connected');
      return;
    }
    
    console.log('[WS SINGLETON] Sending unsubscribe message');
    this.sendMessage({
      type: 'unsubscribe'
    });
  }

  public setCurrentSymbol(symbol: string, interval: string = '4h'): void {
    this.currentSymbol = symbol;
    this.currentInterval = interval;
  }

  public getCurrentSymbol(): string {
    return this.currentSymbol;
  }

  public getCurrentInterval(): string {
    return this.currentInterval;
  }

  private setupPageVisibilityHandler(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          console.log('[WS SINGLETON] Page hidden - keeping WebSocket alive for quick return');
          // Don't disconnect immediately - keep connection alive for quick tab switches
        } else if (document.visibilityState === 'visible' && this.status === 'disconnected') {
          console.log('[WS SINGLETON] Page visible - reconnecting WebSocket');
          // Small delay to ensure page is fully visible
          setTimeout(() => {
            this.connect();
          }, 1000);
        }
      });
    }
  }

  private setupBeforeUnloadHandler(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        console.log('[WS SINGLETON] Page unloading - sending unsubscribe message');
        if (this.ws?.readyState === WebSocket.OPEN) {
          try {
            // Send unsubscribe synchronously
            this.ws.send(JSON.stringify({ type: 'unsubscribe' }));
          } catch (error) {
            console.error('[WS SINGLETON] Error sending unsubscribe on unload:', error);
          }
        }
        this.performDisconnect();
      });
    }
  }
}

export const webSocketSingleton = WebSocketSingleton.getInstance();