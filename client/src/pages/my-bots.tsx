import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
import { BotDetailsPage } from "./bot-details";

export function MyBotsPage() {
  const [activeSection, setActiveSection] = useState('active-bots');
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize order notifications
  useOrderNotifications();

  // Fetch bots data (event-driven updates only)
  const { data: bots = [], isLoading: botsLoading } = useQuery<any[]>({
    queryKey: ['/api/bots']
  });

  // Stop bot mutation
  const stopBotMutation = useMutation({
    mutationFn: async (botId: number) => {
      await apiRequest(`/api/bots/${botId}/stop`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      toast({
        title: "Bot Stopped",
        description: "Trading bot has been stopped successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to stop bot",
        variant: "destructive"
      });
    }
  });

  // Delete bot mutation
  const deleteBotMutation = useMutation({
    mutationFn: async (botId: number) => {
      await apiRequest(`/api/bots/${botId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      toast({
        title: "Bot Deleted",
        description: "Trading bot has been deleted successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete bot",
        variant: "destructive"
      });
    }
  });

  // Filter bots by status
  const activeBots = bots.filter(bot => bot.status === 'active');
  const inactiveBots = bots.filter(bot => bot.status !== 'active');

  return (
    <div className="min-h-screen bg-crypto-dark text-white">
      <div className="container mx-auto px-4 py-8">
        {selectedBot ? (
          <BotDetailsPage 
            bot={selectedBot} 
            onBack={() => setSelectedBot(null)} 
          />
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">My Trading Bots</h1>
              <p className="text-crypto-light">Manage your automated trading strategies</p>
            </div>

            {/* Bot Sections */}
            <div className="flex space-x-4 border-b border-gray-800">
              <button
                onClick={() => setActiveSection('active-bots')}
                className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                  activeSection === 'active-bots'
                    ? 'border-crypto-primary text-crypto-primary'
                    : 'border-transparent text-crypto-light hover:text-white'
                }`}
              >
                Active Bots ({activeBots.length})
              </button>
              <button
                onClick={() => setActiveSection('inactive-bots')}
                className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                  activeSection === 'inactive-bots'
                    ? 'border-crypto-primary text-crypto-primary'
                    : 'border-transparent text-crypto-light hover:text-white'
                }`}
              >
                Inactive Bots ({inactiveBots.length})
              </button>
            </div>

            {/* Bot Cards */}
            {activeSection === 'active-bots' && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Active Trading Bots</h2>
                {botsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">Loading bots...</div>
                  </div>
                ) : activeBots.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">No active bots found</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activeBots.map((bot: any) => (
                      <Card key={bot.id} className="bg-crypto-darker border-gray-800 hover:border-gray-700 transition-colors">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-white text-lg">{bot.name}</CardTitle>
                            <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                              Active
                            </Badge>
                          </div>
                          <p className="text-crypto-light text-sm">
                            {bot.tradingPair} • {bot.strategy} • {bot.direction}
                          </p>
                          <div className="flex items-center space-x-2 mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedBot(bot)}
                              className="text-crypto-light border-gray-700 hover:bg-gray-800"
                            >
                              View Details
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => stopBotMutation.mutate(bot.id)}
                              disabled={stopBotMutation.isPending}
                              className="text-red-400 border-red-600 hover:bg-red-600/10"
                            >
                              Stop
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteBotMutation.mutate(bot.id)}
                              disabled={deleteBotMutation.isPending}
                              className="text-red-400 border-red-600 hover:bg-red-600/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-crypto-light">Base Amount:</span>
                              <div className="text-white font-mono">${bot.baseOrderAmount}</div>
                            </div>
                            <div>
                              <span className="text-crypto-light">Safety Amount:</span>
                              <div className="text-white font-mono">${bot.safetyOrderAmount}</div>
                            </div>
                            <div>
                              <span className="text-crypto-light">Max Safety Orders:</span>
                              <div className="text-white">{bot.maxSafetyOrders}</div>
                            </div>
                            <div>
                              <span className="text-crypto-light">Price Deviation:</span>
                              <div className="text-white">{bot.priceDeviation}%</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSection === 'inactive-bots' && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Inactive Trading Bots</h2>
                {botsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">Loading bots...</div>
                  </div>
                ) : inactiveBots.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">No inactive bots found</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {inactiveBots.map((bot: any) => (
                      <Card key={bot.id} className="bg-crypto-darker border-gray-800 hover:border-gray-700 transition-colors">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-white text-lg">{bot.name}</CardTitle>
                            <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                              Inactive
                            </Badge>
                          </div>
                          <p className="text-crypto-light text-sm">
                            {bot.tradingPair} • {bot.strategy} • {bot.direction}
                          </p>
                          <div className="flex items-center space-x-2 mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedBot(bot)}
                              className="text-crypto-light border-gray-700 hover:bg-gray-800"
                            >
                              View Details
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteBotMutation.mutate(bot.id)}
                              disabled={deleteBotMutation.isPending}
                              className="text-red-400 border-red-600 hover:bg-red-600/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-crypto-light">Base Amount:</span>
                              <div className="text-white font-mono">${bot.baseOrderAmount}</div>
                            </div>
                            <div>
                              <span className="text-crypto-light">Safety Amount:</span>
                              <div className="text-white font-mono">${bot.safetyOrderAmount}</div>
                            </div>
                            <div>
                              <span className="text-crypto-light">Max Safety Orders:</span>
                              <div className="text-white">{bot.maxSafetyOrders}</div>
                            </div>
                            <div>
                              <span className="text-crypto-light">Price Deviation:</span>
                              <div className="text-white">{bot.priceDeviation}%</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}