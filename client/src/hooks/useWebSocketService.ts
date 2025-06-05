import { useState, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';

interface WebSocketHookOptions {
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface PublicWebSocketService {
  connect: () => void;
  disconnect: () => void;
  subscribe: (symbols: string[]) => void;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastMessage: any;
}

interface UserWebSocketService {
  connect: (listenKey: string) => void;
  disconnect: () => void;
  authenticate: (userId: number, listenKey: string) => void;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastMessage: any;
}

export function usePublicWebSocket(options: WebSocketHookOptions = {}): PublicWebSocketService {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    
    // Connect to our public WebSocket service
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const ws = new WebSocket(`${protocol}//${host}:8081/market`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      options.onConnect?.();
      
      // Subscribe to default symbols
      ws.send(JSON.stringify({
        type: 'subscribe',
        symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'BNBUSDT', 'DOGEUSDT']
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        options.onMessage?.(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      options.onDisconnect?.();
    };

    ws.onerror = (error) => {
      setStatus('error');
      options.onError?.(error);
    };
  }, [options]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const subscribe = useCallback((symbols: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        symbols
      }));
    }
  }, []);

  return {
    connect,
    disconnect,
    subscribe,
    status,
    lastMessage
  };
}

export function useUserWebSocket(options: WebSocketHookOptions = {}): UserWebSocketService {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { user } = useAuth();

  const connect = useCallback((listenKey: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    
    // Connect to our user WebSocket service
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const ws = new WebSocket(`${protocol}//${host}:8082/user`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Authenticate with user ID and listen key
      if (user?.id && listenKey) {
        ws.send(JSON.stringify({
          type: 'authenticate',
          userId: user.id,
          listenKey
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        
        if (data.type === 'authenticated') {
          setStatus('connected');
          options.onConnect?.();
        } else if (data.type === 'error') {
          setStatus('error');
          options.onError?.(new Event(data.message));
        } else {
          options.onMessage?.(data);
        }
      } catch (error) {
        console.error('Error parsing user WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      options.onDisconnect?.();
    };

    ws.onerror = (error) => {
      setStatus('error');
      options.onError?.(error);
    };
  }, [user, options]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const authenticate = useCallback((userId: number, listenKey: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'authenticate',
        userId,
        listenKey
      }));
    }
  }, []);

  return {
    connect,
    disconnect,
    authenticate,
    status,
    lastMessage
  };
}