import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { audioService } from '@/services/audioService';
import { webSocketSingleton } from '@/services/WebSocketSingleton';

interface OrderNotificationSettings {
  soundNotificationsEnabled: boolean;
  takeProfitSoundEnabled: boolean;
  safetyOrderSoundEnabled: boolean;
  baseOrderSoundEnabled: boolean;
  takeProfitSound: string;
  safetyOrderSound: string;
  baseOrderSound: string;
  notificationVolume: string;
}

export function useOrderNotifications() {
  const [settings, setSettings] = useState<OrderNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Subscribe to WebSocket order fill notifications
  useEffect(() => {
    const unsubscribe = webSocketSingleton.subscribe(async (data: any) => {
      if (data.type === 'order_fill_notification') {
        console.log('[ORDER NOTIFICATIONS] Order filled for bot', data.data.botId, 'invalidating cache...');
        
        const notification = data.data;
        
        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
        queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles'] });
        queryClient.invalidateQueries({ queryKey: ['/api/bot-stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/cycle-profits'] });
        queryClient.invalidateQueries({ queryKey: [`/api/bot-orders/${notification.botId}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
        
        // Show toast notification
        toast({
          title: "Order Filled",
          description: `${notification.orderType} order filled for ${notification.symbol}`,
        });
        
        // Play audio notification
        const settings = await queryClient.fetchQuery({
          queryKey: ['/api/settings'],
          staleTime: Infinity,
        });
        
        if (settings?.soundNotificationsEnabled) {
          await audioService.playOrderFillNotification(notification.orderType, settings);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient, toast]);

  // Load user notification settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        const notificationSettings = {
          soundNotificationsEnabled: data?.soundNotificationsEnabled ?? true,
          takeProfitSoundEnabled: data?.takeProfitSoundEnabled ?? true,
          safetyOrderSoundEnabled: data?.safetyOrderSoundEnabled ?? true,
          baseOrderSoundEnabled: data?.baseOrderSoundEnabled ?? true,
          takeProfitSound: data?.takeProfitSound ?? 'chin-chin',
          safetyOrderSound: data?.safetyOrderSound ?? 'beep',
          baseOrderSound: data?.baseOrderSound ?? 'notification',
          notificationVolume: data?.notificationVolume ?? '0.50'
        };
        
        setSettings(notificationSettings);
        
        // Update audio service volume
        audioService.setVolume(parseFloat(notificationSettings.notificationVolume));
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      // Use default settings if loading fails
      setSettings({
        soundNotificationsEnabled: true,
        takeProfitSoundEnabled: true,
        safetyOrderSoundEnabled: true,
        baseOrderSoundEnabled: true,
        takeProfitSound: 'chin-chin',
        safetyOrderSound: 'beep',
        baseOrderSound: 'notification',
        notificationVolume: '0.50'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = (newSettings: OrderNotificationSettings) => {
    setSettings(newSettings);
    audioService.setVolume(parseFloat(newSettings.notificationVolume));
  };

  const testNotification = async (orderType: 'take_profit' | 'safety_order' | 'base_order') => {
    if (!settings) return;
    
    try {
      await audioService.playOrderFillNotification(orderType, settings);
    } catch (error) {
      console.error('Failed to test notification:', error);
      throw error;
    }
  };

  return {
    settings,
    loading,
    updateSettings,
    testNotification,
    refreshSettings: loadSettings
  };
}