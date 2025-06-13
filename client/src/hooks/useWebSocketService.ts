import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';
import { audioService } from '../services/audioService';

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
  sendMessage: (message: any) => void;
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

// Global WebSocket instance to prevent multiple connections
let globalWsInstance: WebSocket | null = null;
let globalWsStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
let globalWsSubscribers = new Set<(data: any) => void>();
let globalWsConnectedCallbacks = new Set<() => void>();
let globalWsDisconnectedCallbacks = new Set<() => void>();
let globalWsErrorCallbacks = new Set<(error: Event) => void>();

export function usePublicWebSocket(options: WebSocketHookOptions = {}): PublicWebSocketService {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>(globalWsStatus);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(globalWsInstance);

  // Handle order fill notifications with audio alerts
  const handleOrderFillNotification = useCallback(async (orderData: any) => {
    try {
      console.log(`[AUDIO NOTIFICATION] 🔊 Order fill detected:`, orderData);
      console.log(`[AUDIO NOTIFICATION] Order Type: ${orderData.orderType}`);
      console.log(`[AUDIO NOTIFICATION] Symbol: ${orderData.symbol}`);
      console.log(`[AUDIO NOTIFICATION] Side: ${orderData.side}`);
      console.log(`[AUDIO NOTIFICATION] Price: $${parseFloat(orderData.price || '0').toFixed(6)}`);
      
      // Get notification settings from localStorage (with defaults)
      const notificationSettings = {
        soundNotificationsEnabled: localStorage.getItem('soundNotificationsEnabled') !== 'false',
        takeProfitSoundEnabled: localStorage.getItem('takeProfitSoundEnabled') !== 'false',
        safetyOrderSoundEnabled: localStorage.getItem('safetyOrderSoundEnabled') !== 'false', 
        baseOrderSoundEnabled: localStorage.getItem('baseOrderSoundEnabled') !== 'false',
        takeProfitSound: localStorage.getItem('takeProfitSound') || 'chin-chin',
        safetyOrderSound: localStorage.getItem('safetyOrderSound') || 'beep',
        baseOrderSound: localStorage.getItem('baseOrderSound') || 'notification',
        notificationVolume: parseFloat(localStorage.getItem('notificationVolume') || '0.5')
      };

      // Determine order type for audio notification
      let audioOrderType: 'take_profit' | 'safety_order' | 'base_order' = 'base_order';
      
      if (orderData.orderType === 'take_profit') {
        audioOrderType = 'take_profit';
      } else if (orderData.orderType === 'safety_order') {
        audioOrderType = 'safety_order';
      } else if (orderData.orderType === 'base_order') {
        audioOrderType = 'base_order';
      }

      // Play audio notification
      await audioService.playOrderFillNotification(audioOrderType, notificationSettings);
      
      console.log(`[AUDIO NOTIFICATION] ✅ Played ${audioOrderType} sound notification`);
      
    } catch (error) {
      console.error('[AUDIO NOTIFICATION] Error playing order fill sound:', error);
    }
  }, []);

  const connect = useCallback((symbols?: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    
    // In development, use port 8080 for WebSocket
    // In production/deployment, use the same port as the main application
    let wsUrl;
    if (window.location.port && window.location.port !== '80' && window.location.port !== '443') {
      // Development mode - use current port or 8080 for WebSocket
      const isDev = window.location.port === '5173' || window.location.port === '3000';
      const wsPort = isDev ? '8080' : window.location.port;
      wsUrl = `${protocol}//${hostname}:${wsPort}/api/ws`;
    } else {
      // Production mode - use same host without explicit port
      wsUrl = `${protocol}//${hostname}/api/ws`;
    }
    
    console.log(`[CLIENT WS] Connecting to: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[CLIENT WS] ===== CONNECTED TO BACKEND SERVER =====');
      console.log(`[CLIENT WS] Connected to: ${wsUrl}`);
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
        
        // Handle order fill notifications with sound alerts
        if (data.type === 'order_fill_notification') {
          handleOrderFillNotification(data.data);
        }
        
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

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
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
    sendMessage,
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