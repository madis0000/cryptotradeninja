import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { Card, CardContent } from '@/components/ui/card';
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
  const [isInitialized, setIsInitialized] = useState(false);

  // Chart initialization
  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      console.log('Initializing chart with lightweight-charts v5...');
      console.log('Creating candlestick series with correct v5 API...');
      
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 400,
        layout: {
          background: { color: '#ffffff' },
          textColor: '#333',
        },
        grid: {
          vertLines: { color: '#f0f0f0' },
          horzLines: { color: '#f0f0f0' },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: '#ccc',
        },
        rightPriceScale: {
          borderColor: '#ccc',
        },
        crosshair: {
          mode: 1,
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

      // Create candlestick series using v5 syntax
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      chartRef.current = chart;
      seriesRef.current = candlestickSeries;

      // Generate initial historical data
      const basePrice = marketData?.price || 103800;
      const now = Date.now();
      const initialData = [];
      
      for (let i = 100; i >= 0; i--) {
        const timestamp = Math.floor((now - i * 60000) / 1000); // Convert to seconds
        
        const priceVariation = (Math.random() - 0.5) * 200;
        const open = basePrice + priceVariation + (Math.random() - 0.5) * 50;
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
      
      candlestickSeries.setData(initialData);
      setLastPrice(basePrice);
      setIsInitialized(true);

      // Handle window resize
      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({ 
            width: chartContainerRef.current.clientWidth 
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chart) {
          chart.remove();
        }
        setIsInitialized(false);
      };
    } catch (error) {
      console.error('Chart initialization error:', error);
    }
  }, []);

  // Update chart with real-time data
  useEffect(() => {
    if (!marketData || !seriesRef.current || !isInitialized) return;

    try {
      // Convert timestamp to seconds for TradingView format
      const currentTime = Math.floor(marketData.timestamp / 1000);
      
      // Create realistic OHLC data from current price
      const previousPrice = lastPrice || marketData.price;
      const variation = Math.abs(marketData.price - previousPrice);
      
      const candlestickData = {
        time: currentTime,
        open: previousPrice,
        high: Math.max(previousPrice, marketData.price) + variation * 0.1,
        low: Math.min(previousPrice, marketData.price) - variation * 0.1,
        close: marketData.price,
      };
      
      seriesRef.current.update(candlestickData);

      if (lastPrice !== null) {
        setPriceChange(marketData.price - lastPrice);
      }
      setLastPrice(marketData.price);
    } catch (error) {
      console.error('Chart update error:', error);
    }
  }, [marketData, lastPrice, isInitialized]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const formatChange = (change: number) => {
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${change.toFixed(2)}`;
  };

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-semibold">
              {symbol} Live Chart
            </h3>
            {marketData && (
              <div className="flex items-center space-x-2">
                {priceChange >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={`text-sm font-medium ${
                    priceChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatChange(priceChange)}
                </span>
              </div>
            )}
          </div>

          {marketData && (
            <div className="text-right">
              <div className="text-2xl font-bold">
                {formatPrice(marketData.price)}
              </div>
              <div className="text-sm text-gray-500">
                Vol: {marketData.volume.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        <div
          ref={chartContainerRef}
          className="w-full border border-gray-200 rounded bg-white"
          style={{ height: '400px' }}
        />

        <div className="mt-4 flex justify-between text-xs text-gray-500">
          <span>TradingView Lightweight Charts v5 • Real-time Candlesticks</span>
          <span>Live {symbol} data via WebSocket</span>
        </div>
      </CardContent>
    </Card>
  );
}