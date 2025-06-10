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
      // Connect to the existing WebSocket service on port 8080
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const wsUrl = `${protocol}//${host}:8080`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[MARKET WS] Connected to market data stream');
        setIsConnected(true);
        
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        
        // Send subscription request for ticker data
        wsRef.current?.send(JSON.stringify({
          type: 'subscribe',
          dataType: 'ticker',
          symbols: ['DOGEUSDT'] // Subscribe to active trading pairs
        }));
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