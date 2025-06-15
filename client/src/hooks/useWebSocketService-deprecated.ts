// DEPRECATED: This service has been replaced by WebSocketSingleton
// All WebSocket connections should now go through the unified WebSocketSingleton service
// This prevents multiple connections and ensures proper resource management

import { useState, useCallback, useEffect } from 'react';
import { webSocketSingleton } from '@/services/WebSocketSingleton';
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

export function usePublicWebSocket(options: WebSocketHookOptions = {}): PublicWebSocketService {
  console.warn('[DEPRECATED] usePublicWebSocket is deprecated. Use webSocketSingleton directly instead.');
  
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<any>(null);

  // Handle order fill notifications with audio alerts
  const handleOrderFillNotification = useCallback(async (orderData: any) => {
    try {
      console.log(`[AUDIO NOTIFICATION] 🔊 Order fill detected:`, orderData);
      
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

  useEffect(() => {
    console.log('[DEPRECATED HOOK] Redirecting to WebSocketSingleton');
    
    // Subscribe to WebSocketSingleton
    const unsubscribe = webSocketSingleton.subscribe((data) => {
      setLastMessage(data);
      
      // Handle order fill notifications with sound alerts
      if (data.type === 'order_fill_notification') {
        handleOrderFillNotification(data.data);
      }
      
      options.onMessage?.(data);
    });

    // Set up status monitoring
    const connectUnsubscribe = webSocketSingleton.onConnect(() => {
      setStatus('connected');
      options.onConnect?.();
    });

    const disconnectUnsubscribe = webSocketSingleton.onDisconnect(() => {
      setStatus('disconnected');
      options.onDisconnect?.();
    });

    const errorUnsubscribe = webSocketSingleton.onError((error) => {
      setStatus('error');
      options.onError?.(error);
    });

    // Initial status
    setStatus(webSocketSingleton.getStatus() as any);

    return () => {
      unsubscribe();
      connectUnsubscribe();
      disconnectUnsubscribe();
      errorUnsubscribe();
    };
  }, [options, handleOrderFillNotification]);

  return {
    connect: (symbols?: string[]) => {
      console.warn('[DEPRECATED] Use webSocketSingleton.connect() instead');
      webSocketSingleton.connect(symbols);
    },
    disconnect: () => {
      console.warn('[DEPRECATED] Use webSocketSingleton.disconnect() instead');
      webSocketSingleton.disconnect();
    },
    subscribe: (symbols: string[]) => {
      console.warn('[DEPRECATED] Use webSocketSingleton.sendMessage() instead');
      webSocketSingleton.sendMessage({ type: 'subscribe', symbols });
    },
    sendMessage: (message: any) => {
      console.warn('[DEPRECATED] Use webSocketSingleton.sendMessage() instead');
      webSocketSingleton.sendMessage(message);
    },
    status,
    lastMessage
  };
}

export function useUserWebSocket(options: WebSocketHookOptions = {}): UserWebSocketService {
  console.warn('[DEPRECATED] useUserWebSocket is deprecated. Use webSocketSingleton directly instead.');
  
  const publicService = usePublicWebSocket(options);
  
  return {
    connect: (apiKey?: string) => {
      console.warn('[DEPRECATED] Use webSocketSingleton.connect() instead');
      webSocketSingleton.connect();
    },
    disconnect: () => {
      console.warn('[DEPRECATED] Use webSocketSingleton.disconnect() instead');
      webSocketSingleton.disconnect();
    },
    authenticate: (userId: number, apiKey?: string) => {
      console.warn('[DEPRECATED] Use webSocketSingleton.sendMessage() with authentication instead');
      webSocketSingleton.sendMessage({
        type: 'authenticate',
        userId,
        apiKey
      });
    },
    sendMessage: (message: any) => {
      console.warn('[DEPRECATED] Use webSocketSingleton.sendMessage() instead');
      webSocketSingleton.sendMessage(message);
    },
    status: publicService.status,
    lastMessage: publicService.lastMessage
  };
}
