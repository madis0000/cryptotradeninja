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
    onMessage: async (message) => {
      console.log('[AUDIO] Received WebSocket message:', message);
      
      if (!message) {
        console.log('[AUDIO] No message received');
        return;
      }

      if (!settings) {
        console.log('[AUDIO] No settings available yet');
        return;
      }

      try {
        // Handle order fill notifications - check for filled orders
        if (message.type === 'order_notification') {
          console.log('[AUDIO] Order notification received:', message.data);
          
          if (message.data?.status === 'filled') {
            const data = message.data;
            const timestamp = new Date(data.timestamp).getTime();
            
            console.log(`[AUDIO] Order filled! Timestamp: ${timestamp}, Last: ${lastNotificationRef.current}`);
            
            if (timestamp > lastNotificationRef.current) {
              lastNotificationRef.current = timestamp;
              
              // Determine order type based on the order data
              let orderType: 'take_profit' | 'safety_order' | 'base_order' = 'safety_order';
              
              if (data.side === 'SELL') {
                orderType = 'take_profit';
              } else if (data.orderType === 'base_order') {
                orderType = 'base_order';
              } else {
                orderType = 'safety_order';
              }

              console.log(`[AUDIO] Playing ${orderType} notification sound for order ${data.orderId}`);
              console.log('[AUDIO] Settings:', settings);
              
              // Play notification sound
              await audioService.playOrderFillNotification(orderType, settings);
            } else {
              console.log('[AUDIO] Duplicate notification ignored');
            }
          } else {
            console.log(`[AUDIO] Order status is ${message.data?.status}, not filled`);
          }
        } else {
          console.log(`[AUDIO] Message type is ${message.type}, not order_notification`);
        }
      } catch (error) {
        console.error('[AUDIO] Failed to process order notification:', error);
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