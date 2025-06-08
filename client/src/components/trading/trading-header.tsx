import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TradingHeaderProps {
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

interface TickerData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  timestamp: number;
}

const POPULAR_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 
  'SOLUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'
];

export function TradingHeader({ selectedSymbol, onSymbolChange }: TradingHeaderProps) {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Fetch initial ticker data
  const { data: marketData } = useQuery({
    queryKey: ['/api/market'],
    refetchInterval: 5000,
  });

  // Set up WebSocket connection for real-time ticker updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/websocket`;
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('[TRADING HEADER] WebSocket connected');
      
      // Subscribe to the selected symbol
      const subscribeMessage = {
        type: 'subscribe',
        symbols: [selectedSymbol]
      };
      websocket.send(JSON.stringify(subscribeMessage));
    };
    
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'market_update' && message.symbol === selectedSymbol) {
          const ticker: TickerData = {
            symbol: message.symbol,
            price: message.price,
            change: message.change,
            changePercent: message.changePercent,
            volume: message.volume,
            high: message.high,
            low: message.low,
            timestamp: message.timestamp || Date.now()
          };
          setTickerData(ticker);
        }
      } catch (error) {
        console.error('[TRADING HEADER] Error parsing WebSocket message:', error);
      }
    };
    
    websocket.onclose = () => {
      console.log('[TRADING HEADER] WebSocket disconnected');
    };
    
    websocket.onerror = (error) => {
      console.error('[TRADING HEADER] WebSocket error:', error);
    };
    
    setWs(websocket);
    
    return () => {
      websocket.close();
    };
  }, [selectedSymbol]);

  // Update subscription when symbol changes
  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        type: 'subscribe',
        symbols: [selectedSymbol]
      };
      ws.send(JSON.stringify(subscribeMessage));
    }
  }, [selectedSymbol, ws]);

  // Get ticker data from marketData if WebSocket data is not available
  const displayData = tickerData || (marketData && marketData.find((item: any) => item.symbol === selectedSymbol));

  const formatPrice = (price: number, precision: number = 2) => {
    if (price >= 1) {
      return price.toFixed(precision);
    } else {
      return price.toFixed(Math.max(precision, 8));
    }
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toFixed(0);
  };

  const isPositive = displayData?.changePercent > 0;
  const isNegative = displayData?.changePercent < 0;

  return (
    <div className="bg-crypto-dark border-b border-gray-800 p-4">
      <div className="flex items-center justify-between">
        {/* Symbol Selector */}
        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-white hover:bg-gray-800 p-2">
                <span className="font-semibold text-lg">{selectedSymbol}</span>
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-crypto-dark border-gray-700">
              {POPULAR_SYMBOLS.map((symbol) => (
                <DropdownMenuItem
                  key={symbol}
                  onClick={() => onSymbolChange(symbol)}
                  className="text-white hover:bg-gray-800 cursor-pointer"
                >
                  {symbol}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Ticker Information */}
        <div className="flex items-center space-x-8">
          {/* Price */}
          <div className="text-right">
            <div className="text-xs text-gray-400">Price</div>
            <div className={`text-lg font-mono font-semibold ${
              isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-white'
            }`}>
              ${displayData ? formatPrice(displayData.price) : '--'}
            </div>
          </div>

          {/* 24h Change */}
          <div className="text-right">
            <div className="text-xs text-gray-400">24h Change</div>
            <div className={`text-sm font-medium flex items-center ${
              isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-gray-400'
            }`}>
              {displayData ? (
                <>
                  {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : 
                   isNegative ? <TrendingDown className="w-3 h-3 mr-1" /> : null}
                  {displayData.changePercent > 0 ? '+' : ''}{displayData.changePercent.toFixed(2)}%
                </>
              ) : '--'}
            </div>
          </div>

          {/* 24h High */}
          <div className="text-right">
            <div className="text-xs text-gray-400">24h High</div>
            <div className="text-sm font-mono text-white">
              ${displayData ? formatPrice(displayData.high) : '--'}
            </div>
          </div>

          {/* 24h Low */}
          <div className="text-right">
            <div className="text-xs text-gray-400">24h Low</div>
            <div className="text-sm font-mono text-white">
              ${displayData ? formatPrice(displayData.low) : '--'}
            </div>
          </div>

          {/* 24h Volume */}
          <div className="text-right">
            <div className="text-xs text-gray-400">24h Volume</div>
            <div className="text-sm font-mono text-white">
              {displayData ? formatVolume(displayData.volume) : '--'}
            </div>
          </div>

          {/* Connection Status */}
          <div className="text-right">
            <div className="text-xs text-gray-400">Status</div>
            <div className={`text-xs font-medium ${
              tickerData ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {tickerData ? 'Live' : 'Static'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}