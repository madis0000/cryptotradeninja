import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const lineSeriesRef = useRef<any>(null);
  const [timeframe, setTimeframe] = useState('1H');

  // Initialize TradingView Lightweight Charts v5
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
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

    // Add line series - v5 API
    const lineSeries = chart.addAreaSeries({
      topColor: 'rgba(16, 185, 129, 0.56)',
      bottomColor: 'rgba(16, 185, 129, 0.04)',
      lineColor: 'rgba(16, 185, 129, 1)',
      lineWidth: 2,
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

    // Generate initial data
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

    // Cleanup
    return () => {
      chart.remove();
    };
  }, []);

  // Update chart with real-time data
  useEffect(() => {
    if (!marketData || !lineSeriesRef.current) return;

    const currentTime = Math.floor(marketData.timestamp / 1000);
    
    lineSeriesRef.current.update({
      time: currentTime as any,
      value: marketData.price,
    });
  }, [marketData]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        
        {/* TradingView Lightweight Charts */}
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