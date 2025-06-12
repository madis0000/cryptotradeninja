import { useEffect, useState } from 'react';
import { audioService } from '@/services/audioService';
import { usePublicWebSocket } from '@/hooks/useWebSocketService';

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

  // Subscribe to WebSocket order fill notifications
  const { lastMessage } = usePublicWebSocket({
    onMessage: async (data) => {
      if (data.type === 'order_fill_notification' && settings) {
        await handleOrderFillNotification(data.data);
      }
    }
  });

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

  const handleOrderFillNotification = async (orderData: any) => {
    if (!settings?.soundNotificationsEnabled) return;

    try {
      // Determine order type from order data
      let orderType: 'take_profit' | 'safety_order' | 'base_order' = 'base_order';
      
      if (orderData.orderType === 'TAKE_PROFIT' || orderData.side === 'SELL') {
        orderType = 'take_profit';
      } else if (orderData.orderSubType === 'SAFETY_ORDER') {
        orderType = 'safety_order';
      } else if (orderData.orderSubType === 'BASE_ORDER') {
        orderType = 'base_order';
      }

      // Play appropriate notification sound
      await audioService.playOrderFillNotification(orderType, settings);
      
      console.log(`[ORDER NOTIFICATION] Played ${orderType} sound for order ${orderData.orderId}`);
    } catch (error) {
      console.error('Failed to play order notification:', error);
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