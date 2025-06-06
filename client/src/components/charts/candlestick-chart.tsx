import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, SeriesType } from 'lightweight-charts';
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

interface CandlestickChartProps {
  symbol?: string;
  marketData?: MarketData;
  className?: string;
}

export function CandlestickChart({ symbol = 'BTCUSDT', marketData, className }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 400,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#d1d4dc',
        },
        grid: {
          vertLines: { color: '#2B2B43' },
          horzLines: { color: '#2B2B43' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#485158',
        },
        timeScale: {
          borderColor: '#485158',
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

      // Create candlestick series using correct v5 API
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        borderVisible: false,
      });

      chartRef.current = chart;
      seriesRef.current = candlestickSeries;

      // Generate initial candlestick data with minute intervals
      const now = Date.now();
      const basePrice = marketData?.price || 103800;
      const initialData = [];
      
      for (let i = 100; i >= 0; i--) {
        const timestamp = Math.floor((now - i * 60000) / 60000) * 60; // Minute intervals
        
        const priceVariation = (Math.random() - 0.5) * 200;
        const open = basePrice + priceVariation;
        const close = open + (Math.random() - 0.5) * 100;
        const high = Math.max(open, close) + Math.random() * 50;
        const low = Math.min(open, close) - Math.random() * 50;
        
        initialData.push({
          time: timestamp as any,
          open: Math.max(0, open),
          high: Math.max(0, high),
          low: Math.max(0, low),
          close: Math.max(0, close),
        });
      }
      
      candlestickSeries.setData(initialData);
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
      console.error('Candlestick chart initialization error:', error);
    }
  }, []);

  // Update chart with real-time data
  useEffect(() => {
    if (!marketData || !seriesRef.current) return;

    // Convert timestamp to seconds and round to minute intervals
    const currentTime = Math.floor(marketData.timestamp / 60000) * 60;
    
    // Create candlestick data from ticker update with realistic OHLC
    const candlestickData = {
      time: currentTime as any,
      open: lastPrice || marketData.price * 0.9995,
      high: marketData.price * 1.0005,
      low: marketData.price * 0.9995,
      close: marketData.price,
    };
    
    seriesRef.current.update(candlestickData);

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
                <div className="text-sm text-gray-400">
                  Vol: {marketData.volume.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Timeframe Buttons */}
          <div className="flex space-x-1">
            {timeframes.map((timeframe) => (
              <Button
                key={timeframe}
                variant="outline"
                size="sm"
                className="px-3 py-1 text-xs border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                {timeframe}
              </Button>
            ))}
          </div>
        </div>

        {/* Chart Container */}
        <div 
          ref={chartContainerRef} 
          className="w-full h-96 border border-gray-700 rounded-lg bg-gray-800"
        />

        {/* Chart Footer */}
        <div className="flex justify-between items-center mt-4 text-sm text-gray-400">
          <div className="flex space-x-4">
            <span>High: {formatPrice(marketData?.high || 0)}</span>
            <span>Low: {formatPrice(marketData?.low || 0)}</span>
          </div>
          <div>
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}