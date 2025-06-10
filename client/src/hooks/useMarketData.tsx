import { useState, useEffect, useRef } from 'react';

interface MarketData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  timestamp: number;
}

export function useMarketData() {
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/market`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[MARKET WS] Connected to market data stream');
        setIsConnected(true);
        
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'market_update') {
            const update = message.data;
            
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
          console.error('[MARKET WS] Error parsing message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('[MARKET WS] Connection closed, attempting to reconnect...');
        setIsConnected(false);
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error('[MARKET WS] WebSocket error:', error);
        setIsConnected(false);
      };

    } catch (error) {
      console.error('[MARKET WS] Failed to connect:', error);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getSymbolData = (symbol: string): MarketData | null => {
    return marketData.find(item => item.symbol === symbol) || null;
  };

  return {
    marketData,
    isConnected,
    getSymbolData
  };
}