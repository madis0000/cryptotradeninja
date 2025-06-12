import { useState, useEffect } from 'react';
import { usePublicWebSocket } from './useWebSocketService';

interface MarketData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  timestamp: number;
}

export function useMarketData() {
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  
  // Use the centralized WebSocket service instead of creating a separate connection
  const publicWs = usePublicWebSocket({
    onMessage: (data) => {
      try {
        if (data.type === 'market_update' || data.type === 'ticker_update') {
          const update = data.data || data;
          
          setMarketData(prev => {
            const existingIndex = prev.findIndex(item => item.symbol === update.symbol);
            
            if (existingIndex >= 0) {
              // Update existing symbol
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                ...update,
                timestamp: Date.now()
              };
              return updated;
            } else {
              // Add new symbol
              return [...prev, {
                ...update,
                timestamp: Date.now()
              }];
            }
          });
        }
      } catch (error) {
        console.error('[MARKET WS] Error processing market update:', error);
      }
    },
    onConnect: () => {
      console.log('[MARKET WS] Connected to centralized WebSocket service');
    },
    onDisconnect: () => {
      console.log('[MARKET WS] Disconnected from centralized WebSocket service');
    }
  });

  useEffect(() => {
    // Subscribe to market data when component mounts
    const symbols = ['DOGEUSDT', 'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT', 'SOLUSDT', 'DOTUSDT', 'LINKUSDT', 'AVAXUSDT', 'ICPUSDT', '1INCHUSDT'];
    
    console.log('[MARKET WS] Subscribing to market data for symbols:', symbols);
    publicWs.connect(symbols);
    publicWs.subscribe(symbols);

    return () => {
      publicWs.disconnect();
    };
  }, []);

  const getSymbolData = (symbol: string): MarketData | null => {
    return marketData.find(item => item.symbol === symbol) || null;
  };

  return {
    marketData,
    isConnected: publicWs.status === 'connected',
    getSymbolData
  };
}