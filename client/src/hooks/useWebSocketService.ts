import { useState, useRef, useCallback, useEffect } from 'react';

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WebSocketOptions {
  symbols?: string[];
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
}

export const useWebSocketService = () => {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const getWebSocketURL = useCallback(() => {
    const isSecure = window.location.protocol === 'https:';
    const hostname = window.location.hostname;
    const currentPort = window.location.port;
    
    console.log('[CLIENT WS] Environment detection:', { isSecure, hostname, currentPort });
    
    // Always use the same server with /trading-ws path
    // This works for both HTTP and HTTPS since WebSocket server is attached to the main HTTP server
    const protocol = isSecure ? 'wss:' : 'ws:';
    let wsUrl: string;
    
    if (currentPort) {
      wsUrl = `${protocol}//${hostname}:${currentPort}/trading-ws`;
    } else {
      wsUrl = `${protocol}//${hostname}/trading-ws`;
    }
    
    console.log('[CLIENT WS] WebSocket URL:', wsUrl);
    return [wsUrl];
  }, []);

  const connectToWebSocket = useCallback(async (options: WebSocketOptions = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[CLIENT WS] Already connected');
      return;
    }

    setStatus('connecting');
    
    const urls = getWebSocketURL();
    console.log('[CLIENT WS] Attempting connections:', urls);
    
    // Try each URL sequentially
    for (const url of urls) {
      try {
        console.log(`[CLIENT WS] Trying: ${url}`);
        
        const ws = new WebSocket(url);
        wsRef.current = ws;

        // Set up event listeners
        ws.onopen = () => {
          console.log('[CLIENT WS] ===== CONNECTED TO BACKEND SERVER =====');
          console.log(`[CLIENT WS] Connected to: ${url}`);
          setStatus('connected');
          reconnectAttemptsRef.current = 0;
          options.onConnect?.();
          
          // Send subscription command
          const symbolsToUse = options.symbols || ['BTCUSDT'];
          const subscribeMessage = {
            type: 'subscribe',
            symbols: symbolsToUse
          };
          console.log('[CLIENT WS] Sending configured symbols to backend:', subscribeMessage);
          ws.send(JSON.stringify(subscribeMessage));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[CLIENT WS] Received message:', data);
            options.onMessage?.(data);
          } catch (error) {
            console.error('[CLIENT WS] Failed to parse message:', error, event.data);
          }
        };

        ws.onclose = (event) => {
          console.log(`[CLIENT WS] Connection closed - Code: ${event.code}, Reason: ${event.reason}`);
          setStatus('disconnected');
          options.onDisconnect?.();
          
          // Auto-reconnect logic
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            console.log(`[CLIENT WS] Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connectToWebSocket(options);
            }, reconnectDelay);
          } else {
            console.error('[CLIENT WS] Max reconnection attempts reached');
            setStatus('error');
          }
        };

        ws.onerror = (error) => {
          console.error('[CLIENT WS] Connection error:', error);
          options.onError?.(error);
          
          // Close and try next URL
          ws.close();
          setStatus('error');
        };

        // Successfully created WebSocket, wait for connection
        return;
        
      } catch (error) {
        console.warn(`[CLIENT WS] Failed to create WebSocket for ${url}:`, error);
        continue;
      }
    }
    
    // All attempts failed
    console.error('[CLIENT WS] All connection attempts failed');
    setStatus('error');
  }, [getWebSocketURL]);

  const disconnect = useCallback(() => {
    console.log('[CLIENT WS] Manually disconnecting...');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent auto-reconnect
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setStatus('disconnected');
  }, []);

  const sendMessage = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('[CLIENT WS] Cannot send message - not connected');
      return false;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[CLIENT WS] Component unmounting - cleaning up WebSocket connection');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    status,
    connect: connectToWebSocket,
    disconnect,
    sendMessage,
    isConnected: status === 'connected'
  };
};

// Market data WebSocket hook
export const useMarketWebSocket = (symbols: string[] = ['BTCUSDT']) => {
  const [marketData, setMarketData] = useState<Record<string, any>>({});
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const handleMessage = useCallback((data: any) => {
    if (data.type === 'ticker') {
      setMarketData(prev => ({
        ...prev,
        [data.symbol]: data
      }));
      setLastUpdate(new Date());
    }
  }, []);

  const webSocket = useWebSocketService();

  const connect = useCallback(() => {
    webSocket.connect({
      symbols,
      onMessage: handleMessage,
      onConnect: () => console.log('[MARKET WS] Connected to market data stream'),
      onDisconnect: () => console.log('[MARKET WS] Disconnected from market data stream'),
      onError: (error) => console.error('[MARKET WS] WebSocket error:', error)
    });
  }, [symbols, handleMessage, webSocket]);

  return {
    ...webSocket,
    connect,
    marketData,
    lastUpdate
  };
};

// Public WebSocket interface (for compatibility)
interface PublicWebSocketService {
  connect: (symbols?: string[]) => void;
  disconnect: () => void;
  subscribe: (symbols: string[]) => void;
  status: WebSocketStatus;
  lastMessage: any;
}

interface WebSocketHookOptions {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
}

export function usePublicWebSocket(options: WebSocketHookOptions = {}): PublicWebSocketService {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const webSocket = useWebSocketService();

  const handleMessage = useCallback((data: any) => {
    setLastMessage(data);
    options.onMessage?.(data);
  }, [options]);

  const connect = useCallback((symbols?: string[]) => {
    webSocket.connect({
      symbols: symbols || ['BTCUSDT'],
      onMessage: handleMessage,
      onConnect: options.onConnect,
      onDisconnect: options.onDisconnect,
      onError: options.onError
    });
  }, [webSocket, handleMessage, options]);

  const subscribe = useCallback((symbols: string[]) => {
    if (webSocket.isConnected) {
      webSocket.sendMessage({
        type: 'subscribe',
        symbols
      });
    }
  }, [webSocket]);

  return {
    connect,
    disconnect: webSocket.disconnect,
    subscribe,
    status: webSocket.status,
    lastMessage
  };
}

// User WebSocket interface (for authenticated connections)
interface UserWebSocketService {
  connect: (apiKey?: string) => void;
  disconnect: () => void;
  authenticate: (userId: number, apiKey?: string) => void;
  sendMessage: (message: any) => void;
  status: WebSocketStatus;
  lastMessage: any;
}

export function useUserWebSocket(options: WebSocketHookOptions = {}): UserWebSocketService {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const webSocket = useWebSocketService();

  const handleMessage = useCallback((data: any) => {
    setLastMessage(data);
    
    // Handle authentication responses
    if (data.type === 'authenticated') {
      options.onConnect?.();
    } else if (data.type === 'error') {
      options.onError?.(new Event(data.message));
    } else {
      options.onMessage?.(data);
      
      // Emit custom event for order notifications to enable audio notifications
      if (data.type === 'order_notification') {
        window.dispatchEvent(new CustomEvent('websocket-message', { detail: data }));
      }
    }
  }, [options]);

  const connect = useCallback((apiKey?: string) => {
    webSocket.connect({
      onMessage: handleMessage,
      onConnect: () => {
        // Auto-authenticate when connected if we have user context
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user?.id) {
          authenticate(user.id, apiKey);
        }
      },
      onDisconnect: options.onDisconnect,
      onError: options.onError
    });
  }, [webSocket, handleMessage, options]);

  const authenticate = useCallback((userId: number, apiKey?: string) => {
    if (webSocket.isConnected) {
      webSocket.sendMessage({
        type: 'authenticate',
        userId,
        apiKey
      });
    }
  }, [webSocket]);

  const sendMessage = useCallback((message: any) => {
    if (webSocket.isConnected) {
      console.log('[USER WS] Sending message:', message);
      webSocket.sendMessage(message);
    } else {
      console.error('[USER WS] Cannot send message - WebSocket not connected');
    }
  }, [webSocket]);

  return {
    connect,
    disconnect: webSocket.disconnect,
    authenticate,
    sendMessage,
    status: webSocket.status,
    lastMessage
  };
}