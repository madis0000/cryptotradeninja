import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Volume2, Settings, TestTube } from "lucide-react";
import { audioService } from "@/services/audioService";
import { apiRequest } from "@/lib/queryClient";

interface NotificationSettings {
  soundNotificationsEnabled: boolean;
  takeProfitSoundEnabled: boolean;
  safetyOrderSoundEnabled: boolean;
  baseOrderSoundEnabled: boolean;
  takeProfitSound: string;
  safetyOrderSound: string;
  baseOrderSound: string;
  notificationVolume: string;
}

export default function NotificationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    soundNotificationsEnabled: true,
    takeProfitSoundEnabled: true,
    safetyOrderSoundEnabled: true,
    baseOrderSoundEnabled: true,
    takeProfitSound: 'chin-chin',
    safetyOrderSound: 'beep',
    baseOrderSound: 'notification',
    notificationVolume: '0.50'
  });

  const soundOptions = [
    { value: 'chin-chin', label: 'Chin-Chin (Two Bells)' },
    { value: 'beep', label: 'Single Beep' },
    { value: 'notification', label: 'Notification Tone' }
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setSettings({
            soundNotificationsEnabled: data.soundNotificationsEnabled ?? true,
            takeProfitSoundEnabled: data.takeProfitSoundEnabled ?? true,
            safetyOrderSoundEnabled: data.safetyOrderSoundEnabled ?? true,
            baseOrderSoundEnabled: data.baseOrderSoundEnabled ?? true,
            takeProfitSound: data.takeProfitSound ?? 'chin-chin',
            safetyOrderSound: data.safetyOrderSound ?? 'beep',
            baseOrderSound: data.baseOrderSound ?? 'notification',
            notificationVolume: data.notificationVolume ?? '0.50'
          });
          
          // Update audio service volume
          audioService.setVolume(parseFloat(data.notificationVolume ?? '0.50'));
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      // Update audio service volume
      audioService.setVolume(parseFloat(settings.notificationVolume));

      toast({
        title: "Settings Saved",
        description: "Your notification preferences have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save notification settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const testSound = async (soundName: string) => {
    try {
      audioService.setVolume(parseFloat(settings.notificationVolume));
      await audioService.playSound(soundName);
    } catch (error) {
      toast({
        title: "Audio Test Failed",
        description: "Unable to play sound. Check your browser permissions.",
        variant: "destructive",
      });
    }
  };

  const testOrderSound = async (orderType: 'take_profit' | 'safety_order' | 'base_order') => {
    try {
      await audioService.playOrderFillNotification(orderType, settings);
      toast({
        title: "Test Sound Played",
        description: `Played ${orderType.replace('_', ' ')} notification sound.`,
      });
    } catch (error) {
      toast({
        title: "Audio Test Failed",
        description: "Unable to play sound. Check your browser permissions.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Notification Settings</h1>
        <p className="text-crypto-light">
          Configure audio notifications for trading events and order fills.
        </p>
      </div>

      <Card className="bg-crypto-darker border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Audio Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Enable Sound Notifications</Label>
              <p className="text-sm text-crypto-light/70">Master control for all audio notifications</p>
            </div>
            <Switch
              checked={settings.soundNotificationsEnabled}
              onCheckedChange={(checked) => 
                setSettings(prev => ({ ...prev, soundNotificationsEnabled: checked }))
              }
            />
          </div>

          {/* Volume Control */}
          <div className="space-y-3">
            <Label className="text-crypto-light">Notification Volume</Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[parseFloat(settings.notificationVolume) * 100]}
                onValueChange={([value]) => 
                  setSettings(prev => ({ ...prev, notificationVolume: (value / 100).toFixed(2) }))
                }
                max={100}
                step={5}
                className="flex-1"
                disabled={!settings.soundNotificationsEnabled}
              />
              <span className="text-sm text-crypto-light w-12">
                {Math.round(parseFloat(settings.notificationVolume) * 100)}%
              </span>
            </div>
          </div>

          {/* Take Profit Orders */}
          <div className="space-y-3 p-4 bg-crypto-dark rounded-lg border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-crypto-light">Take Profit Orders</Label>
                <p className="text-sm text-crypto-light/70">Notify when take profit orders are filled</p>
              </div>
              <Switch
                checked={settings.takeProfitSoundEnabled}
                onCheckedChange={(checked) => 
                  setSettings(prev => ({ ...prev, takeProfitSoundEnabled: checked }))
                }
                disabled={!settings.soundNotificationsEnabled}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-sm text-crypto-light">Sound</Label>
                <Select
                  value={settings.takeProfitSound}
                  onValueChange={(value) => 
                    setSettings(prev => ({ ...prev, takeProfitSound: value }))
                  }
                  disabled={!settings.soundNotificationsEnabled || !settings.takeProfitSoundEnabled}
                >
                  <SelectTrigger className="bg-crypto-darker border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {soundOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testSound(settings.takeProfitSound)}
                disabled={!settings.soundNotificationsEnabled || !settings.takeProfitSoundEnabled}
                className="border-gray-700 text-crypto-light hover:bg-crypto-dark"
              >
                <TestTube className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Safety Orders */}
          <div className="space-y-3 p-4 bg-crypto-dark rounded-lg border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-crypto-light">Safety Orders</Label>
                <p className="text-sm text-crypto-light/70">Notify when safety orders are filled</p>
              </div>
              <Switch
                checked={settings.safetyOrderSoundEnabled}
                onCheckedChange={(checked) => 
                  setSettings(prev => ({ ...prev, safetyOrderSoundEnabled: checked }))
                }
                disabled={!settings.soundNotificationsEnabled}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-sm text-crypto-light">Sound</Label>
                <Select
                  value={settings.safetyOrderSound}
                  onValueChange={(value) => 
                    setSettings(prev => ({ ...prev, safetyOrderSound: value }))
                  }
                  disabled={!settings.soundNotificationsEnabled || !settings.safetyOrderSoundEnabled}
                >
                  <SelectTrigger className="bg-crypto-darker border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {soundOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testSound(settings.safetyOrderSound)}
                disabled={!settings.soundNotificationsEnabled || !settings.safetyOrderSoundEnabled}
                className="border-gray-700 text-crypto-light hover:bg-crypto-dark"
              >
                <TestTube className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Base Orders */}
          <div className="space-y-3 p-4 bg-crypto-dark rounded-lg border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-crypto-light">Base Orders</Label>
                <p className="text-sm text-crypto-light/70">Notify when base orders are filled</p>
              </div>
              <Switch
                checked={settings.baseOrderSoundEnabled}
                onCheckedChange={(checked) => 
                  setSettings(prev => ({ ...prev, baseOrderSoundEnabled: checked }))
                }
                disabled={!settings.soundNotificationsEnabled}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-sm text-crypto-light">Sound</Label>
                <Select
                  value={settings.baseOrderSound}
                  onValueChange={(value) => 
                    setSettings(prev => ({ ...prev, baseOrderSound: value }))
                  }
                  disabled={!settings.soundNotificationsEnabled || !settings.baseOrderSoundEnabled}
                >
                  <SelectTrigger className="bg-crypto-darker border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {soundOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testSound(settings.baseOrderSound)}
                disabled={!settings.soundNotificationsEnabled || !settings.baseOrderSoundEnabled}
                className="border-gray-700 text-crypto-light hover:bg-crypto-dark"
              >
                <TestTube className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Test All Sounds */}
          <div className="space-y-3 p-4 bg-gradient-to-r from-crypto-primary/10 to-transparent rounded-lg border border-crypto-primary/20">
            <Label className="text-crypto-light">Test Order Notifications</Label>
            <p className="text-sm text-crypto-light/70">
              Test how notifications will sound for different order types
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testOrderSound('take_profit')}
                disabled={!settings.soundNotificationsEnabled}
                className="border-crypto-primary/50 text-crypto-primary hover:bg-crypto-primary/10"
              >
                Test Take Profit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testOrderSound('safety_order')}
                disabled={!settings.soundNotificationsEnabled}
                className="border-crypto-primary/50 text-crypto-primary hover:bg-crypto-primary/10"
              >
                Test Safety Order
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testOrderSound('base_order')}
                disabled={!settings.soundNotificationsEnabled}
                className="border-crypto-primary/50 text-crypto-primary hover:bg-crypto-primary/10"
              >
                Test Base Order
              </Button>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={saveSettings}
              disabled={loading}
              className="bg-crypto-primary hover:bg-crypto-primary/90 text-white"
            >
              <Settings className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}