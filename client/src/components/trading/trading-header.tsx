import { useState, useEffect } from "react";
import { usePublicWebSocket } from "@/hooks/useWebSocketService";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TradingHeaderProps {
  selectedSymbol: string;
  onSymbolChange?: (symbol: string) => void;
}

interface TickerData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  baseVolume?: number;
  quoteVolume?: number;
}

const AVAILABLE_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT", "DOGEUSDT", 
  "SOLUSDT", "XRPUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
  "LINKUSDT", "LTCUSDT", "UNIUSDT", "ATOMUSDT", "ICPUSDT"
];

export function TradingHeader({ selectedSymbol, onSymbolChange }: TradingHeaderProps) {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);

  const { connect, disconnect, subscribe, status, lastMessage } = usePublicWebSocket({
    onMessage: (data) => {
      if (data.type === 'market_update' && data.symbol === selectedSymbol) {
        setTickerData({
          symbol: data.symbol,
          price: data.price,
          change: data.change,
          changePercent: data.changePercent,
          volume: data.volume,
          high: data.high,
          low: data.low,
          baseVolume: data.volume,
          quoteVolume: data.volume * data.price
        });
      }
    }
  });

  useEffect(() => {
    connect([selectedSymbol]);
    return () => disconnect();
  }, [selectedSymbol]);

  const handleSymbolSelect = (symbol: string) => {
    if (onSymbolChange) {
      onSymbolChange(symbol);
    }
    // Subscribe to new symbol
    subscribe([symbol]);
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(2)}K`;
    return volume.toFixed(2);
  };

  const getSymbolParts = (symbol: string) => {
    if (symbol.endsWith('USDT')) {
      return { base: symbol.slice(0, -4), quote: 'USDT' };
    }
    if (symbol.endsWith('USDC')) {
      return { base: symbol.slice(0, -4), quote: 'USDC' };
    }
    if (symbol.endsWith('BTC')) {
      return { base: symbol.slice(0, -3), quote: 'BTC' };
    }
    return { base: symbol.slice(0, -4), quote: symbol.slice(-4) };
  };

  const { base, quote } = getSymbolParts(selectedSymbol);
  const isPositive = tickerData ? tickerData.changePercent >= 0 : false;

  return (
    <div className="bg-crypto-dark px-4 py-6 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          {/* Symbol Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center space-x-2 hover:bg-gray-800 px-3 py-2 rounded">
              <h1 className="text-2xl font-bold text-white">{base}/{quote}</h1>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-crypto-dark border-gray-700">
              {AVAILABLE_SYMBOLS.map((symbol) => {
                const parts = getSymbolParts(symbol);
                return (
                  <DropdownMenuItem
                    key={symbol}
                    onClick={() => handleSymbolSelect(symbol)}
                    className="text-white hover:bg-gray-800 cursor-pointer"
                  >
                    {parts.base}/{parts.quote}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Price */}
          <div className="flex flex-col">
            <span className={`text-xl font-semibold ${isPositive ? 'text-crypto-success' : 'text-crypto-danger'}`}>
              {tickerData ? formatPrice(tickerData.price) : '--'}
            </span>
            <span className="text-xs text-gray-400">Price</span>
          </div>

          {/* 24h Change */}
          <div className="flex flex-col">
            <span className={`text-sm font-medium ${isPositive ? 'text-crypto-success' : 'text-crypto-danger'}`}>
              {tickerData ? `${isPositive ? '+' : ''}${tickerData.changePercent.toFixed(2)}%` : '--'}
            </span>
            <span className="text-xs text-gray-400">24h Change</span>
          </div>

          {/* 24h High */}
          <div className="flex flex-col">
            <span className="text-sm text-white">
              {tickerData ? formatPrice(tickerData.high) : '--'}
            </span>
            <span className="text-xs text-gray-400">24h High</span>
          </div>

          {/* 24h Low */}
          <div className="flex flex-col">
            <span className="text-sm text-white">
              {tickerData ? formatPrice(tickerData.low) : '--'}
            </span>
            <span className="text-xs text-gray-400">24h Low</span>
          </div>

          {/* Volume Base */}
          <div className="flex flex-col">
            <span className="text-sm text-white">
              {tickerData ? formatVolume(tickerData.baseVolume || tickerData.volume) : '--'}
            </span>
            <span className="text-xs text-gray-400">24h Volume ({base})</span>
          </div>

          {/* Volume Quote */}
          <div className="flex flex-col">
            <span className="text-sm text-white">
              {tickerData ? formatVolume(tickerData.quoteVolume || (tickerData.volume * tickerData.price)) : '--'}
            </span>
            <span className="text-xs text-gray-400">24h Volume ({quote})</span>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            status === 'connected' ? 'bg-crypto-success' : 
            status === 'connecting' ? 'bg-yellow-500' : 'bg-crypto-danger'
          }`} />
          <span className="text-xs text-gray-400 capitalize">{status}</span>
        </div>
      </div>
    </div>
  );
}