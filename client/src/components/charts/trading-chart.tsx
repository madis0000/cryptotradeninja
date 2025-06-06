import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface MarketData {
  symbol: string;
  price: number;
  change: number;
  volume: number;
  high: number;
  low: number;
  timestamp: number;
}

interface TradingChartProps {
  symbol?: string;
  marketData?: MarketData;
  className?: string;
}

export function TradingChart({ symbol = 'BTCUSDT', marketData, className }: TradingChartProps) {
  const [timeframe, setTimeframe] = useState('1H');
  const [priceHistory, setPriceHistory] = useState<Array<{time: number, price: number}>>([]);

  // Store real-time price updates
  useEffect(() => {
    if (marketData) {
      const newPoint = {
        time: marketData.timestamp,
        price: marketData.price
      };
      
      setPriceHistory(prev => {
        const updated = [...prev, newPoint];
        // Keep last 100 points
        return updated.slice(-100);
      });
    }
  }, [marketData]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatChange = (change: number) => {
    const isPositive = change >= 0;
    return (
      <span className={`text-sm px-2 py-1 rounded ${
        isPositive 
          ? 'text-green-400 bg-green-400/10' 
          : 'text-red-400 bg-red-400/10'
      }`}>
        {isPositive ? '+' : ''}{change.toFixed(2)}%
      </span>
    );
  };

  // Simple SVG chart visualization
  const renderSimpleChart = () => {
    if (priceHistory.length < 2) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <div className="text-lg mb-2">📈</div>
            <div>Waiting for price data...</div>
          </div>
        </div>
      );
    }

    const minPrice = Math.min(...priceHistory.map(p => p.price));
    const maxPrice = Math.max(...priceHistory.map(p => p.price));
    const priceRange = maxPrice - minPrice || 1;

    const chartWidth = 600;
    const chartHeight = 300;
    const padding = 20;

    const points = priceHistory.map((point, index) => {
      const x = padding + (index / (priceHistory.length - 1)) * (chartWidth - 2 * padding);
      const y = padding + ((maxPrice - point.price) / priceRange) * (chartHeight - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="absolute inset-0">
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
          </linearGradient>
        </defs>
        
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map(i => (
          <line
            key={`h-${i}`}
            x1={padding}
            y1={padding + (i * (chartHeight - 2 * padding) / 4)}
            x2={chartWidth - padding}
            y2={padding + (i * (chartHeight - 2 * padding) / 4)}
            stroke="#374151"
            strokeWidth="1"
            opacity="0.3"
          />
        ))}
        
        {/* Price line */}
        <polyline
          points={points}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Area fill */}
        <polygon
          points={`${padding},${chartHeight - padding} ${points} ${chartWidth - padding},${chartHeight - padding}`}
          fill="url(#priceGradient)"
        />
        
        {/* Current price indicator */}
        {priceHistory.length > 0 && (
          <circle
            cx={padding + ((priceHistory.length - 1) / (priceHistory.length - 1)) * (chartWidth - 2 * padding)}
            cy={padding + ((maxPrice - priceHistory[priceHistory.length - 1].price) / priceRange) * (chartHeight - 2 * padding)}
            r="4"
            fill="#10b981"
            stroke="#ffffff"
            strokeWidth="2"
          />
        )}
      </svg>
    );
  };

  return (
    <Card className={`bg-gray-900 border-gray-800 ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-white">{symbol}</h2>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xl font-bold text-green-400">
                {marketData ? formatPrice(marketData.price) : 'Connecting...'}
              </span>
              {marketData && formatChange(marketData.change)}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {['1H', '4H', '1D', '1W'].map((tf) => (
              <Button
                key={tf}
                variant="ghost"
                size="sm"
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-xs transition-colors ${
                  timeframe === tf
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'text-gray-400 hover:bg-gray-800'
                }`}
              >
                {tf}
              </Button>
            ))}
          </div>
        </div>
        
        {/* Simple Chart Container */}
        <div className="h-80 w-full relative bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {renderSimpleChart()}
        </div>

        {/* Chart Stats */}
        <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
          <div className="flex items-center space-x-4">
            <span>Volume: {marketData ? marketData.volume.toFixed(2) : 'Loading...'}</span>
            <span>High: {marketData ? formatPrice(marketData.high) : 'Loading...'}</span>
            <span>Low: {marketData ? formatPrice(marketData.low) : 'Loading...'}</span>
          </div>
          <div className="text-xs text-gray-500">
            Real-time data • {timeframe} intervals • {priceHistory.length} points
          </div>
        </div>
      </CardContent>
    </Card>
  );
}