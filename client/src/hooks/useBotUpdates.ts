import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { webSocketSingleton } from '@/services/WebSocketSingleton';

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
