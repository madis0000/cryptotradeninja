import { useEffect, useState, useCallback } from 'react';
import { webSocketSingleton } from '../services/WebSocketSingleton';

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
  const [currentSymbol, setCurrentSymbol] = useState(initialSymbol);
  const [currentInterval, setCurrentInterval] = useState(initialInterval);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const { onKlineUpdate, onConnect, onDisconnect, onError } = options;

  // Use singleton WebSocket service to prevent multiple connections
  useEffect(() => {
    const unsubscribeData = webSocketSingleton.subscribe((data: any) => {
      try {
        if (data.type === 'kline_update' && onKlineUpdate) {
          console.log('[CHART] Received kline update:', data);
          // Extract the actual kline data from the message
          const klineData = data.data || data;
          onKlineUpdate(klineData);
        } else if (data.type === 'historical_klines' && onKlineUpdate) {
          console.log('[CHART] Received historical klines:', data.data?.klines?.length || 0, 'candles');
          // Process historical klines one by one
          if (data.data?.klines) {
            data.data.klines.forEach((kline: any) => {
              onKlineUpdate(kline);
            });
          }
        }
      } catch (error) {
        console.error('[CHART] Error processing message:', error);
      }
    });

    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      setStatus('connected');
      console.log('[CHART] Connected to kline WebSocket server');
      if (onConnect) onConnect();
    });

    const unsubscribeDisconnect = webSocketSingleton.onDisconnect(() => {
      setStatus('disconnected');
      console.log('[CHART] Disconnected from kline WebSocket server');
      if (onDisconnect) onDisconnect();
    });

    const unsubscribeError = webSocketSingleton.onError((error: Event) => {
      setStatus('error');
      console.error('[CHART] WebSocket error:', error);
      if (onError) onError(error);
    });

    // Set initial status
    setStatus(webSocketSingleton.getStatus() as any);

    return () => {
      unsubscribeData();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, [onKlineUpdate, onConnect, onDisconnect, onError]);

  const connect = useCallback(() => {
    console.log(`[CHART] Connecting to unified WebSocket service for ${currentSymbol} ${currentInterval}`);
    webSocketSingleton.connect([currentSymbol]);
    
    // Schedule kline configuration to be sent after connection is established
    const sendKlineConfig = () => {
      const configMessage = {
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [currentSymbol],
        interval: currentInterval
      };
      console.log('[CHART] Sending kline configuration:', configMessage);
      webSocketSingleton.sendMessage(configMessage);
    };
    
    // Send immediately if already connected, otherwise queue it
    if (webSocketSingleton.isConnected()) {
      sendKlineConfig();
    } else {
      // Set up a one-time connection listener to send config
      const unsubscribe = webSocketSingleton.onConnect(() => {
        setTimeout(sendKlineConfig, 100); // Small delay to ensure connection is fully ready
        unsubscribe();
      });
    }
  }, [currentSymbol, currentInterval]);

  const disconnect = useCallback(() => {
    console.log('[CHART] Disconnecting from WebSocket');
    webSocketSingleton.disconnect();
  }, []);

  const changeSymbol = useCallback((symbol: string) => {
    console.log(`[CHART] Changing symbol from ${currentSymbol} to ${symbol}`);
    setCurrentSymbol(symbol);
    
    // Send configuration update through unified service
    if (webSocketSingleton.isConnected()) {
      webSocketSingleton.sendMessage({
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [symbol],
        interval: currentInterval
      });
    }
  }, [currentSymbol, currentInterval]);

  const changeInterval = useCallback((interval: string) => {
    console.log(`[CHART] Changing interval from ${currentInterval} to ${interval}`);
    setCurrentInterval(interval);
    
    // Send configuration update through unified service
    if (webSocketSingleton.isConnected()) {
      const configMessage = {
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [currentSymbol],
        interval: interval
      };
      console.log('[CHART] Sending interval change configuration:', configMessage);
      webSocketSingleton.sendMessage(configMessage);
    }
  }, [currentSymbol, currentInterval]);

  // Auto-connect when component mounts
  useEffect(() => {
    connect();
    return () => {
      // Don't disconnect on unmount as other components may be using the connection
    };
  }, [connect]);

  // Reconfigure when symbol or interval changes
  useEffect(() => {
    if (webSocketSingleton.isConnected()) {
      console.log(`[CHART] Reconfiguring stream: ${currentSymbol} ${currentInterval}`);
      webSocketSingleton.sendMessage({
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [currentSymbol],
        interval: currentInterval
      });
    }
  }, [currentSymbol, currentInterval]);

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