import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

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
}

export function useOrderNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

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

    const handleOrderNotification = (data: OrderNotification) => {
      const { status, notification, orderType, symbol, side, quantity, price } = data;
      
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