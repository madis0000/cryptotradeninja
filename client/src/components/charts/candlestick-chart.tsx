import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
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
  const [selectedInterval, setSelectedInterval] = useState<string>('1m');

  const loadHistoricalData = async (interval: string = selectedInterval) => {
    try {
      const response = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}&limit=100`);
      if (!response.ok) throw new Error('Failed to fetch historical data');
      
      const data = await response.json();
      
      if (data.length > 0 && seriesRef.current) {
        // Convert to TradingView format
        const chartData = data.map((candle: any) => ({
          time: Math.floor(candle.openTime / 1000),
          open: parseFloat(candle.open),
          high: parseFloat(candle.high),
          low: parseFloat(candle.low),
          close: parseFloat(candle.close),
        }));

        seriesRef.current.setData(chartData);
        
        // Update current price display
        const latestPrice = parseFloat(data[data.length - 1].close);
        setLastPrice(latestPrice);
      }
    } catch (error) {
      console.error('Failed to load historical data:', error);
      // Fallback to simple data if historical data fails
      generateFallbackData();
    }
  };

  const generateFallbackData = () => {
    if (!seriesRef.current) return;
    
    const now = Math.floor(Date.now() / 1000);
    const basePrice = marketData?.price || 103800;
    const initialData = [];
    
    for (let i = 100; i >= 0; i--) {
      const timestamp = now - (i * 60); // 1-minute intervals
      
      const priceVariation = (Math.random() - 0.5) * 200;
      const open = basePrice + priceVariation;
      const close = open + (Math.random() - 0.5) * 100;
      const high = Math.max(open, close) + Math.random() * 50;
      const low = Math.min(open, close) - Math.random() * 50;
      
      initialData.push({
        time: timestamp,
        open: Math.max(0, open),
        high: Math.max(0, high),
        low: Math.max(0, low),
        close: Math.max(0, close),
      });
    }
    
    seriesRef.current.setData(initialData);
    setLastPrice(basePrice);
  };

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
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      chartRef.current = chart;
      seriesRef.current = candlestickSeries;

      // Load historical klines data
      loadHistoricalData();
      
      // Configure WebSocket for kline streams on initial load
      setTimeout(() => {
        configureKlineStream(selectedInterval);
      }, 1000);

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

    // Convert timestamp to seconds for TradingView format
    const currentTime = Math.floor(marketData.timestamp / 1000);
    
    // Create candlestick data from ticker update
    const candlestickData = {
      time: currentTime,
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

  const timeframes = [
    { label: '1M', value: '1m' },
    { label: '5M', value: '5m' },
    { label: '15M', value: '15m' },
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' }
  ];

  const configureKlineStream = async (interval: string) => {
    try {
      const response = await fetch('/api/websocket/configure-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataType: 'kline',
          symbols: [symbol],
          interval: interval
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[CHART] Successfully configured kline stream for interval:', interval, result);
      } else {
        console.error('[CHART] Failed to configure kline stream:', response.status);
      }
    } catch (error) {
      console.error('[CHART] Error configuring kline stream:', error);
    }
  };

  const handleTimeframeChange = async (interval: string) => {
    console.log('[CHART] Switching to interval:', interval);
    setSelectedInterval(interval);
    
    // Reload historical data with new interval
    await loadHistoricalData(interval);
    
    // Configure WebSocket stream for kline data with the selected interval
    await configureKlineStream(interval);
  };

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
                key={timeframe.value}
                variant={selectedInterval === timeframe.value ? "default" : "outline"}
                size="sm"
                onClick={() => handleTimeframeChange(timeframe.value)}
                className={`px-3 py-1 text-xs border-gray-600 hover:bg-gray-700 ${
                  selectedInterval === timeframe.value 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'text-gray-300'
                }`}
              >
                {timeframe.label}
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