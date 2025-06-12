import { useEffect, useRef, useCallback } from 'react';
import type { MarketData, WebSocketMessage } from '@/types';

interface UseWebSocketProps {
  onMarketUpdate?: (data: MarketData) => void;
  onTradeExecuted?: (data: any) => void;
  onBotStatusChange?: (data: any) => void;
  onBalanceUpdate?: (data: any) => void;
}

export function useWebSocket({ onMarketUpdate, onTradeExecuted, onBotStatusChange, onBalanceUpdate }: UseWebSocketProps) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    // Skip WebSocket connections in development to avoid Vite HMR conflicts
    if (process.env.NODE_ENV === 'development') {
      console.log('[CLIENT WS] Skipping WebSocket connection in development mode');
      return;
    }

    if (ws.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/ws`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('[CLIENT WS] WebSocket connected');
      
      // Subscribe to all major trading pairs to receive market data
      const subscribeMessage = {
        type: 'subscribe',
        symbols: [
          'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'SOLUSDT', 'DOGEUSDT', 'AVAXUSDT',
          'DOTUSDT', 'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'ICPUSDT', 'APTUSDT',
          'BTCUSDC', 'ETHUSDC', 'ADAUSDC', 'SOLUSDC', 'AVAXUSDC',
          'ETHBTC', 'ADABTC', 'XRPBTC', 'LTCBTC', 'BNBBTC', 'DOGEBTC'
        ]
      };
      
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(subscribeMessage));
        console.log('[CLIENT WS] Sent market subscription message');
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        // Removed verbose WebSocket logging
        
        switch (message.type) {
          case 'connected':
            // Connection confirmed
            break;
          case 'market_update':
            onMarketUpdate?.(message.data);
            break;
          case 'balance_update':
            onBalanceUpdate?.(message.data);
            break;
          case 'balance_subscribed':
            // Balance subscription confirmed
            break;
          case 'trade_executed':
            onTradeExecuted?.(message.data);
            break;
          case 'bot_status':
            onBotStatusChange?.(message.data);
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [onMarketUpdate, onTradeExecuted, onBotStatusChange]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const subscribeToBalance = useCallback((userId: number, exchangeId: number, symbol: string) => {
    const sendMessage = () => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        const message = {
          type: 'subscribe_balance',
          userId,
          exchangeId,
          symbol
        };
        ws.current.send(JSON.stringify(message));
        console.log('[CLIENT WS] Subscribed to balance updates:', message);
      } else if (ws.current?.readyState === WebSocket.CONNECTING) {
        // Wait for connection to open
        setTimeout(sendMessage, 100);
      }
    };
    sendMessage();
  }, []);

  const unsubscribeFromBalance = useCallback((userId: number, exchangeId: number, symbol: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const message = {
        type: 'unsubscribe_balance',
        userId,
        exchangeId,
        symbol
      };
      ws.current.send(JSON.stringify(message));
      console.log('[CLIENT WS] Unsubscribed from balance updates:', message);
    }
  }, []);

  return { connect, subscribeToBalance, unsubscribeFromBalance };
}
