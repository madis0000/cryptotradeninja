import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { webSocketSingleton } from '@/services/WebSocketSingleton';

// Throttling for high-frequency updates to prevent UI overload
const useThrottledInvalidation = (delay: number = 100) => {
  const queryClient = useQueryClient();
  const throttleRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  const throttledInvalidate = useCallback((queryKey: any[], immediate: boolean = false) => {
    const keyString = JSON.stringify(queryKey);
    
    if (immediate) {
      // Clear any pending throttled invalidation
      const existingTimeout = throttleRef.current.get(keyString);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        throttleRef.current.delete(keyString);
      }
      queryClient.invalidateQueries({ queryKey });
      return;
    }
    
    // Check if there's already a pending invalidation for this key
    if (throttleRef.current.has(keyString)) {
      return; // Skip this invalidation as one is already pending
    }
    
    const timeout = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey });
      throttleRef.current.delete(keyString);
    }, delay);
    
    throttleRef.current.set(keyString, timeout);
  }, [queryClient, delay]);
  
  return throttledInvalidate;
};

export function useBotUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = webSocketSingleton.subscribe(async (data: any) => {
      // Handle bot status updates
      if (data.type === 'bot_status_update') {
        console.log('[BOT UPDATES] Bot status update:', data.data);
        
        const botId = data.data?.botId;
        if (botId) {
          // Invalidate bot-related queries
          queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-stats'] });
        }
      }
      
      // Handle bot data updates (create, update, delete)
      if (data.type === 'bot_data_update') {
        console.log('[BOT UPDATES] Bot data update:', data.data);
        
        // Invalidate all bot-related queries since any bot operation affects the list
        queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
        queryClient.invalidateQueries({ queryKey: ['/api/bot-stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/cycle-profits'] });
        
        // If it's a specific bot, also invalidate its cycles and orders
        const bot = data.data?.bot;
        if (bot?.id) {
          queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles', bot.id] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-orders', bot.id] });
        }
      }
      
      // Handle bot cycle updates
      if (data.type === 'bot_cycle_update') {
        console.log('[BOT UPDATES] Bot cycle update:', data.data);
        
        const cycle = data.data?.cycle;
        if (cycle?.botId) {
          // Invalidate cycle-related queries
          queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles'] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles', cycle.botId] });
          queryClient.invalidateQueries({ queryKey: ['/api/cycle-profits'] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-stats'] });
          
          // If it's a bulk query, also invalidate that
          queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles', 'bulk'] });
        }
      }
        // Handle bot stats updates
      if (data.type === 'bot_stats_update') {
        console.log('[BOT UPDATES] Bot stats update:', data.data);
        
        // Invalidate stats-related queries
        queryClient.invalidateQueries({ queryKey: ['/api/bot-stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/cycle-profits'] });
      }
      
      // Handle order status updates
      if (data.type === 'order_status_update') {
        console.log('[BOT UPDATES] Order status update:', data.data);
        
        const orderData = data.data;
        if (orderData?.botId) {
          // Invalidate order-related queries for the specific bot
          queryClient.invalidateQueries({ queryKey: ['/api/bot-orders', orderData.botId] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles', orderData.botId] });
          
          // Also invalidate general bot queries
          queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-stats'] });
        }
      }
      
      // Handle comprehensive order updates
      if (data.type === 'order_update') {
        console.log('[BOT UPDATES] Order update:', data.data);
        
        const orderData = data.data;
        if (orderData?.botId) {
          // Invalidate order-related queries for the specific bot
          queryClient.invalidateQueries({ queryKey: ['/api/bot-orders', orderData.botId] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles', orderData.botId] });
        }
        
        // Invalidate general queries that might be affected by order changes
        queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      }
      
      // Handle open orders updates
      if (data.type === 'open_orders_update') {
        console.log('[BOT UPDATES] Open orders update:', data.data);
        
        const updateData = data.data;
        if (updateData?.exchangeId) {
          // For now, just invalidate bot orders - we could optimize this later
          // to only update specific bots on that exchange
          queryClient.invalidateQueries({ queryKey: ['/api/bot-orders'] });
          queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  return {
    // This hook doesn't need to return anything specific
    // It just sets up the WebSocket subscription for bot updates
  };
}
