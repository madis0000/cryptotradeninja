import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { Volume2, VolumeX, TestTube } from "lucide-react";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { playTestNotification } = useOrderNotifications();

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/settings'],
  });

  // Local state for form
  const [formData, setFormData] = useState({
    soundNotificationsEnabled: true,
    takeProfitSoundEnabled: true,
    safetyOrderSoundEnabled: true,
    baseOrderSoundEnabled: true,
    takeProfitSound: 'chin-chin',
    safetyOrderSound: 'beep',
    baseOrderSound: 'notification',
    notificationVolume: 0.5,
  });

  // Update form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        soundNotificationsEnabled: settings.soundNotificationsEnabled,
        takeProfitSoundEnabled: settings.takeProfitSoundEnabled,
        safetyOrderSoundEnabled: settings.safetyOrderSoundEnabled,
        baseOrderSoundEnabled: settings.baseOrderSoundEnabled,
        takeProfitSound: settings.takeProfitSound,
        safetyOrderSound: settings.safetyOrderSound,
        baseOrderSound: settings.baseOrderSound,
        notificationVolume: parseFloat(settings.notificationVolume),
      });
    }
  }, [settings]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/settings', 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: "Settings Updated",
        description: "Your notification preferences have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      ...formData,
      notificationVolume: formData.notificationVolume.toString(),
    });
  };

  const handleTestSound = async (orderType: 'take_profit' | 'safety_order' | 'base_order') => {
    await playTestNotification(orderType);
  };

  const soundOptions = [
    { value: 'chin-chin', label: 'Chin-Chin (Bell)' },
    { value: 'beep', label: 'Beep' },
    { value: 'notification', label: 'Notification' },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Configure your notification preferences and trading alerts
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Sound Notifications
            </CardTitle>
            <CardDescription>
              Configure audio alerts for trading events and order fills
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Master sound toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Enable Sound Notifications</Label>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Master control for all audio notifications
                </p>
              </div>
              <Switch
                checked={formData.soundNotificationsEnabled}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, soundNotificationsEnabled: checked }))
                }
              />
            </div>

            <Separator />

            {/* Volume control */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Volume</Label>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {Math.round(formData.notificationVolume * 100)}%
                </span>
              </div>
              <div className="px-3">
                <Slider
                  value={[formData.notificationVolume]}
                  onValueChange={([value]) =>
                    setFormData(prev => ({ ...prev, notificationVolume: value }))
                  }
                  max={1}
                  min={0}
                  step={0.1}
                  className="w-full"
                  disabled={!formData.soundNotificationsEnabled}
                />
              </div>
            </div>

            <Separator />

            {/* Take Profit Notifications */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Take Profit Orders</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sound when take profit orders are filled (sell orders)
                  </p>
                </div>
                <Switch
                  checked={formData.takeProfitSoundEnabled}
                  onCheckedChange={(checked) =>
                    setFormData(prev => ({ ...prev, takeProfitSoundEnabled: checked }))
                  }
                  disabled={!formData.soundNotificationsEnabled}
                />
              </div>
              <div className="flex items-center gap-3 pl-6">
                <Select
                  value={formData.takeProfitSound}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, takeProfitSound: value }))
                  }
                  disabled={!formData.soundNotificationsEnabled || !formData.takeProfitSoundEnabled}
                >
                  <SelectTrigger className="w-48">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestSound('take_profit')}
                  disabled={!formData.soundNotificationsEnabled || !formData.takeProfitSoundEnabled}
                  className="flex items-center gap-1"
                >
                  <TestTube className="h-3 w-3" />
                  Test
                </Button>
              </div>
            </div>

            <Separator />

            {/* Safety Order Notifications */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Safety Orders</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sound when safety orders are filled (additional buy orders)
                  </p>
                </div>
                <Switch
                  checked={formData.safetyOrderSoundEnabled}
                  onCheckedChange={(checked) =>
                    setFormData(prev => ({ ...prev, safetyOrderSoundEnabled: checked }))
                  }
                  disabled={!formData.soundNotificationsEnabled}
                />
              </div>
              <div className="flex items-center gap-3 pl-6">
                <Select
                  value={formData.safetyOrderSound}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, safetyOrderSound: value }))
                  }
                  disabled={!formData.soundNotificationsEnabled || !formData.safetyOrderSoundEnabled}
                >
                  <SelectTrigger className="w-48">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestSound('safety_order')}
                  disabled={!formData.soundNotificationsEnabled || !formData.safetyOrderSoundEnabled}
                  className="flex items-center gap-1"
                >
                  <TestTube className="h-3 w-3" />
                  Test
                </Button>
              </div>
            </div>

            <Separator />

            {/* Base Order Notifications */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Base Orders</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sound when base orders are filled (initial buy orders)
                  </p>
                </div>
                <Switch
                  checked={formData.baseOrderSoundEnabled}
                  onCheckedChange={(checked) =>
                    setFormData(prev => ({ ...prev, baseOrderSoundEnabled: checked }))
                  }
                  disabled={!formData.soundNotificationsEnabled}
                />
              </div>
              <div className="flex items-center gap-3 pl-6">
                <Select
                  value={formData.baseOrderSound}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, baseOrderSound: value }))
                  }
                  disabled={!formData.soundNotificationsEnabled || !formData.baseOrderSoundEnabled}
                >
                  <SelectTrigger className="w-48">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestSound('base_order')}
                  disabled={!formData.soundNotificationsEnabled || !formData.baseOrderSoundEnabled}
                  className="flex items-center gap-1"
                >
                  <TestTube className="h-3 w-3" />
                  Test
                </Button>
              </div>
            </div>

            <Separator />

            {/* Save button */}
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={updateSettingsMutation.isPending}
                className="min-w-24"
              >
                {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}