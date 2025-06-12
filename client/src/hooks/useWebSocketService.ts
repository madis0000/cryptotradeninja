import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';

interface WebSocketHookOptions {
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface PublicWebSocketService {
  connect: (symbols?: string[]) => void;
  disconnect: () => void;
  subscribe: (symbols: string[]) => void;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastMessage: any;
}

interface UserWebSocketService {
  connect: (apiKey?: string) => void;
  disconnect: () => void;
  authenticate: (userId: number, apiKey?: string) => void;
  sendMessage: (message: any) => void;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastMessage: any;
}

export function usePublicWebSocket(options: WebSocketHookOptions = {}): PublicWebSocketService {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback((symbols?: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    
    // Connect to backend WebSocket server (dedicated port 8080)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    const wsPort = '8080';
    const ws = new WebSocket(`${protocol}//${hostname}:${wsPort}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[CLIENT WS] ===== CONNECTED TO BACKEND SERVER =====');
      console.log(`[CLIENT WS] Connected to: ${protocol}//${hostname}:${wsPort}/api/ws`);
      setStatus('connected');
      options.onConnect?.();
      
      // Send subscription command to backend with configured symbols
      const symbolsToUse = symbols || ['BTCUSDT'];
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
        setLastMessage(data);
        options.onMessage?.(data);
      } catch (error) {
        console.error('[CLIENT WS] Error parsing message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log(`[CLIENT WS] Connection closed - Code: ${event.code}, Reason: ${event.reason}`);
      setStatus('disconnected');
      options.onDisconnect?.();
    };

    ws.onerror = (error) => {
      console.error('[CLIENT WS] Connection error:', error);
      console.error('[CLIENT WS] Error details:', {
        readyState: ws.readyState,
        url: ws.url,
        protocol: ws.protocol
      });
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[CLIENT WS] Component unmounting - cleaning up WebSocket connection');
      disconnect();
    };
  }, [disconnect]);

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

  const connect = useCallback((apiKey?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    
    // Connect to our unified WebSocket service on same port as HTTP server
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const ws = new WebSocket(`${protocol}//${hostname}:${port}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Authenticate with user ID and optional API key for WebSocket API
      if (user?.id) {
        ws.send(JSON.stringify({
          type: 'authenticate',
          userId: user.id,
          apiKey: apiKey || undefined
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('User WebSocket data:', data);
        setLastMessage(data);
        
        if (data.type === 'authenticated') {
          setStatus('connected');
          options.onConnect?.();
        } else if (data.type === 'user_stream_connected') {
          console.log('User data stream connected successfully');
          options.onMessage?.(data);
        } else if (data.type === 'user_stream_unavailable') {
          console.log('User stream unavailable:', data.message);
          // Still consider connection successful for public data
          setStatus('connected');
          options.onMessage?.(data);
        } else if (data.type === 'user_stream_error') {
          console.log('User stream error:', data.message);
          // Connection to our service succeeded, but user stream failed
          setStatus('connected');
          options.onMessage?.(data);
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

  const authenticate = useCallback((userId: number, apiKey?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'authenticate',
        userId,
        apiKey
      }));
    }
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[USER WS] Sending message:', message);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('[USER WS] Cannot send message - WebSocket not connected');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[USER WS] Component unmounting - cleaning up WebSocket connection');
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    authenticate,
    sendMessage,
    status,
    lastMessage
  };
}