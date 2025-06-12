import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Volume2, Play } from "lucide-react";
import { audioService } from "@/services/audioService";

interface UserSettings {
  id: number;
  userId: number;
  soundNotificationsEnabled: boolean;
  takeProfitSoundEnabled: boolean;
  safetyOrderSoundEnabled: boolean;
  baseOrderSoundEnabled: boolean;
  takeProfitSound: string;
  safetyOrderSound: string;
  baseOrderSound: string;
  notificationVolume: string;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<Partial<UserSettings>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/user/settings"],
    queryFn: async () => {
      const response = await fetch("/api/user/settings", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch settings");
      return response.json() as UserSettings;
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<UserSettings>) => {
      return apiRequest("/api/user/settings", {
        method: "PUT",
        body: JSON.stringify(newSettings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
      toast({
        title: "Settings updated",
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

  const currentSettings = { ...settings, ...localSettings };

  const handleSettingChange = (key: keyof UserSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSettings = () => {
    updateSettingsMutation.mutate(localSettings);
    setLocalSettings({});
  };

  const playTestSound = async (soundName: string) => {
    try {
      const volume = parseFloat(currentSettings.notificationVolume || "0.5");
      audioService.setVolume(volume);
      await audioService.playSound(soundName);
    } catch (error) {
      console.warn("Failed to play test sound:", error);
    }
  };

  const soundOptions = [
    { value: "chin-chin", label: "Chin-Chin (Default for Take Profit)" },
    { value: "beep", label: "Beep" },
    { value: "notification", label: "Notification" },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure your notification preferences and audio alerts.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Sound Notifications
            </CardTitle>
            <CardDescription>
              Configure audio alerts for trading events
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Master Switch */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Enable Sound Notifications</Label>
                <div className="text-sm text-muted-foreground">
                  Turn on/off all audio alerts
                </div>
              </div>
              <Switch
                checked={currentSettings.soundNotificationsEnabled}
                onCheckedChange={(checked) => 
                  handleSettingChange("soundNotificationsEnabled", checked)
                }
              />
            </div>

            {/* Volume Control */}
            <div className="space-y-3">
              <Label className="text-base">Volume</Label>
              <div className="px-2">
                <Slider
                  value={[parseFloat(currentSettings.notificationVolume || "0.5") * 100]}
                  onValueChange={(value) => 
                    handleSettingChange("notificationVolume", (value[0] / 100).toFixed(2))
                  }
                  max={100}
                  step={5}
                  className="w-full"
                  disabled={!currentSettings.soundNotificationsEnabled}
                />
                <div className="flex justify-between text-sm text-muted-foreground mt-1">
                  <span>0%</span>
                  <span>{Math.round(parseFloat(currentSettings.notificationVolume || "0.5") * 100)}%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            {/* Individual Sound Settings */}
            <div className="space-y-4">
              <h4 className="font-medium">Individual Sound Settings</h4>
              
              {/* Take Profit Orders */}
              <div className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Take Profit Orders</Label>
                    <div className="text-xs text-muted-foreground">
                      Play sound when take profit orders are filled
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings.takeProfitSoundEnabled}
                    onCheckedChange={(checked) => 
                      handleSettingChange("takeProfitSoundEnabled", checked)
                    }
                    disabled={!currentSettings.soundNotificationsEnabled}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Select
                    value={currentSettings.takeProfitSound}
                    onValueChange={(value) => handleSettingChange("takeProfitSound", value)}
                    disabled={!currentSettings.soundNotificationsEnabled || !currentSettings.takeProfitSoundEnabled}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {soundOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => playTestSound(currentSettings.takeProfitSound || "chin-chin")}
                    disabled={!currentSettings.soundNotificationsEnabled || !currentSettings.takeProfitSoundEnabled}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Safety Orders */}
              <div className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Safety Orders</Label>
                    <div className="text-xs text-muted-foreground">
                      Play sound when safety orders are filled
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings.safetyOrderSoundEnabled}
                    onCheckedChange={(checked) => 
                      handleSettingChange("safetyOrderSoundEnabled", checked)
                    }
                    disabled={!currentSettings.soundNotificationsEnabled}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Select
                    value={currentSettings.safetyOrderSound}
                    onValueChange={(value) => handleSettingChange("safetyOrderSound", value)}
                    disabled={!currentSettings.soundNotificationsEnabled || !currentSettings.safetyOrderSoundEnabled}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {soundOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => playTestSound(currentSettings.safetyOrderSound || "beep")}
                    disabled={!currentSettings.soundNotificationsEnabled || !currentSettings.safetyOrderSoundEnabled}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Base Orders */}
              <div className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Base Orders</Label>
                    <div className="text-xs text-muted-foreground">
                      Play sound when base orders are filled
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings.baseOrderSoundEnabled}
                    onCheckedChange={(checked) => 
                      handleSettingChange("baseOrderSoundEnabled", checked)
                    }
                    disabled={!currentSettings.soundNotificationsEnabled}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Select
                    value={currentSettings.baseOrderSound}
                    onValueChange={(value) => handleSettingChange("baseOrderSound", value)}
                    disabled={!currentSettings.soundNotificationsEnabled || !currentSettings.baseOrderSoundEnabled}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {soundOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => playTestSound(currentSettings.baseOrderSound || "notification")}
                    disabled={!currentSettings.soundNotificationsEnabled || !currentSettings.baseOrderSoundEnabled}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <Button 
                onClick={saveSettings}
                disabled={updateSettingsMutation.isPending || Object.keys(localSettings).length === 0}
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