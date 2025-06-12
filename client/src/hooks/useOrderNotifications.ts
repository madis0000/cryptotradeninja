import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { audioService } from '@/services/audioService';
import { replitWsService } from '@/services/replitWebSocketService';

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
    let connectionId: string | null = null;

    const connectWebSocket = async () => {
      // Skip WebSocket connections in development to avoid Vite HMR conflicts
      if (process.env.NODE_ENV === 'development') {
        console.log('[ORDER NOTIFICATIONS] Skipping WebSocket connection in development mode');
        return;
      }

      try {
        connectionId = 'order-notifications';
        
        await replitWsService.createConnection(
          connectionId,
          (data) => {
            if (data.type === 'order_notification') {
              handleOrderNotification(data.data);
            }
          },
          () => {
            console.log('[ORDER NOTIFICATIONS] Connected to WebSocket for order updates');
          },
          () => {
            console.log('[ORDER NOTIFICATIONS] WebSocket connection closed, attempting to reconnect...');
          }
        );
      } catch (error) {
        console.error('[ORDER NOTIFICATIONS] WebSocket connection failed:', error);
        // Retry connection after delay
        setTimeout(connectWebSocket, 3000);
      }
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
      if (connectionId) {
        replitWsService.closeConnection(connectionId);
      }
    };
  }, [toast]);

  return {
    // Return connection status and methods for manual control
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    getStatus: () => ({ 
      connected: wsRef.current?.readyState === WebSocket.OPEN || false, 
      retryCount: 0 
    })
  };
}