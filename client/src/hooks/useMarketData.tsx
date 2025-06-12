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
      // Connect to dedicated WebSocket server on port 8080 to avoid Vite HMR conflicts
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; // Include port for development
      const wsUrl = `${protocol}//${host}/api/ws`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[MARKET WS] Connected to market data stream');
        setIsConnected(true);
        
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        
        // Wait a moment before sending subscription to ensure connection is stable
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'subscribe',
              dataType: 'ticker',
              symbols: ['DOGEUSDT', 'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT', 'SOLUSDT', 'DOTUSDT', 'LINKUSDT', 'AVAXUSDT', 'ICPUSDT', '1INCHUSDT']
            }));
          }
        }, 100);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Handle keepalive messages
          if (message.type === 'keepalive') {
            return; // Connection is alive
          }
          
          if (message.type === 'connected') {
            console.log('[MARKET WS] Connection confirmed');
            return;
          }
          
          if (message.type === 'market_update' || message.type === 'ticker_update') {
            const update = message.data || message;
            
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