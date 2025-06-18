import { useEffect, useState, useCallback } from 'react';
import { webSocketService } from '@/services/websocket-service';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface OpenOrder {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: string;
  timeInForce: string;
  time: number;
  updateTime: number;
  exchangeId: number;
}

interface OpenOrdersProps {
  exchangeId: number;
  symbol?: string;
}

export function OpenOrders({ exchangeId, symbol }: OpenOrdersProps) {
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to open orders updates
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'open_orders_update' && data.data) {
          if (data.data.exchangeId === exchangeId) {
            console.log('[OPEN ORDERS] Received update:', data.data);
            setOpenOrders(data.data.orders || []);
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('[OPEN ORDERS] Error parsing message:', error);
      }
    };

    // Add WebSocket event listener
    webSocketService.addMessageHandler(handleMessage);

    // Request open orders on mount
    if (webSocketService.isConnected()) {
      console.log('[OPEN ORDERS] Requesting open orders for exchange', exchangeId, 'symbol', symbol);
      webSocketService.send({
        type: 'subscribe_open_orders',
        exchangeId,
        symbol
      });
    }

    // Cleanup
    return () => {
      webSocketService.removeMessageHandler(handleMessage);
    };
  }, [exchangeId, symbol]);

  const handleCancelOrder = useCallback(async (orderId: string, orderSymbol: string) => {
    try {
      console.log('[OPEN ORDERS] Cancelling order:', orderId);
      
      // Send cancel request via WebSocket
      webSocketService.send({
        type: 'cancel_order',
        data: {
          exchangeId,
          symbol: orderSymbol,
          orderId
        }
      });
      
      // Refresh open orders after a delay
      setTimeout(() => {
        webSocketService.send({
          type: 'get_open_orders',
          exchangeId,
          symbol
        });
      }, 1000);
      
    } catch (error) {
      console.error('[OPEN ORDERS] Error cancelling order:', error);
    }
  }, [exchangeId, symbol]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <span className="text-sm text-muted-foreground">Loading open orders...</span>
      </div>
    );
  }

  if (openOrders.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <span className="text-sm text-muted-foreground">No open orders</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {openOrders.map((order) => (
        <div
          key={order.orderId}
          className="flex items-center justify-between p-3 rounded-lg border bg-card"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{order.symbol}</span>
              <span className={`text-sm font-medium ${
                order.side === 'BUY' ? 'text-green-600' : 'text-red-600'
              }`}>
                {order.side}
              </span>
              <span className="text-sm text-muted-foreground">{order.type}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span>Price: {formatCurrency(parseFloat(order.price))}</span>
              <span>Qty: {order.origQty}</span>
              <span>Filled: {order.executedQty}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCancelOrder(order.orderId, order.symbol)}
            className="text-destructive hover:text-destructive"
          >
            Cancel
          </Button>
        </div>
      ))}
    </div>
  );
}
