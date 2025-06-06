import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown } from 'lucide-react';

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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [timeframe, setTimeframe] = useState('1H');
  const [priceChange, setPriceChange] = useState<number>(0);
  const [lastPrice, setLastPrice] = useState<number | null>(null);

  // Initialize TradingView Lightweight Charts
  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 320,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#d1d5db',
        },
        grid: {
          vertLines: { color: '#374151' },
          horzLines: { color: '#374151' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#4b5563',
        },
        timeScale: {
          borderColor: '#4b5563',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      // Create area series using TradingView v5 API
      const areaSeries = chart.addAreaSeries({
        topColor: 'rgba(16, 185, 129, 0.56)',
        bottomColor: 'rgba(16, 185, 129, 0.04)',
        lineColor: 'rgba(16, 185, 129, 1)',
        lineWidth: 2,
      });

      chartRef.current = chart;
      seriesRef.current = lineSeries;

      // Generate initial data with proper timestamps
      const initialData = [];
      const now = Math.floor(Date.now() / 1000);
      const basePrice = marketData?.price || 103600;
      
      for (let i = 50; i >= 0; i--) {
        initialData.push({
          time: (now - i * 60) as any,
          value: basePrice + (Math.random() - 0.5) * 100,
        });
      }
      
      lineSeries.setData(initialData);
      setLastPrice(basePrice);

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
        }
      };
    } catch (error) {
      console.error('Chart initialization error:', error);
    }
  }, []);

  // Update chart with real-time data
  useEffect(() => {
    if (!marketData || !seriesRef.current) return;

    const currentTime = Math.floor(marketData.timestamp / 1000);
    
    // Update chart with real-time price
    seriesRef.current.update({
      time: currentTime as any,
      value: marketData.price,
    });

    // Calculate price change
    if (lastPrice !== null) {
      setPriceChange(marketData.price - lastPrice);
    }
    setLastPrice(marketData.price);
  }, [marketData, lastPrice]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const timeframes = ['1M', '5M', '15M', '1H', '4H', '1D'];

  return (
    <Card className={`bg-gray-900 border-gray-700 ${className}`}>
      <CardContent className="p-6">
        {/* Chart Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-white">{symbol}</h3>
            {marketData && (
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold text-white">
                  {formatPrice(marketData.price)}
                </span>
                <div className={`flex items-center space-x-1 ${priceChange > 0 ? 'text-green-500' : priceChange < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {priceChange > 0 ? <TrendingUp className="w-4 h-4" /> : priceChange < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                  <span className="text-sm">
                    {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {/* Timeframe buttons */}
          <div className="flex items-center space-x-1">
            {timeframes.map((tf) => (
              <Button
                key={tf}
                variant={timeframe === tf ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeframe(tf)}
                className="text-xs"
              >
                {tf}
              </Button>
            ))}
          </div>
        </div>
        
        {/* TradingView Chart Container */}
        <div className="h-80 w-full relative bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div 
            ref={chartContainerRef} 
            className="absolute inset-0 rounded-lg overflow-hidden"
          />
        </div>

        {/* Chart Stats */}
        <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
          <div className="flex items-center space-x-4">
            <span>Volume: {marketData ? marketData.volume.toFixed(2) : 'Loading...'}</span>
            <span>High: {marketData ? formatPrice(marketData.high) : 'Loading...'}</span>
            <span>Low: {marketData ? formatPrice(marketData.low) : 'Loading...'}</span>
          </div>
          <div className="text-xs text-gray-500">
            Real-time data • {timeframe} intervals • TradingView Professional
          </div>
        </div>
      </CardContent>
    </Card>
  );
}