import { useEffect, useRef, useCallback } from 'react';
import { MarketData, WebSocketMessage } from '@/types';

interface UseWebSocketProps {
  onMarketUpdate?: (data: MarketData) => void;
  onTradeExecuted?: (data: any) => void;
  onBotStatusChange?: (data: any) => void;
}

export function useWebSocket({ onMarketUpdate, onTradeExecuted, onBotStatusChange }: UseWebSocketProps) {
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
        
        switch (message.type) {
          case 'market_update':
            onMarketUpdate?.(message.data);
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

  return { connect };
}
