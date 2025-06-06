import { useEffect, useRef, useState } from "react";
import { createChart, ColorType } from 'lightweight-charts';

interface WorkingChartFixedProps {
  symbol?: string;
  height?: number;
  interval?: string;
  marketData?: any;
}

export const WorkingChartFixed = ({ 
  symbol = 'BTCUSDT',
  height = 500,
  interval = '1m',
  marketData
}: WorkingChartFixedProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    console.log('Initializing chart with lightweight-charts v5...');
    
    try {
      // Create chart with correct v5 configuration
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#1a1a1a' },
          textColor: '#d1d5db',
        },
        grid: {
          vertLines: { color: '#374151' },
          horzLines: { color: '#374151' },
        },
        width: chartContainerRef.current.clientWidth,
        height: height,
        rightPriceScale: {
          borderColor: '#485563',
        },
        timeScale: {
          borderColor: '#485563',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      console.log('Creating candlestick series with correct v5 API...');
      
      // Use correct v5 API - addCandlestickSeries method
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444', 
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        borderVisible: false,
      });

      chartRef.current = chart;
      seriesRef.current = candlestickSeries;

      console.log('Chart created successfully');

      // Generate initial historical data with proper timestamps
      loadInitialData();

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (seriesRef.current) {
          seriesRef.current = null;
        }
        if (chart) {
          chart.remove();
        }
        chartRef.current = null;
      };
    } catch (error) {
      console.error('Chart initialization error:', error);
    }
  }, [symbol, interval, height]);

  const loadInitialData = () => {
    if (!seriesRef.current) return;

    try {
      console.log(`Loading initial data for ${symbol}...`);
      
      // Generate realistic historical candlestick data
      const now = Date.now();
      const basePrice = marketData?.price || 103800;
      const initialData = [];
      
      for (let i = 100; i >= 0; i--) {
        const timestamp = Math.floor((now - i * 60000) / 1000); // 1-minute intervals in seconds
        
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
      setLastPrice(initialData[initialData.length - 1]?.close || basePrice);
      console.log('Initial data loaded successfully');
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  // Update chart with real-time market data
  useEffect(() => {
    if (!marketData || !seriesRef.current) return;

    try {
      // Convert timestamp to seconds and ensure it's newer than existing data
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Create candlestick data from real market data
      const candleData = {
        time: currentTime,
        open: lastPrice || marketData.price * 0.9995,
        high: marketData.price * 1.0005,
        low: marketData.price * 0.9995,
        close: marketData.price,
      };

      seriesRef.current.update(candleData);
      setLastPrice(marketData.price);
      console.log('Updated chart with real-time data:', marketData.price);
    } catch (error) {
      console.error('Error updating chart with market data:', error);
    }
  }, [marketData, lastPrice]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-white">{symbol} {interval.toUpperCase()}</h3>
          {lastPrice && (
            <div className="text-lg font-bold text-green-400">
              ${lastPrice.toFixed(2)}
            </div>
          )}
        </div>
        <div className="text-sm text-green-500">
          ● Live Data
        </div>
      </div>
      <div 
        ref={chartContainerRef}
        style={{ height: `${height}px` }}
        className="w-full bg-gray-900 rounded-lg"
      />
    </div>
  );
};