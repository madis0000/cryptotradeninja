import { useState, useEffect } from 'react';
import { webSocketSingleton } from '../services/WebSocketSingleton';

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
  const [isConnected, setIsConnected] = useState(false);
  
  // Use singleton WebSocket service to prevent multiple connections
  useEffect(() => {
    const unsubscribeData = webSocketSingleton.subscribe((data: any) => {
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
    });

    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      setIsConnected(true);
      console.log('[MARKET WS] Connected to centralized WebSocket service');
    });

    const unsubscribeDisconnect = webSocketSingleton.onDisconnect(() => {
      setIsConnected(false);
      console.log('[MARKET WS] Disconnected from centralized WebSocket service');
    });

    // Auto-connect and subscribe to market symbols
    if (!webSocketSingleton.isConnected()) {
      const defaultSymbols = ['DOGEUSDT', 'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT', 'SOLUSDT', 'DOTUSDT', 'LINKUSDT', 'AVAXUSDT', 'ICPUSDT', '1INCHUSDT'];
      webSocketSingleton.connect(defaultSymbols);
    }

    return () => {
      unsubscribeData();
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, []);

  const connectToMarketData = (symbols: string[]) => {
    webSocketSingleton.connect(symbols);
  };

  const disconnectFromMarketData = () => {
    webSocketSingleton.disconnect();
  };

  const getSymbolData = (symbol: string) => {
    return marketData.find(item => item.symbol === symbol);
  };

  return {
    marketData,
    isConnected,
    connectToMarketData,
    disconnectFromMarketData,
    getSymbolData
  };
}