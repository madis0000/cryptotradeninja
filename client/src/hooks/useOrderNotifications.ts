import { useEffect, useRef } from 'react';
import { audioService } from '../services/audioService';
import { useQuery } from '@tanstack/react-query';
import { useUserWebSocket } from './useWebSocketService';

interface OrderNotification {
  type: 'order_fill';
  orderType: 'take_profit' | 'safety_order' | 'base_order';
  botId: number;
  orderId: string;
  symbol: string;
  side: string;
  quantity: string;
  price: string;
  timestamp: number;
}

export function useOrderNotifications() {
  const lastNotificationRef = useRef<number>(0);

  // Fetch user settings for audio notifications
  const { data: settings } = useQuery({
    queryKey: ['/api/settings'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Connect to WebSocket for order notifications
  const { lastMessage } = useUserWebSocket({
    onMessage: async (data) => {
      if (!settings || !data) return;

      try {
        // Handle order fill notifications
        if (data.type === 'order_fill' && data.timestamp > lastNotificationRef.current) {
          lastNotificationRef.current = data.timestamp;
          
          // Determine order type based on the order data
          let orderType: 'take_profit' | 'safety_order' | 'base_order' = 'safety_order';
          
          if (data.side === 'SELL') {
            orderType = 'take_profit';
          } else if (data.orderType === 'base_order' || data.isBaseOrder) {
            orderType = 'base_order';
          } else {
            orderType = 'safety_order';
          }

          console.log(`[AUDIO] Playing ${orderType} notification sound`);
          
          // Play notification sound
          await audioService.playOrderFillNotification(orderType, settings);
        }
      } catch (error) {
        console.warn('[AUDIO] Failed to process order notification:', error);
      }
    }
  });

  // Manual notification trigger for testing
  const playTestNotification = async (orderType: 'take_profit' | 'safety_order' | 'base_order') => {
    if (settings) {
      console.log(`[AUDIO] Testing ${orderType} notification sound`);
      await audioService.playOrderFillNotification(orderType, settings);
    }
  };

  return {
    playTestNotification,
    settings
  };
}