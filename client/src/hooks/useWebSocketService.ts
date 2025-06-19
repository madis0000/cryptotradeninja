import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';
import { audioService } from '../services/audioService';
import { createSubscriptionMessage } from '../utils/websocket-helpers';

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

// Helper function to get first active exchange ID (fallback method)
async function getFirstActiveExchangeId(): Promise<number | null> {
  try {
    const response = await fetch('/api/exchanges');
    if (!response.ok) return null;
    
    const exchanges = await response.json();
    if (Array.isArray(exchanges) && exchanges.length > 0) {
      const activeExchange = exchanges.find((ex: any) => ex.isActive);
      return activeExchange?.id || exchanges[0].id;
    }
    return null;
  } catch (error) {
    console.error('[WS HOOK] Error fetching exchanges:', error);
    return null;
  }
}

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
    
    // Check if we're in development environment
    const isDev = window.location.port === '5173' || window.location.port === '3000' || 
                  hostname === 'localhost' || hostname === '127.0.0.1' || 
                  hostname.includes('replit.dev');
    
    if (isDev && !hostname.includes('.replit.app')) {
      // Development mode - use port 3001 for WebSocket (as configured in .env)
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
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[CLIENT WS] ===== CONNECTED TO BACKEND SERVER =====');
      console.log(`[CLIENT WS] Connected to: ${wsUrl}`);
      setStatus('connected');
      options.onConnect?.();
      
      // Send subscription command to backend with configured symbols only if provided
      const symbolsToUse = symbols && symbols.length > 0 ? symbols : [];
      
      if (symbolsToUse.length > 0) {
        // Try to include exchangeId for better compatibility
        getFirstActiveExchangeId().then(exchangeId => {
          const subscribeMessage = exchangeId 
            ? createSubscriptionMessage(symbolsToUse, exchangeId)
            : { type: 'subscribe', symbols: symbolsToUse }; // Fallback for backward compatibility
          
          console.log('[CLIENT WS] Sending configured symbols to backend:', subscribeMessage);
          ws.send(JSON.stringify(subscribeMessage));
        }).catch(() => {
          // Fallback to basic subscription without exchangeId
          const subscribeMessage = { type: 'subscribe', symbols: symbolsToUse };
          console.log('[CLIENT WS] Using fallback subscription without exchangeId:', subscribeMessage);
          ws.send(JSON.stringify(subscribeMessage));
        });
      } else {
        console.log('[CLIENT WS] No symbols provided, skipping subscription');
      }
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
      // Try to include exchangeId for better compatibility
      getFirstActiveExchangeId().then(exchangeId => {
        const message = exchangeId 
          ? createSubscriptionMessage(symbols, exchangeId)
          : { type: 'subscribe', symbols }; // Fallback for backward compatibility
        
        console.log('[CLIENT WS] Sending subscription message:', message);
        wsRef.current?.send(JSON.stringify(message));
      }).catch(() => {
        // Fallback to basic subscription without exchangeId
        console.log('[CLIENT WS] Using fallback subscription without exchangeId');
        wsRef.current?.send(JSON.stringify({ type: 'subscribe', symbols }));
      });
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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const { user } = useAuth();

  const connect = useCallback((apiKey?: string) => {
    // Prevent multiple simultaneous connections
    if (wsRef.current?.readyState === WebSocket.OPEN || status === 'connecting') {
      console.log('[USER WS] Already connected or connecting, skipping connection attempt');
      return;
    }

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus('connecting');
    console.log('[USER WS] Attempting to connect...');
    
    // Connect to our unified WebSocket service
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    
    // Check if we're in development environment
    const isDev = window.location.port === '5173' || window.location.port === '3000' || 
                  hostname === 'localhost' || hostname === '127.0.0.1';
    
    let wsUrl;
    if (isDev) {
      // Development mode - use port 3001 for WebSocket (as configured in .env)
      wsUrl = `${protocol}//${hostname}:3001/api/ws`;
    } else {
      // Production mode - use same host and port as main application
      const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      wsUrl = `${protocol}//${hostname}:${port}/api/ws`;
    }
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[USER WS] WebSocket opened, setting status to connected');
      setStatus('connected');
      reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
      
      // Authenticate with user ID and optional API key for WebSocket API
      if (user?.id) {
        console.log('[USER WS] Sending authentication for user:', user.id);
        ws.send(JSON.stringify({
          type: 'authenticate',
          userId: user.id,
          apiKey: apiKey || undefined
        }));
      }
      
      // Call onConnect immediately when socket opens
      options.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[USER WS] Received message:', data);
        setLastMessage(data);
        
        if (data.type === 'authenticated') {
          console.log('[USER WS] Authentication confirmed');
          // Don't change status here since we already set it to connected in onopen
          // This just confirms authentication worked
        } else if (data.type === 'connected') {
          console.log('[USER WS] Connection confirmed');
          setStatus('connected');
        } else if (data.type === 'user_stream_connected') {
          console.log('[USER WS] User data stream connected successfully');
          options.onMessage?.(data);
        } else if (data.type === 'user_stream_unavailable') {
          console.log('[USER WS] User stream unavailable:', data.message);
          // Still consider connection successful for public data
          options.onMessage?.(data);
        } else if (data.type === 'user_stream_error') {
          console.log('[USER WS] User stream error:', data.message);
          // Connection to our service succeeded, but user stream failed
          options.onMessage?.(data);
        } else if (data.type === 'error') {
          console.error('[USER WS] Received error message:', data.message);
          setStatus('error');
          options.onError?.(new Event(data.message));
        } else {
          // Pass all other messages to the handler
          options.onMessage?.(data);
        }
      } catch (error) {
        console.error('[USER WS] Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('[USER WS] WebSocket closed:', event.code, event.reason);
      setStatus('disconnected');
      options.onDisconnect?.();
      
      // Only attempt automatic reconnection if:
      // 1. It wasn't a manual close (code 1000)
      // 2. We haven't exceeded max attempts
      // 3. The component is still mounted (check if wsRef.current is not null)
      if (event.code !== 1000 && reconnectAttempts.current < 5 && wsRef.current !== null) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000); // Exponential backoff, max 10s
        console.log(`[USER WS] Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts.current + 1}/5)`);
        
        reconnectAttempts.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[USER WS] Reconnecting...');
          connect(apiKey);
        }, delay);
      } else if (reconnectAttempts.current >= 5) {
        console.error('[USER WS] Max reconnection attempts reached');
        setStatus('error');
      }
    };

    ws.onerror = (error) => {
      console.error('[USER WS] WebSocket error:', error);
      setStatus('error');
      options.onError?.(error);
    };
  }, [user?.id, options, status]); // Stable dependencies

  const disconnect = useCallback(() => {
    console.log('[USER WS] Disconnecting WebSocket...');
    
    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Close the WebSocket connection
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect'); // Use code 1000 to prevent auto-reconnect
      wsRef.current = null;
    }
    
    setStatus('disconnected');
    reconnectAttempts.current = 0; // Reset reconnect attempts
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