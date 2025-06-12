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
  activeSafetyOrders?: number;
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
  const [currentInterval, setCurrentInterval] = useState('4h');
  const [priceData, setPriceData] = useState<any[]>([]);

  // Handle kline updates from WebSocket
  const handleKlineUpdate = (klineData: any) => {
    console.log('[CHART] Processing kline data:', klineData);
    
    if (!seriesRef.current || !chartRef.current) {
      console.warn('[CHART] Chart or series not initialized, skipping update');
      return;
    }
    
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
      const isFirstData = prev.length === 0;
      
      if (existingIndex >= 0) {
        updated[existingIndex] = candlestick;
      } else {
        updated.push(candlestick);
      }
      
      const sortedData = updated.sort((a, b) => a.time - b.time);
      
      try {
        // Validate chart and series references before updating
        if (seriesRef.current && chartRef.current && 
            typeof seriesRef.current.update === 'function') {
          seriesRef.current.update(candlestick);
          
          // Auto-scale chart when first data arrives for new symbol
          if (isFirstData) {
            console.log('[CHART] Auto-scaling chart for new symbol data');
            setTimeout(() => {
              if (chartRef.current && typeof chartRef.current.timeScale === 'function') {
                try {
                  chartRef.current.timeScale().fitContent();
                  chartRef.current.priceScale('right').applyOptions({
                    autoScale: true,
                  });
                } catch (scaleError) {
                  console.warn('[CHART] Auto-scale failed:', scaleError);
                }
              }
            }, 100);
          }
        }
      } catch (error) {
        // Silently handle update failures - chart may be disposed during hot reload
        console.warn('[CHART] Series update failed - chart may be disposed:', error);
        
        // Only reinitialize if we have a valid container and data
        if (chartContainerRef.current && sortedData.length > 0 && !isFirstData) {
          setTimeout(() => {
            try {
              initializeChart();
              if (seriesRef.current && typeof seriesRef.current.setData === 'function') {
                seriesRef.current.setData(sortedData);
              }
            } catch (initError) {
              console.warn('[CHART] Chart reinitialize failed:', initError);
            }
          }, 200);
        }
      }
      
      return sortedData;
    });
  };

  // Function to clear strategy lines
  const clearStrategyLines = () => {
    try {
      if (takeProfitLineRef.current && chartRef.current) {
        chartRef.current.removeSeries(takeProfitLineRef.current);
        takeProfitLineRef.current = null;
      }

      safetyOrderLinesRef.current.forEach(line => {
        if (line && chartRef.current) {
          chartRef.current.removeSeries(line);
        }
      });
      safetyOrderLinesRef.current = [];
    } catch (error) {
      console.warn('[CHART] Error clearing strategy lines:', error);
      // Reset refs even if removal fails
      takeProfitLineRef.current = null;
      safetyOrderLinesRef.current = [];
    }
  };

  // Function to draw strategy lines
  const drawStrategyLines = (chart: any, strategy: TradingStrategy) => {
    // Clear existing lines
    clearStrategyLines();

    const { baseOrderPrice, takeProfitDeviation, safetyOrderDeviation, maxSafetyOrders, priceDeviationMultiplier, activeSafetyOrders } = strategy;

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

    // Calculate and draw Safety Order lines with running deviation
    const safetyLines: any[] = [];
    const activeCount = activeSafetyOrders || maxSafetyOrders; // Default to all if not specified
    
    for (let i = 0; i < maxSafetyOrders; i++) {
      // Calculate safety order price using deviation multiplier
      const deviation = safetyOrderDeviation * Math.pow(priceDeviationMultiplier, i);
      const safetyOrderPrice = baseOrderPrice - (baseOrderPrice * deviation / 100);

      // Color active safety orders in yellow, inactive ones in gray
      const isActive = i < activeCount;
      const safetyLine = chart.addSeries(LineSeries, {
        color: isActive ? '#eab308' : '#6b7280', // Yellow for active, gray for inactive
        lineWidth: 1,
        lineStyle: 1, // Dashed line
        title: `SO${i + 1} (${deviation.toFixed(2)}%)`,
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

    // Clear strategy lines before disposing chart
    clearStrategyLines();

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
    if (chartWs && chartWs.currentSymbol && chartWs.currentSymbol !== symbol) {
      console.log(`[CHART] Changing symbol from ${chartWs.currentSymbol} to ${symbol}`);
      chartWs.changeSymbol(symbol);
      setPriceData([]); // Clear existing data
      
      // Clear chart series and prepare for new data
      if (seriesRef.current) {
        try {
          seriesRef.current.setData([]);
          console.log('[CHART] Cleared chart data for symbol change');
        } catch (error) {
          console.log('[CHART] Chart series cleared during symbol change');
        }
      }
      
      // Auto-scale chart when new data arrives
      setTimeout(() => {
        if (chartRef.current) {
          console.log('[CHART] Auto-scaling after symbol change');
          chartRef.current.timeScale().fitContent();
          chartRef.current.priceScale('right').applyOptions({
            autoScale: true,
          });
        }
      }, 1500);
    }
  }, [symbol, chartWs]);

  // Update interval when state changes
  useEffect(() => {
    if (chartWs && chartWs.currentInterval && chartWs.currentInterval !== currentInterval) {
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
    <div className={cn("bg-card border-gray-600 rounded-lg", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-600 trading-chart-header">
        <div className="flex items-center space-x-4" style={{ outline: 'none', border: 'none' }}>
          <h3 className="text-lg font-semibold" style={{ outline: 'none', border: 'none' }}>{symbol} Chart</h3>
          <div className={cn(
            "w-2 h-2 rounded-full",
            chartWs.status === 'connected' ? "bg-green-500" : "bg-red-500"
          )} />
          <span className="text-sm text-muted-foreground" style={{ outline: 'none', border: 'none' }}>
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