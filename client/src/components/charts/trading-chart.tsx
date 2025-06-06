import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
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
  const [lastPrice, setLastPrice] = useState<number>(0);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d5db',
        fontSize: 12,
      },
      grid: {
        vertLines: {
          color: '#374151',
        },
        horzLines: {
          color: '#374151',
        },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#4b5563',
        textColor: '#d1d5db',
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

    // Add line series for real-time price display using v5 API
    const lineSeries = chart.addSeries('Line', {
      color: '#10b981',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

    // Generate initial historical data
    generateInitialData();

    // Cleanup
    return () => {
      chart.remove();
    };
  }, []);

  // Generate initial line data
  const generateInitialData = () => {
    const data = [];
    const now = Math.floor(Date.now() / 1000);
    const basePrice = marketData?.price || 103647;
    let currentPrice = basePrice;

    // Generate 100 points of historical data
    for (let i = 100; i >= 0; i--) {
      const time = now - (i * 60); // 1 minute intervals
      const volatility = 0.001; // Small volatility for smooth line
      
      const change = (Math.random() - 0.5) * 2 * volatility * currentPrice;
      currentPrice = currentPrice + change;

      data.push({
        time: time as any,
        value: Number(currentPrice.toFixed(2)),
      });
    }

    if (lineSeriesRef.current) {
      lineSeriesRef.current.setData(data);
    }
    
    setLastPrice(currentPrice);
  };

  // Update chart with real-time data
  useEffect(() => {
    if (!marketData || !lineSeriesRef.current) return;

    const currentTime = Math.floor(marketData.timestamp / 1000);
    
    // Add new price point
    lineSeriesRef.current.update({
      time: currentTime as any,
      value: marketData.price,
    });

    setLastPrice(marketData.price);
  }, [marketData]);

  // Handle chart resize
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
        
        {/* Chart Container */}
        <div className="h-80 w-full relative">
          <div 
            ref={chartContainerRef} 
            className="absolute inset-0 rounded-lg overflow-hidden"
          />
          {!chartRef.current && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-lg border border-gray-700">
              <div className="text-gray-400">Loading chart...</div>
            </div>
          )}
        </div>

        {/* Chart Stats */}
        <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
          <div className="flex items-center space-x-4">
            <span>Volume: {marketData ? marketData.volume.toFixed(2) : 'Loading...'}</span>
            <span>High: {marketData ? formatPrice(marketData.high) : 'Loading...'}</span>
            <span>Low: {marketData ? formatPrice(marketData.low) : 'Loading...'}</span>
          </div>
          <div className="text-xs text-gray-500">
            Real-time data • {timeframe} intervals
          </div>
        </div>
      </CardContent>
    </Card>
  );
}