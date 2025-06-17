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

function useMarketData() {
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  // Use singleton WebSocket service to prevent multiple connections
  useEffect(() => {
    console.log('[MARKET DATA HOOK] Setting up WebSocket connection and subscription');
    
    // Add reference for this hook instance
    webSocketSingleton.addReference();
    
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

    // Auto-connect if not already connected
    if (!webSocketSingleton.isConnected()) {
      webSocketSingleton.connect(); // Will fetch active bot symbols automatically
    }

    return () => {
      console.log('[MARKET DATA HOOK] Cleaning up WebSocket subscription and reference');
      unsubscribeData();
      unsubscribeConnect();
      unsubscribeDisconnect();
      
      // Remove reference to allow proper cleanup
      webSocketSingleton.removeReference();
    };
  }, []);

  const connectToMarketData = (symbols: string[]) => {
    console.log('[MARKET DATA HOOK] Connecting to market data for symbols:', symbols);
    
    // Ensure WebSocket is connected first
    if (!webSocketSingleton.isConnected()) {
      webSocketSingleton.connect().then(() => {
        // Subscribe to ticker data after connection is established
        webSocketSingleton.subscribeToTickers(symbols);
      });
    } else {
      // Subscribe to ticker data immediately
      webSocketSingleton.subscribeToTickers(symbols);
    }
  };

  const disconnectFromMarketData = () => {
    console.log('[MARKET DATA HOOK] Disconnecting from market data');
    webSocketSingleton.unsubscribeFromTickers();
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

export { useMarketData };