import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TradingChartProps {
  className?: string;
  symbol?: string;
}

export function TradingChart({ className, symbol = 'BTCUSDT' }: TradingChartProps) {
  const [currentInterval, setCurrentInterval] = useState('1m');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart with professional styling
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2d3748' },
        horzLines: { color: '#2d3748' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#485563',
        textColor: '#d1d5db',
      },
      timeScale: {
        borderColor: '#485563',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Create candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: {
        type: 'price',
        precision: symbol.includes('BTC') ? 2 : 5,
        minMove: symbol.includes('BTC') ? 0.01 : 0.00001,
      },
    });

    // Create volume series
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol]);

  useEffect(() => {
    // Connect to WebSocket for kline data
    connectToKlineStream();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [symbol, currentInterval]);

  const connectToKlineStream = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[CHART] Connected to WebSocket for ${symbol} klines`);
      setIsConnected(true);
      
      // Request kline data for the chart
      ws.send(JSON.stringify({
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [symbol],
        interval: currentInterval
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'kline_update' && message.data) {
          handleKlineUpdate(message.data);
        } else if (message.type === 'historical_klines' && message.data) {
          handleHistoricalData(message.data);
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
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    const candlestickData: KlineData[] = [];
    const volumeData: Array<{ time: UTCTimestamp; value: number; color?: string }> = [];

    klines.forEach((kline) => {
      const time = Math.floor(kline.openTime / 1000) as UTCTimestamp;
      const open = parseFloat(kline.open);
      const high = parseFloat(kline.high);
      const low = parseFloat(kline.low);
      const close = parseFloat(kline.close);
      const volume = parseFloat(kline.volume);

      candlestickData.push({ time, open, high, low, close, volume });
      volumeData.push({ 
        time, 
        value: volume,
        color: close >= open ? '#26a69a80' : '#ef535080'
      });
    });

    candlestickSeriesRef.current.setData(candlestickData);
    volumeSeriesRef.current.setData(volumeData);
  };

  const handleKlineUpdate = (kline: any) => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    const time = Math.floor(kline.openTime / 1000) as UTCTimestamp;
    const open = parseFloat(kline.open);
    const high = parseFloat(kline.high);
    const low = parseFloat(kline.low);
    const close = parseFloat(kline.close);
    const volume = parseFloat(kline.volume);

    const candlestickUpdate = { time, open, high, low, close, volume };
    const volumeUpdate = { 
      time, 
      value: volume,
      color: close >= open ? '#26a69a80' : '#ef535080'
    };

    candlestickSeriesRef.current.update(candlestickUpdate);
    volumeSeriesRef.current.update(volumeUpdate);
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
    { label: '6h', value: '6h' },
    { label: '8h', value: '8h' },
    { label: '12h', value: '12h' },
    { label: '1d', value: '1d' },
    { label: '3d', value: '3d' },
    { label: '1w', value: '1w' },
    { label: '1M', value: '1M' }
  ];

  return (
    <div className={cn("relative bg-crypto-dark", className)}>
      {/* Chart Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
        <div className="flex items-center space-x-1 bg-crypto-darker rounded-lg p-1">
          {intervals.slice(0, 8).map((interval) => (
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
      </div>

      {/* Chart Container */}
      <div 
        ref={chartContainerRef} 
        className="w-full h-full min-h-[400px]"
      />
    </div>
  );
}