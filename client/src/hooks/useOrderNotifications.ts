import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { audioService } from '@/services/audioService';

interface OrderNotification {
  orderId: number;
  exchangeOrderId?: string;
  botId: number;
  symbol: string;
  side: string;
  quantity: string;
  price: string;
  orderType: string;
  status: 'placed' | 'filled' | 'cancelled' | 'failed';
  timestamp: string;
  notification: string;
  audioNotification?: {
    orderType: 'take_profit' | 'safety_order' | 'base_order';
    shouldPlay: boolean;
  };
}

export function useOrderNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch user settings for audio notifications
  const { data: userSettings } = useQuery({
    queryKey: ["/api/user/settings"],
    queryFn: async () => {
      const response = await fetch("/api/user/settings", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) return null;
      return response.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connectWebSocket = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ORDER NOTIFICATIONS] Connected to WebSocket for order updates');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'order_notification') {
            handleOrderNotification(message.data);
          }
        } catch (error) {
          console.error('[ORDER NOTIFICATIONS] Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[ORDER NOTIFICATIONS] WebSocket connection closed, attempting to reconnect...');
        setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
      };

      ws.onerror = (error) => {
        console.error('[ORDER NOTIFICATIONS] WebSocket error:', error);
      };
    };

    const handleOrderNotification = async (data: OrderNotification) => {
      const { status, notification, orderType, symbol, side, quantity, price, audioNotification } = data;
      
      let title = '';
      let description = notification;
      let variant: 'default' | 'destructive' = 'default';

      switch (status) {
        case 'placed':
          title = 'Order Placed';
          break;
        case 'filled':
          title = 'Order Filled';
          variant = 'default';
          break;
        case 'cancelled':
          title = 'Order Cancelled';
          variant = 'destructive';
          break;
        case 'failed':
          title = 'Order Failed';
          variant = 'destructive';
          break;
      }

      // Play audio notification if available and enabled
      if (audioNotification?.shouldPlay && userSettings) {
        try {
          await audioService.playOrderFillNotification(
            audioNotification.orderType,
            userSettings
          );
          console.log(`[Audio Notification] Played sound for ${audioNotification.orderType} order fill`);
        } catch (error) {
          console.warn('[Audio Notification] Failed to play sound:', error);
        }
      }

      // Show toast notification
      toast({
        title,
        description,
        variant,
        duration: status === 'filled' ? 5000 : 3000, // Keep fill notifications visible longer
      });

      // Invalidate relevant query cache to refresh UI data
      queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bots', data.botId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bot-orders', data.botId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles', data.botId] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      // Force refetch of all bot-related data to ensure synchronization
      queryClient.refetchQueries({ queryKey: ['/api/bots', data.botId] });
      queryClient.refetchQueries({ queryKey: ['/api/bot-orders', data.botId] });
      queryClient.refetchQueries({ queryKey: ['/api/bot-cycles', data.botId] });

      // Log for debugging
      console.log(`[ORDER NOTIFICATIONS] ${title}: ${description}`);
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [toast]);

  return {
    // Return any methods if needed for manual control
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
}