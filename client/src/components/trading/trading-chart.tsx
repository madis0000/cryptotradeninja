import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickData, IChartApi, ISeriesApi } from 'lightweight-charts';
import { cn } from '@/lib/utils';

interface TradingChartProps {
  className?: string;
  symbol?: string;
}

export function TradingChart({ className, symbol = 'BTCUSDT' }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [currentInterval, setCurrentInterval] = useState('1m');
  const [isConnected, setIsConnected] = useState(false);
  const [priceData, setPriceData] = useState<CandlestickData[]>([]);

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
    const candlestickSeries = chart.addCandlestickSeries({
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
      
      // Send connected message to establish client 2 for klines
      const connectedMsg = {
        type: 'connected',
        clientId: 'chart_klines',
        message: 'Chart component requesting kline data'
      };
      console.log('[CHART] Sending connected message:', connectedMsg);
      ws.send(JSON.stringify(connectedMsg));
      
      // Small delay to ensure connection is established
      setTimeout(() => {
        // Request kline data for the chart
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
          // Ignore ticker updates on the kline connection
          console.log('[CHART] Ignoring ticker update on kline connection');
        }
      } catch (error) {
        console.error('[CHART] WebSocket message parse error:', error);
      }
    };

    ws.onclose = () => {
      console.log(`[CHART] WebSocket disconnected for ${symbol}`);
      setIsConnected(false);
      
      // Reconnect after 3 seconds
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

  const handleHistoricalData = (klines: any[]) => {
    const chartData = klines.map((kline) => ({
      time: new Date(kline.openTime).toLocaleTimeString(),
      open: parseFloat(kline.open),
      high: parseFloat(kline.high),
      low: parseFloat(kline.low),
      close: parseFloat(kline.close),
      volume: parseFloat(kline.volume),
    }));

    setPriceData(chartData.slice(-50)); // Keep last 50 candles
  };

  const handleKlineUpdate = (kline: any) => {
    const newData = {
      time: new Date(kline.openTime).toLocaleTimeString(),
      open: parseFloat(kline.open),
      high: parseFloat(kline.high),
      low: parseFloat(kline.low),
      close: parseFloat(kline.close),
      volume: parseFloat(kline.volume),
    };

    setPriceData(prev => {
      const updated = [...prev];
      if (updated.length > 0 && updated[updated.length - 1].time === newData.time) {
        updated[updated.length - 1] = newData; // Update last candle
      } else {
        updated.push(newData); // Add new candle
      }
      return updated.slice(-50); // Keep last 50 candles
    });
  };

  const intervals = [
    { label: '1m', value: '1m' },
    { label: '3m', value: '3m' },
    { label: '5m', value: '5m' },
    { label: '15m', value: '15m' },
    { label: '30m', value: '30m' },
    { label: '1h', value: '1h' },
    { label: '2h', value: '2h' },
    { label: '4h', value: '4h' },
  ];

  const currentPrice = priceData.length > 0 ? priceData[priceData.length - 1].close : 0;
  const priceChange = priceData.length > 1 ? 
    ((currentPrice - priceData[priceData.length - 2].close) / priceData[priceData.length - 2].close * 100) : 0;

  return (
    <div className={cn("relative bg-crypto-dark border border-crypto-border rounded-lg", className)}>
      {/* Chart Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
        <div className="flex items-center space-x-1 bg-crypto-darker rounded-lg p-1">
          {intervals.map((interval) => (
            <button
              key={interval.value}
              onClick={() => setCurrentInterval(interval.value)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded transition-colors",
                currentInterval === interval.value
                  ? "bg-crypto-purple text-white"
                  : "text-crypto-light hover:text-white hover:bg-gray-700"
              )}
            >
              {interval.label}
            </button>
          ))}
        </div>
        
        {/* Connection Status */}
        <div className="flex items-center space-x-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isConnected ? "bg-green-500" : "bg-red-500"
          )} />
          <span className="text-xs text-crypto-light">
            {isConnected ? 'Live' : 'Connecting...'}
          </span>
        </div>

        {/* Symbol Display */}
        <div className="bg-crypto-darker rounded px-3 py-1">
          <span className="text-sm font-medium text-white">
            {symbol.replace('USDT', '/USDT')}
          </span>
        </div>
      </div>

      {/* Price Header */}
      <div className="absolute top-4 right-4 z-10 bg-crypto-darker rounded px-4 py-2">
        <div className="text-right">
          <div className="text-lg font-bold text-white">
            ${currentPrice.toFixed(symbol.includes('BTC') ? 2 : 5)}
          </div>
          <div className={cn(
            "text-sm font-medium",
            priceChange >= 0 ? "text-green-500" : "text-red-500"
          )}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Simple Chart Display */}
      <div className="p-6 pt-20">
        {priceData.length > 0 ? (
          <div className="space-y-4">
            {/* Price Chart Area */}
            <div className="h-80 bg-crypto-darker rounded border border-crypto-border relative overflow-hidden">
              <div className="absolute inset-0 flex items-end justify-between px-2 pb-2">
                {priceData.slice(-20).map((candle, index) => {
                  const isGreen = candle.close >= candle.open;
                  const height = Math.max(5, (Math.abs(candle.high - candle.low) / candle.high) * 200);
                  
                  return (
                    <div key={index} className="flex flex-col items-center space-y-1">
                      <div 
                        className={cn(
                          "w-2 rounded-sm",
                          isGreen ? "bg-green-500" : "bg-red-500"
                        )}
                        style={{ height: `${height}px` }}
                      />
                      <div className="text-xs text-crypto-light transform -rotate-45 whitespace-nowrap">
                        {candle.time.split(':').slice(0, 2).join(':')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-crypto-darker rounded border border-crypto-border">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Recent Price Data</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {priceData.slice(-5).reverse().map((candle, index) => (
                    <div key={index} className="flex justify-between items-center text-xs">
                      <span className="text-crypto-light">{candle.time}</span>
                      <span className="text-white">${candle.close.toFixed(symbol.includes('BTC') ? 2 : 5)}</span>
                      <span className={cn(
                        "font-medium",
                        candle.close >= candle.open ? "text-green-500" : "text-red-500"
                      )}>
                        {candle.close >= candle.open ? '+' : ''}
                        {((candle.close - candle.open) / candle.open * 100).toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center">
            <div className="text-center">
              <div className="text-crypto-light mb-2">Loading chart data...</div>
              <div className="w-8 h-8 border-2 border-crypto-purple border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}