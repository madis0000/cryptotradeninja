import { useEffect, useRef, useState, useCallback } from 'react';

interface ChartWebSocketOptions {
  onKlineUpdate?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface ChartWebSocketService {
  connect: () => void;
  disconnect: () => void;
  changeSymbol: (symbol: string) => void;
  changeInterval: (interval: string) => void;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  currentSymbol: string;
  currentInterval: string;
}

export function useChartWebSocket(
  initialSymbol: string = 'BTCUSDT',
  initialInterval: string = '1m',
  options: ChartWebSocketOptions = {}
): ChartWebSocketService {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [currentSymbol, setCurrentSymbol] = useState(initialSymbol);
  const [currentInterval, setCurrentInterval] = useState(initialInterval);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { onKlineUpdate, onConnect, onDisconnect, onError } = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    setStatus('connecting');
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[CHART] Connected to WebSocket for chart data`);
        setStatus('connected');
        onConnect?.();
        
        // Send initial connection message
        ws.send(JSON.stringify({
          type: 'connected',
          clientId: 'chart_klines',
          message: 'Chart component requesting kline data'
        }));
        
        // Configure stream with current symbol and interval
        setTimeout(() => {
          const configMessage = {
            type: 'configure_stream',
            dataType: 'kline',
            symbols: [currentSymbol],
            interval: currentInterval
          };
          console.log('[CHART] Sending configure_stream message:', configMessage);
          ws.send(JSON.stringify(configMessage));
        }, 100);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[CHART] Received message:', message);
          
          if (message.type === 'kline_update') {
            onKlineUpdate?.(message.data);
          } else if (message.type === 'historical_klines') {
            console.log(`[CHART] Received ${message.data.klines.length} historical klines for ${message.data.symbol} ${message.data.interval}`);
            // Process each historical kline as individual updates
            message.data.klines.forEach((kline: any) => {
              onKlineUpdate?.(kline);
            });
          }
        } catch (error) {
          console.error('[CHART] Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log(`[CHART] WebSocket disconnected - Code: ${event.code}, Reason: ${event.reason}`);
        setStatus('disconnected');
        wsRef.current = null;
        onDisconnect?.();
        
        // Auto-reconnect after a delay if not intentionally closed
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('[CHART] WebSocket error:', error);
        setStatus('error');
        onError?.(error);
      };

    } catch (error) {
      console.error('[CHART] Failed to create WebSocket connection:', error);
      setStatus('error');
    }
  }, [currentSymbol, currentInterval, onConnect, onDisconnect, onError, onKlineUpdate]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const changeSymbol = useCallback((symbol: string) => {
    console.log(`[CHART] Changing symbol to ${symbol}`);
    setCurrentSymbol(symbol);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [symbol],
        interval: currentInterval
      }));
    }
  }, [currentInterval]);

  const changeInterval = useCallback((interval: string) => {
    console.log(`[CHART] Changing interval from ${currentInterval} to ${interval}`);
    setCurrentInterval(interval);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const configMessage = {
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [currentSymbol],
        interval: interval
      };
      console.log('[CHART] Sending interval change configuration:', configMessage);
      wsRef.current.send(JSON.stringify(configMessage));
    }
  }, [currentSymbol, currentInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    changeSymbol,
    changeInterval,
    status,
    currentSymbol,
    currentInterval
  };
}