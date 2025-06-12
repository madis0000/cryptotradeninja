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
    const isDev = import.meta.env.DEV;
    
    console.log('[CLIENT WS] Environment detection:', { isSecure, hostname, currentPort, isDev });
    
    // Connection priority order
    const attempts = [];
    
    if (isSecure) {
      // HTTPS environment: Must use secure WebSocket
      if (currentPort) {
        attempts.push(`wss://${hostname}:${currentPort}/trading-ws`);
      }
      attempts.push(`wss://${hostname}/trading-ws`);
    } else {
      // HTTP environment: Can use insecure WebSocket
      if (isDev && hostname === 'localhost') {
        attempts.push(`ws://${hostname}:3001/ws`);
      }
      if (currentPort) {
        attempts.push(`ws://${hostname}:${currentPort}/trading-ws`);
      }
      attempts.push(`ws://${hostname}/trading-ws`);
    }
    
    return attempts;
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