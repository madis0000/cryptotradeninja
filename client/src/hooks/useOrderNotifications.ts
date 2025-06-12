import { useEffect, useRef } from 'react';
import { audioService } from '../services/audioService';
import { useQuery } from '@tanstack/react-query';

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

  useEffect(() => {
    if (!settings) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
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

          // Play notification sound
          await audioService.playOrderFillNotification(orderType, settings);
        }
      } catch (error) {
        // Ignore parsing errors for non-JSON messages
      }
    };

    // Listen for WebSocket messages
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [settings]);

  // Manual notification trigger for testing
  const playTestNotification = async (orderType: 'take_profit' | 'safety_order' | 'base_order') => {
    if (settings) {
      await audioService.playOrderFillNotification(orderType, settings);
    }
  };

  return {
    playTestNotification,
    settings
  };
}