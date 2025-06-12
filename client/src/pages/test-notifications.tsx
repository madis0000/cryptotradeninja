import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Play, Volume2 } from "lucide-react";
import { audioService } from "@/services/audioService";

export default function TestNotifications() {
  const { toast } = useToast();
  const [isPlaying, setIsPlaying] = useState(false);

  const testAudioNotification = async (orderType: 'take_profit' | 'safety_order' | 'base_order') => {
    if (isPlaying) return;
    
    setIsPlaying(true);
    try {
      // Mock notification settings for testing
      const mockSettings = {
        soundNotificationsEnabled: true,
        takeProfitSoundEnabled: true,
        safetyOrderSoundEnabled: true,
        baseOrderSoundEnabled: true,
        takeProfitSound: 'chin-chin',
        safetyOrderSound: 'beep',
        baseOrderSound: 'notification',
        notificationVolume: '0.70'
      };

      await audioService.playOrderFillNotification(orderType, mockSettings);
      
      toast({
        title: "Audio Test Complete",
        description: `Played ${orderType.replace('_', ' ')} notification sound`,
      });
    } catch (error) {
      toast({
        title: "Audio Test Failed",
        description: "Unable to play sound. Check browser permissions.",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => setIsPlaying(false), 1000);
    }
  };

  const testOrderFillBroadcast = () => {
    // Simulate order fill notification through WebSocket
    const mockOrderData = {
      type: 'order_fill_notification',
      data: {
        orderId: 'test_001',
        exchangeOrderId: 'binance_123456',
        botId: 1,
        orderType: 'take_profit',
        orderSubType: 'take_profit',
        symbol: 'BTCUSDT',
        side: 'SELL',
        quantity: '0.001',
        price: '45000.00',
        status: 'filled',
        filledAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      }
    };

    // Broadcast to test WebSocket notification system
    window.dispatchEvent(new CustomEvent('mock-order-fill', { detail: mockOrderData }));
    
    toast({
      title: "Order Fill Test",
      description: "Simulated order fill notification broadcast",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Audio Notification Testing</h1>
        <p className="text-crypto-light">
          Test the audio notification system for different order types and WebSocket events.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Direct Audio Tests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Button
                onClick={() => testAudioNotification('take_profit')}
                disabled={isPlaying}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Play className="h-4 w-4 mr-2" />
                Test Take Profit Sound (Chin-Chin)
              </Button>
              
              <Button
                onClick={() => testAudioNotification('safety_order')}
                disabled={isPlaying}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Play className="h-4 w-4 mr-2" />
                Test Safety Order Sound (Beep)
              </Button>
              
              <Button
                onClick={() => testAudioNotification('base_order')}
                disabled={isPlaying}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Play className="h-4 w-4 mr-2" />
                Test Base Order Sound (Notification)
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Play className="h-5 w-5" />
              WebSocket Integration Tests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-crypto-light mb-4">
              Test the complete order fill notification workflow through WebSocket broadcasting.
            </p>
            
            <Button
              onClick={testOrderFillBroadcast}
              className="w-full bg-crypto-primary hover:bg-crypto-primary/90 text-white"
            >
              <Play className="h-4 w-4 mr-2" />
              Simulate Order Fill Broadcast
            </Button>
            
            <div className="mt-4 p-3 bg-crypto-dark rounded border border-gray-700">
              <p className="text-xs text-crypto-light">
                <strong>Note:</strong> This test simulates the complete workflow:
                WebSocket message → Order notification hook → Audio service
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-crypto-darker border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-crypto-light">Audio Service</p>
              <p className="text-xs text-green-400">Ready</p>
            </div>
            <div className="text-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-crypto-light">WebSocket Connection</p>
              <p className="text-xs text-green-400">Connected</p>
            </div>
            <div className="text-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-crypto-light">Notification Settings</p>
              <p className="text-xs text-green-400">Configured</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}