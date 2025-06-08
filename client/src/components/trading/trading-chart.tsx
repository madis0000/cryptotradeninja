import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import { cn } from '@/lib/utils';

interface TradingChartProps {
  className?: string;
  symbol?: string;
}

export function TradingChart({ className, symbol = 'BTCUSDT' }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [currentInterval, setCurrentInterval] = useState('1m');
  const [isConnected, setIsConnected] = useState(false);
  const [priceData, setPriceData] = useState<any[]>([]);

  useEffect(() => {
    // Initialize TradingView chart
    initializeChart();
    
    // Connect to WebSocket for real-time data
    connectToKlineStream();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [symbol, currentInterval]);

  const initializeChart = () => {
    if (!chartContainerRef.current) return;

    // Remove existing chart
    if (chartRef.current) {
      chartRef.current.remove();
    }

    // Create new chart with v5 API
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
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      crosshair: {
        mode: 1,
      },
    });

    // Add candlestick series with v5 API
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  };

  const connectToKlineStream = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}:8080`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[CHART] Connected to WebSocket for ${symbol} klines`);
      setIsConnected(true);
      
      // Send connected message
      const connectedMsg = {
        type: 'connected',
        clientId: 'chart_klines',
        message: 'Chart component requesting kline data'
      };
      console.log('[CHART] Sending connected message:', connectedMsg);
      ws.send(JSON.stringify(connectedMsg));
      
      // Request kline data
      setTimeout(() => {
        const klineMsg = {
          type: 'configure_stream',
          dataType: 'kline',
          symbols: [symbol],
          interval: currentInterval
        };
        console.log('[CHART] Sending kline configuration:', klineMsg);
        ws.send(JSON.stringify(klineMsg));
      }, 100);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[CHART] Received message:', message);
        
        if (message.type === 'connected') {
          console.log('[CHART] Connected to kline WebSocket server');
        } else if (message.type === 'kline_update' && message.data) {
          console.log('[CHART] Received kline update:', message.data);
          handleKlineUpdate(message.data);
        } else if (message.type === 'historical_klines' && message.data) {
          console.log('[CHART] Received historical klines:', message.data);
          if (message.data.klines) {
            handleHistoricalData(message.data.klines);
          } else {
            handleHistoricalData(message.data);
          }
        } else if (message.type === 'market_update') {
          console.log('[CHART] Ignoring ticker update on kline connection');
        }
      } catch (error) {
        console.error('[CHART] WebSocket message parse error:', error);
      }
    };

    ws.onclose = () => {
      console.log(`[CHART] WebSocket disconnected for ${symbol}`);
      setIsConnected(false);
      
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          connectToKlineStream();
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('[CHART] WebSocket error:', error);
    };
  };

  const handleKlineUpdate = (klineData: any) => {
    console.log('[CHART] Processing kline data:', klineData);
    
    if (!seriesRef.current) return;
    
    const candlestick = {
      time: Math.floor(klineData.openTime / 1000),
      open: klineData.open,
      high: klineData.high,
      low: klineData.low,
      close: klineData.close,
    };
    
    setPriceData(prev => {
      const updated = [...prev];
      const existingIndex = updated.findIndex(item => item.time === candlestick.time);
      
      if (existingIndex >= 0) {
        updated[existingIndex] = candlestick;
        seriesRef.current?.update(candlestick);
      } else {
        updated.push(candlestick);
        seriesRef.current?.update(candlestick);
      }
      
      return updated.sort((a, b) => a.time - b.time);
    });
  };

  const handleHistoricalData = (klines: any[]) => {
    console.log('[CHART] Processing historical data:', klines);
    if (!seriesRef.current || !Array.isArray(klines)) return;
    
    const candles = klines.map(kline => ({
      time: Math.floor(kline.openTime / 1000),
      open: parseFloat(kline.open),
      high: parseFloat(kline.high),
      low: parseFloat(kline.low),
      close: parseFloat(kline.close),
    }));

    const sortedCandles = candles.sort((a, b) => a.time - b.time);
    setPriceData(sortedCandles);
    
    seriesRef.current.setData(sortedCandles);
  };

  const intervals = [
    { label: '1m', value: '1m' },
    { label: '3m', value: '3m' },
    { label: '5m', value: '5m' },
    { label: '15m', value: '15m' },
    { label: '30m', value: '30m' },
    { label: '1h', value: '1h' },
    { label: '4h', value: '4h' },
    { label: '1d', value: '1d' },
  ];

  const handleIntervalChange = (newInterval: string) => {
    setCurrentInterval(newInterval);
  };

  return (
    <div className={cn("bg-card border rounded-lg", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold">{symbol} Chart</h3>
          <div className={cn(
            "w-2 h-2 rounded-full",
            isConnected ? "bg-green-500" : "bg-red-500"
          )} />
          <span className="text-sm text-muted-foreground">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        {/* Interval selector */}
        <div className="flex space-x-1">
          {intervals.map((interval) => (
            <button
              key={interval.value}
              onClick={() => handleIntervalChange(interval.value)}
              className={cn(
                "px-3 py-1 text-xs rounded transition-colors",
                currentInterval === interval.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              {interval.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div className="relative">
        <div ref={chartContainerRef} className="w-full h-[400px]" />
        
        {!isConnected && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Connecting to market data...</p>
            </div>
          </div>
        )}
      </div>

      {/* Data table */}
      <div className="p-4 border-t">
        <div className="grid grid-cols-5 gap-4 text-sm">
          <div className="text-center">
            <p className="text-muted-foreground">Open</p>
            <p className="font-mono">
              {priceData.length > 0 ? priceData[priceData.length - 1]?.open?.toFixed(2) : '--'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">High</p>
            <p className="font-mono text-green-500">
              {priceData.length > 0 ? priceData[priceData.length - 1]?.high?.toFixed(2) : '--'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Low</p>
            <p className="font-mono text-red-500">
              {priceData.length > 0 ? priceData[priceData.length - 1]?.low?.toFixed(2) : '--'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Close</p>
            <p className="font-mono">
              {priceData.length > 0 ? priceData[priceData.length - 1]?.close?.toFixed(2) : '--'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Candles</p>
            <p className="font-mono">{priceData.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}