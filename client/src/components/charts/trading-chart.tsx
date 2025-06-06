import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
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

interface CandlestickData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function TradingChart({ symbol = 'BTCUSDT', marketData, className }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [timeframe, setTimeframe] = useState('1H');
  const [chartData, setChartData] = useState<CandlestickData[]>([]);

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
      watermark: {
        visible: false,
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

    // Add candlestick series using v5 syntax
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    // Generate initial data from live price
    generateInitialData();

    // Cleanup
    return () => {
      chart.remove();
    };
  }, []);

  // Generate realistic initial candlestick data based on current market price
  const generateInitialData = () => {
    const data: CandlestickData[] = [];
    const now = Math.floor(Date.now() / 1000);
    const basePrice = marketData?.price || 103647; // Use live price if available
    let currentPrice = basePrice;

    // Generate 100 candles of historical data
    for (let i = 100; i >= 0; i--) {
      const time = now - (i * 3600); // 1 hour intervals
      const volatility = 0.02; // 2% volatility
      
      const open = currentPrice;
      const change = (Math.random() - 0.5) * 2 * volatility * currentPrice;
      const close = open + change;
      
      const high = Math.max(open, close) + Math.random() * 0.005 * currentPrice;
      const low = Math.min(open, close) - Math.random() * 0.005 * currentPrice;

      data.push({
        time,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
      });

      currentPrice = close;
    }

    setChartData(data);
    
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(data);
    }
  };

  // Update chart with real-time data
  useEffect(() => {
    if (!marketData || !candlestickSeriesRef.current) return;

    const currentTime = Math.floor(marketData.timestamp / 1000);
    const latestCandle = chartData[chartData.length - 1];
    
    if (!latestCandle) return;

    // Check if we should update the current candle or create a new one
    const hoursSinceLastCandle = (currentTime - latestCandle.time) / 3600;
    
    if (hoursSinceLastCandle >= 1) {
      // Create new candle
      const newCandle: CandlestickData = {
        time: currentTime,
        open: latestCandle.close,
        high: Math.max(latestCandle.close, marketData.price),
        low: Math.min(latestCandle.close, marketData.price),
        close: marketData.price,
      };

      const updatedData = [...chartData, newCandle];
      setChartData(updatedData);
      candlestickSeriesRef.current.update(newCandle);
    } else {
      // Update current candle
      const updatedCandle: CandlestickData = {
        ...latestCandle,
        high: Math.max(latestCandle.high, marketData.price),
        low: Math.min(latestCandle.low, marketData.price),
        close: marketData.price,
      };

      const updatedData = [...chartData];
      updatedData[updatedData.length - 1] = updatedCandle;
      setChartData(updatedData);
      candlestickSeriesRef.current.update(updatedCandle);
    }
  }, [marketData, chartData]);

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
          ? 'text-crypto-success bg-crypto-success/10' 
          : 'text-crypto-danger bg-crypto-danger/10'
      }`}>
        {isPositive ? '+' : ''}{change.toFixed(2)}%
      </span>
    );
  };

  return (
    <Card className={`bg-crypto-dark border-gray-800 ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-white">{symbol}</h2>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xl font-bold text-crypto-success">
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
                    ? 'bg-crypto-accent/10 text-crypto-accent border border-crypto-accent/20'
                    : 'text-crypto-light hover:bg-gray-800'
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
            <div className="absolute inset-0 flex items-center justify-center bg-crypto-darker rounded-lg border border-gray-800">
              <div className="text-crypto-light">Loading chart...</div>
            </div>
          )}
        </div>

        {/* Chart Stats */}
        <div className="mt-4 flex items-center justify-between text-sm text-crypto-light">
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