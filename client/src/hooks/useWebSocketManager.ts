import { useEffect, useRef, useState } from 'react';

interface WebSocketManagerConfig {
  url: string;
  protocols?: string | string[];
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onOpen?: () => void;
  onMessage?: (event: MessageEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

export const useWebSocketManager = (config: WebSocketManagerConfig) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountedRef = useRef(false);

  const connect = () => {
    if (isUnmountedRef.current || wsRef.current?.readyState === WebSocket.CONNECTING || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setConnectionState('connecting');
      console.log(`[WS Manager] Connecting to: ${config.url}`);
      
      wsRef.current = new WebSocket(config.url, config.protocols);

      wsRef.current.onopen = () => {
        if (isUnmountedRef.current) return;
        
        console.log(`[WS Manager] Connected to: ${config.url}`);
        setIsConnected(true);
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
        config.onOpen?.();
      };

      wsRef.current.onmessage = (event) => {
        if (isUnmountedRef.current) return;
        config.onMessage?.(event);
      };

      wsRef.current.onclose = (event) => {
        if (isUnmountedRef.current) return;
        
        console.log(`[WS Manager] Connection closed - Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
        setIsConnected(false);
        setConnectionState('disconnected');
        config.onClose?.(event);

        // Auto-reconnect if enabled and not a clean close
        if (config.autoReconnect && event.code !== 1000 && reconnectAttemptsRef.current < (config.maxReconnectAttempts || 10)) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // Exponential backoff, max 30s
          console.log(`[WS Manager] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isUnmountedRef.current) {
              reconnectAttemptsRef.current++;
              connect();
            }
          }, delay);
        }
      };

      wsRef.current.onerror = (event) => {
        if (isUnmountedRef.current) return;
        
        console.error(`[WS Manager] WebSocket error:`, event);
        setConnectionState('error');
        config.onError?.(event);
      };

    } catch (error) {
      console.error(`[WS Manager] Failed to create WebSocket connection:`, error);
      setConnectionState('error');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      console.log(`[WS Manager] Disconnecting from: ${config.url}`);
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionState('disconnected');
  };

  const sendMessage = (message: string | object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      wsRef.current.send(data);
      return true;
    }
    console.warn(`[WS Manager] Cannot send message - WebSocket not connected`);
    return false;
  };

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      disconnect();
    };
  }, [config.url]);

  return {
    isConnected,
    connectionState,
    sendMessage,
    connect,
    disconnect,
  };
};