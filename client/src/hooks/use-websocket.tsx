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
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8080`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      
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
      
      ws.current?.send(JSON.stringify(subscribeMessage));
    };

    ws.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log('CLIENT WS: Received message:', message.type, message.data);
        
        switch (message.type) {
          case 'connected':
            console.log('CLIENT WS: Connection confirmed -', message);
            break;
          case 'market_update':
            console.log('CLIENT WS: Market update -', message.data?.symbol, message.data?.price);
            onMarketUpdate?.(message.data);
            break;
          case 'balance_update':
            console.log('CLIENT WS: Balance update -', message.data);
            onBalanceUpdate?.(message.data);
            break;
          case 'balance_subscribed':
            console.log('CLIENT WS: Balance subscription confirmed -', message);
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
    if (ws.current?.readyState === WebSocket.OPEN) {
      const message = {
        type: 'subscribe_balance',
        userId,
        exchangeId,
        symbol
      };
      ws.current.send(JSON.stringify(message));
      console.log('[CLIENT WS] Subscribed to balance updates:', message);
    }
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
