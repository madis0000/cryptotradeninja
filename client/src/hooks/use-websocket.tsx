// DEPRECATED: This hook has been replaced by WebSocketSingleton
// All WebSocket connections should now go through the unified WebSocketSingleton service
// This prevents multiple connections and ensures proper resource management

import { useEffect } from 'react';
import { webSocketSingleton } from '@/services/WebSocketSingleton';
import type { MarketData } from '@/types';

interface UseWebSocketProps {
  onMarketUpdate?: (data: MarketData) => void;
  onTradeExecuted?: (data: any) => void;
  onBotStatusChange?: (data: any) => void;
  onBalanceUpdate?: (data: any) => void;
}

export function useWebSocket({ onMarketUpdate, onTradeExecuted, onBotStatusChange, onBalanceUpdate }: UseWebSocketProps) {
  console.warn('[DEPRECATED] useWebSocket hook is deprecated. Use webSocketSingleton directly instead.');
  
  useEffect(() => {
    console.log('[DEPRECATED HOOK] Redirecting to WebSocketSingleton');
    
    // Subscribe to WebSocketSingleton instead of creating new connection
    const unsubscribe = webSocketSingleton.subscribe((data) => {
      if (data.type === 'market_update' && onMarketUpdate) {
        onMarketUpdate(data.data);
      } else if (data.type === 'trade_executed' && onTradeExecuted) {
        onTradeExecuted(data.data);
      } else if (data.type === 'bot_status_change' && onBotStatusChange) {
        onBotStatusChange(data.data);
      } else if (data.type === 'balance_update' && onBalanceUpdate) {
        onBalanceUpdate(data.data);
      }
    });

    // Connect if not already connected
    if (!webSocketSingleton.isConnected()) {
      webSocketSingleton.connect();
    }

    return () => {
      unsubscribe();
    };
  }, [onMarketUpdate, onTradeExecuted, onBotStatusChange, onBalanceUpdate]);

  return {
    connect: () => {
      console.warn('[DEPRECATED] Use webSocketSingleton.connect() instead');
      webSocketSingleton.connect();
    },
    disconnect: () => {
      console.warn('[DEPRECATED] Use webSocketSingleton.disconnect() instead');
      webSocketSingleton.disconnect();
    },
    subscribeToBalance: (userId: number, exchangeId: number, symbol: string) => {
      console.warn('[DEPRECATED] Use webSocketSingleton.sendMessage() with balance subscription instead');
      webSocketSingleton.sendMessage({
        type: 'subscribe_balance',
        userId,
        exchangeId,
        symbol
      });
    },
    unsubscribeFromBalance: (userId: number, exchangeId: number, symbol: string) => {
      console.warn('[DEPRECATED] Use webSocketSingleton.sendMessage() with balance unsubscription instead');
      webSocketSingleton.sendMessage({
        type: 'unsubscribe_balance',
        userId,
        exchangeId,
        symbol
      });
    }
  };
}
