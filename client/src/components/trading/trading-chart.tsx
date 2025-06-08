import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { useChartWebSocket } from '@/hooks/useChartWebSocket';

interface TradingStrategy {
  baseOrderPrice: number;
  takeProfitDeviation: number;
  safetyOrderDeviation: number;
  maxSafetyOrders: number;
  priceDeviationMultiplier: number;
}

interface TradingChartProps {
  className?: string;
  symbol?: string;
  strategy?: TradingStrategy;
}

export function TradingChart({ className, symbol = 'BTCUSDT', strategy }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const takeProfitLineRef = useRef<any>(null);
  const safetyOrderLinesRef = useRef<any[]>([]);
  const [currentInterval, setCurrentInterval] = useState('1m');
  const [priceData, setPriceData] = useState<any[]>([]);

  // Handle kline updates from WebSocket
  const handleKlineUpdate = (klineData: any) => {
    console.log('[CHART] Processing kline data:', klineData);
    
    if (!seriesRef.current) return;
    
    // Ensure we have valid numeric values and proper time formatting
    const openTime = typeof klineData.openTime === 'number' ? klineData.openTime : parseInt(klineData.openTime);
    const timeInSeconds = Math.floor(openTime / 1000);
    
    const candlestick = {
      time: timeInSeconds,
      open: parseFloat(klineData.open),
      high: parseFloat(klineData.high),
      low: parseFloat(klineData.low),
      close: parseFloat(klineData.close),
    };
    
    // Validate the candlestick data before processing
    if (!Number.isFinite(candlestick.time) || 
        !Number.isFinite(candlestick.open) || 
        !Number.isFinite(candlestick.high) || 
        !Number.isFinite(candlestick.low) || 
        !Number.isFinite(candlestick.close)) {
      console.warn('[CHART] Invalid candlestick data, skipping:', candlestick);
      return;
    }
    
    setPriceData(prev => {
      const updated = [...prev];
      const existingIndex = updated.findIndex(item => item.time === candlestick.time);
      
      if (existingIndex >= 0) {
        updated[existingIndex] = candlestick;
      } else {
        updated.push(candlestick);
      }
      
      const sortedData = updated.sort((a, b) => a.time - b.time);
      
      try {
        seriesRef.current?.update(candlestick);
      } catch (error) {
        console.error('[CHART] Error updating chart series:', error);
        // If update fails, try setting the data fresh
        if (sortedData.length > 0) {
          seriesRef.current?.setData(sortedData);
        }
      }
      
      return sortedData;
    });
  };

  // Function to clear strategy lines
  const clearStrategyLines = () => {
    if (takeProfitLineRef.current) {
      chartRef.current?.removeSeries(takeProfitLineRef.current);
      takeProfitLineRef.current = null;
    }

    safetyOrderLinesRef.current.forEach(line => {
      if (line) {
        chartRef.current?.removeSeries(line);
      }
    });
    safetyOrderLinesRef.current = [];
  };

  // Function to draw strategy lines
  const drawStrategyLines = (chart: any, strategy: TradingStrategy) => {
    // Clear existing lines
    clearStrategyLines();

    const { baseOrderPrice, takeProfitDeviation, safetyOrderDeviation, maxSafetyOrders, priceDeviationMultiplier } = strategy;

    // Calculate Take Profit price (above base order)
    const takeProfitPrice = baseOrderPrice + (baseOrderPrice * takeProfitDeviation / 100);

    // Draw Take Profit line (solid red)
    const takeProfitLine = chart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 2,
      lineStyle: 0, // Solid line
      title: 'Take Profit',
    });

    // Create line data spanning current chart time range
    const currentTime = Math.floor(Date.now() / 1000);
    const takeProfitData = [
      { time: currentTime - 86400, value: takeProfitPrice }, // 24 hours ago
      { time: currentTime + 86400, value: takeProfitPrice }, // 24 hours ahead
    ];

    takeProfitLine.setData(takeProfitData);
    takeProfitLineRef.current = takeProfitLine;

    // Calculate and draw Safety Order lines (dashed yellow)
    const safetyLines: any[] = [];
    for (let i = 0; i < maxSafetyOrders; i++) {
      // Calculate safety order price using deviation multiplier
      const deviation = safetyOrderDeviation * Math.pow(priceDeviationMultiplier, i);
      const safetyOrderPrice = baseOrderPrice - (baseOrderPrice * deviation / 100);

      const safetyLine = chart.addSeries(LineSeries, {
        color: '#eab308',
        lineWidth: 1,
        lineStyle: 1, // Dashed line
        title: `Safety Order ${i + 1}`,
      });

      const safetyData = [
        { time: currentTime - 86400, value: safetyOrderPrice },
        { time: currentTime + 86400, value: safetyOrderPrice },
      ];

      safetyLine.setData(safetyData);
      safetyLines.push(safetyLine);
    }

    safetyOrderLinesRef.current = safetyLines;
  };

  // Use dedicated chart WebSocket hook
  const chartWs = useChartWebSocket(symbol, currentInterval, {
    onKlineUpdate: handleKlineUpdate,
    onConnect: () => console.log('[CHART] Connected to kline WebSocket server'),
    onDisconnect: () => console.log('[CHART] Disconnected from kline WebSocket server'),
    onError: (error) => console.error('[CHART] WebSocket error:', error)
  });

  // Initialize chart
  const initializeChart = () => {
    if (!chartContainerRef.current) return;

    // Remove existing chart safely
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (error) {
        console.log('[CHART] Chart already disposed:', error);
      }
      chartRef.current = null;
      seriesRef.current = null;
    }

    // Create new chart with transparent background
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
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

    // Add candlestick series
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

    // Draw strategy lines if strategy is provided
    if (strategy) {
      drawStrategyLines(chart, strategy);
    }

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

  // Initialize chart on component mount
  useEffect(() => {
    initializeChart();
    chartWs.connect();

    return () => {
      chartWs.disconnect();
      
      // Cleanup chart safely
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.log('[CHART] Cleanup: Chart already disposed');
        }
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, []);

  // Update symbol when prop changes
  useEffect(() => {
    if (chartWs.currentSymbol !== symbol) {
      chartWs.changeSymbol(symbol);
      setPriceData([]); // Clear existing data
      
      // Clear chart series and auto-fit after new data loads
      if (seriesRef.current) {
        seriesRef.current.setData([]);
      }
      
      // Auto-fit chart to new symbol's price range after data loads
      setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }, 1500);
    }
  }, [symbol, chartWs]);

  // Update interval when state changes
  useEffect(() => {
    if (chartWs.currentInterval !== currentInterval) {
      console.log(`[CHART] Switching to ${currentInterval} interval`);
      chartWs.changeInterval(currentInterval);
      
      // Clear existing data and reset chart series for new interval
      setPriceData([]);
      if (seriesRef.current) {
        try {
          seriesRef.current.setData([]);
        } catch (error) {
          console.log('[CHART] Chart series reset during interval change');
        }
      }
    }
  }, [currentInterval, chartWs]);

  // Update strategy lines when strategy prop changes or price data updates
  useEffect(() => {
    if (chartRef.current && strategy && priceData.length > 0) {
      // Use current market price from latest candlestick data
      const latestPrice = priceData[priceData.length - 1]?.close || strategy.baseOrderPrice;
      const dynamicStrategy = {
        ...strategy,
        baseOrderPrice: latestPrice
      };
      drawStrategyLines(chartRef.current, dynamicStrategy);
    } else if (chartRef.current && !strategy) {
      clearStrategyLines();
    }
  }, [strategy, priceData]);

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
    if (newInterval === currentInterval) return;
    
    console.log(`[CHART] Changing interval from ${currentInterval} to ${newInterval}`);
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
            chartWs.status === 'connected' ? "bg-green-500" : "bg-red-500"
          )} />
          <span className="text-sm text-muted-foreground">
            {chartWs.status === 'connected' ? 'Connected' : 'Disconnected'}
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
        
        {chartWs.status !== 'connected' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Connecting to market data...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}