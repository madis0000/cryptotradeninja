import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { audioService } from '@/services/audioService';
import { webSocketSingleton } from '@/services/WebSocketSingleton';

interface OrderNotificationSettings {
  soundNotificationsEnabled: boolean;
  takeProfitSoundEnabled: boolean;
  safetyOrderSoundEnabled: boolean;
  baseOrderSoundEnabled: boolean;
  manualOrderSoundEnabled: boolean;
  takeProfitSound: string;
  safetyOrderSound: string;
  baseOrderSound: string;
  manualOrderSound: string;
  notificationVolume: string;
}

export function useOrderNotifications() {
  const [settings, setSettings] = useState<OrderNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Subscribe to WebSocket order fill notifications and manual order placement notifications
  useEffect(() => {
    console.log('[ORDER NOTIFICATIONS] Setting up WebSocket subscription, settings:', settings);
    
    const unsubscribe = webSocketSingleton.subscribe(async (data: any) => {
      console.log('[ORDER NOTIFICATIONS] Received WebSocket message:', data);
      
      if (data.type === 'order_fill_notification' && settings) {
        console.log('[ORDER NOTIFICATIONS] Processing order fill notification');
        await handleOrderFillNotification(data.data);
        
        // Invalidate relevant queries when orders are filled to update UI
        const botId = data.data?.botId;
        if (botId) {
          console.log(`[ORDER NOTIFICATIONS] Order filled for bot ${botId}, invalidating cache...`);
          
          // Invalidate bot-related queries
          queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles'] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-stats'] });
          queryClient.invalidateQueries({ queryKey: ['/api/cycle-profits'] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-orders', botId] });
          queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles', botId] });
          
          // Also invalidate portfolio-related queries since orders affect portfolio
          queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
          queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
        }
      } else if (data.type === 'manual_order_placement_notification' && settings) {
        console.log('[ORDER NOTIFICATIONS] Processing manual order placement notification');
        await handleManualOrderPlacementNotification(data.data);
        
        // Invalidate portfolio-related queries since manual orders affect portfolio
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
        queryClient.invalidateQueries({ queryKey: ['/api/balances'] });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [settings, queryClient]);

  // Load user notification settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('[ORDER NOTIFICATIONS] No auth token found, using defaults');
        setSettings({
          soundNotificationsEnabled: true,
          takeProfitSoundEnabled: true,
          safetyOrderSoundEnabled: true,
          baseOrderSoundEnabled: true,
          manualOrderSoundEnabled: true,
          takeProfitSound: 'chin-chin',
          safetyOrderSound: 'beep',
          baseOrderSound: 'notification',
          manualOrderSound: 'notification',
          notificationVolume: '0.50'
        });
        return;
      }

      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const notificationSettings = {
          soundNotificationsEnabled: data?.soundNotificationsEnabled ?? true,
          takeProfitSoundEnabled: data?.takeProfitSoundEnabled ?? true,
          safetyOrderSoundEnabled: data?.safetyOrderSoundEnabled ?? true,
          baseOrderSoundEnabled: data?.baseOrderSoundEnabled ?? true,
          manualOrderSoundEnabled: data?.manualOrderSoundEnabled ?? true,
          takeProfitSound: data?.takeProfitSound ?? 'chin-chin',
          safetyOrderSound: data?.safetyOrderSound ?? 'beep',
          baseOrderSound: data?.baseOrderSound ?? 'notification',
          manualOrderSound: data?.manualOrderSound ?? 'notification',
          notificationVolume: data?.notificationVolume ?? '0.50'
        };
        
        setSettings(notificationSettings);
        
        // Update audio service volume
        audioService.setVolume(parseFloat(notificationSettings.notificationVolume));
        console.log('[ORDER NOTIFICATIONS] Settings loaded:', notificationSettings);
      } else {
        console.log('[ORDER NOTIFICATIONS] Failed to load settings, using defaults. Status:', response.status);
        // Use default settings if loading fails
        setSettings({
          soundNotificationsEnabled: true,
          takeProfitSoundEnabled: true,
          safetyOrderSoundEnabled: true,
          baseOrderSoundEnabled: true,
          manualOrderSoundEnabled: true,
          takeProfitSound: 'chin-chin',
          safetyOrderSound: 'beep',
          baseOrderSound: 'notification',
          manualOrderSound: 'notification',
          notificationVolume: '0.50'
        });
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      // Use default settings if loading fails
      setSettings({
        soundNotificationsEnabled: true,
        takeProfitSoundEnabled: true,
        safetyOrderSoundEnabled: true,
        baseOrderSoundEnabled: true,
        manualOrderSoundEnabled: true,
        takeProfitSound: 'chin-chin',
        safetyOrderSound: 'beep',
        baseOrderSound: 'notification',
        manualOrderSound: 'notification',
        notificationVolume: '0.50'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOrderFillNotification = async (orderData: any) => {
    if (!settings?.soundNotificationsEnabled) return;

    try {
      // Check if this is a manual order
      if (!orderData.botId) {
        // This is a manual order, don't play bot order sounds
        // Manual order fill sounds will be handled by the separate manual order placement handler
        return;
      }

      // Determine order type from order data
      let orderType: 'take_profit' | 'safety_order' | 'base_order' = 'base_order';
      
      if (orderData.orderType === 'TAKE_PROFIT' || orderData.side === 'SELL') {
        orderType = 'take_profit';
      } else if (orderData.orderSubType === 'SAFETY_ORDER') {
        orderType = 'safety_order';
      } else if (orderData.orderSubType === 'BASE_ORDER') {
        orderType = 'base_order';
      }

      // Play appropriate notification sound for bot orders
      await audioService.playOrderFillNotification(orderType, settings);
      
      console.log(`[ORDER NOTIFICATION] Played ${orderType} sound for bot order ${orderData.orderId}`);
    } catch (error) {
      console.error('Failed to play order notification:', error);
    }
  };

  const handleManualOrderPlacementNotification = async (orderData: any) => {
    console.log('[ORDER NOTIFICATIONS] Manual order placement handler called:', orderData);
    console.log('[ORDER NOTIFICATIONS] Settings:', settings);
    
    if (!settings?.soundNotificationsEnabled) {
      console.log('[ORDER NOTIFICATIONS] Sound notifications disabled, skipping');
      return;
    }

    try {
      // Check if this is a manual order (not from a bot)
      if (orderData.botId) {
        console.log('[ORDER NOTIFICATIONS] This is a bot order, skipping manual sound');
        // This is a bot order, don't play manual order sound
        return;
      }

      console.log('[ORDER NOTIFICATIONS] Playing manual order placement sound...');
      // Play manual order placement sound
      await audioService.playManualOrderPlacementNotification(settings);
      
      console.log(`[ORDER NOTIFICATION] Played manual order placement sound for order ${orderData.exchangeOrderId}`);
    } catch (error) {
      console.error('Failed to play manual order placement notification:', error);
    }
  };

  const updateSettings = (newSettings: OrderNotificationSettings) => {
    setSettings(newSettings);
    audioService.setVolume(parseFloat(newSettings.notificationVolume));
  };

  const testNotification = async (orderType: 'take_profit' | 'safety_order' | 'base_order' | 'manual_order') => {
    if (!settings) return;
    
    try {
      if (orderType === 'manual_order') {
        await audioService.playManualOrderPlacementNotification(settings);
      } else {
        await audioService.playOrderFillNotification(orderType, settings);
      }
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