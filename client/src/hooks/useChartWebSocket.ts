import { useEffect, useState, useCallback } from 'react';
import { usePublicWebSocket } from './useWebSocketService';

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
  const { onKlineUpdate, onConnect, onDisconnect, onError } = options;

  // Use the unified WebSocket service instead of creating a separate connection
  const publicWs = usePublicWebSocket({
    onMessage: (data) => {
      try {
        if (data.type === 'kline_update' && onKlineUpdate) {
          console.log('[CHART] Received message:', data);
          onKlineUpdate(data);
        }
      } catch (error) {
        console.error('[CHART] Error processing kline update:', error);
      }
    },
    onConnect: () => {
      console.log('[CHART] Connected to kline WebSocket server');
      if (onConnect) onConnect();
    },
    onDisconnect: () => {
      console.log('[CHART] Disconnected from kline WebSocket server');
      if (onDisconnect) onDisconnect();
    },
    onError: (error) => {
      console.error('[CHART] WebSocket error:', error);
      if (onError) onError(error);
    }
  });

  const connect = useCallback(() => {
    console.log(`[CHART] Connecting to unified WebSocket service for ${currentSymbol} ${currentInterval}`);
    publicWs.connect([currentSymbol]);
    
    // Send kline subscription message through unified service
    if (publicWs.status === 'connected') {
      publicWs.sendMessage?.({
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [currentSymbol],
        interval: currentInterval
      });
    }
  }, [currentSymbol, currentInterval, publicWs]);

  const disconnect = useCallback(() => {
    console.log('[CHART] Disconnecting from unified WebSocket service');
    publicWs.disconnect();
  }, [publicWs]);

  const changeSymbol = useCallback((symbol: string) => {
    console.log(`[CHART] Changing symbol to ${symbol}`);
    setCurrentSymbol(symbol);
    
    // Send configuration update through unified service
    if (publicWs.status === 'connected') {
      publicWs.sendMessage?.({
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [symbol],
        interval: currentInterval
      });
    }
  }, [currentInterval, publicWs]);

  const changeInterval = useCallback((interval: string) => {
    console.log(`[CHART] Changing interval from ${currentInterval} to ${interval}`);
    setCurrentInterval(interval);
    
    // Send configuration update through unified service
    if (publicWs.status === 'connected') {
      const configMessage = {
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [currentSymbol],
        interval: interval
      };
      console.log('[CHART] Sending interval change configuration:', configMessage);
      publicWs.sendMessage?.(configMessage);
    }
  }, [currentSymbol, currentInterval, publicWs]);

  // Auto-connect when component mounts
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  // Reconfigure when symbol or interval changes
  useEffect(() => {
    if (publicWs.status === 'connected') {
      publicWs.sendMessage?.({
        type: 'configure_stream',
        dataType: 'kline',
        symbols: [currentSymbol],
        interval: currentInterval
      });
    }
  }, [currentSymbol, currentInterval, publicWs]);

  return {
    connect,
    disconnect,
    changeSymbol,
    changeInterval,
    status: publicWs.status,
    currentSymbol,
    currentInterval
  };
}