import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Trash2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";

export function MyBotsPage() {
  const [activeSection, setActiveSection] = useState('active-bots');
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize order notifications
  useOrderNotifications();

  // Use WebSocket for live market data instead of polling API
  const [marketData, setMarketData] = useState<any>(null);
  
  useEffect(() => {
    if (!selectedBot?.tradingPair) return;
    
    // Get initial market data
    fetch('/api/market')
      .then(res => res.json())
      .then(data => {
        const found = data.find((item: any) => item.symbol === selectedBot.tradingPair);
        if (found) setMarketData(found);
      })
      .catch(console.error);
    
    // WebSocket connection for live updates
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host.split(':')[0]}:8080`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      // Subscribe to market data
      ws.send(JSON.stringify({
        type: 'subscribe_market',
        symbols: [selectedBot.tradingPair],
        dataType: 'ticker'
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'market_update' && data.symbol === selectedBot.tradingPair) {
          setMarketData(data);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    return () => {
      ws.close();
    };
  }, [selectedBot?.tradingPair]);

  // Fetch bots
  const { data: bots = [], isLoading: botsLoading } = useQuery({
    queryKey: ["/api/bots"],
  });

  // Fetch stats
  const { data: stats = {} } = useQuery({
    queryKey: ["/api/stats"],
  });

  // Delete bot mutation
  const deleteBotMutation = useMutation({
    mutationFn: async (botId: number) => {
      await apiRequest(`/api/bots/${botId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Bot deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      if (selectedBot) {
        setSelectedBot(null);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete bot",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-crypto-dark text-white">
      <div className="container mx-auto px-4 py-8">
        {selectedBot ? (
          <div className="space-y-6">
            {/* Bot Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedBot(null)}
                  className="text-crypto-light border-gray-700 hover:bg-gray-800"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Bots
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-white">{selectedBot.name}</h1>
                  <p className="text-crypto-light">
                    {selectedBot.tradingPair} • {selectedBot.strategy} • {selectedBot.direction}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <Badge className={`${
                  selectedBot.status === 'active' 
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                }`}>
                  {selectedBot.status || 'inactive'}
                </Badge>
                {marketData && (
                  <div className="text-right">
                    <div className="text-lg font-mono text-green-400 border border-green-500/30 bg-green-500/5 px-3 py-1 rounded">
                      ${parseFloat(marketData.price || '0').toFixed(4)}
                    </div>
                    <div className="text-xs text-crypto-light mt-1">Live Price</div>
                  </div>
                )}
              </div>
            </div>

            {/* Bot Configuration - Single Wide Card */}
            <Card className="bg-crypto-darker border-gray-800 mb-6">
              <CardHeader>
                <CardTitle className="text-white">Bot Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-sm">Base Order</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-lg font-bold text-green-400">${selectedBot.baseOrderAmount}</div>
                      <p className="text-xs text-crypto-light">Initial order size</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-sm">Safety Order</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-lg font-bold text-blue-400">${selectedBot.safetyOrderAmount}</div>
                      <p className="text-xs text-crypto-light">DCA order size</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-sm">Max Safety Orders</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-lg font-bold text-yellow-400">{selectedBot.maxSafetyOrders}</div>
                      <p className="text-xs text-crypto-light">DCA limit</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-sm">Price Deviation</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-lg font-bold text-purple-400">{selectedBot.priceDeviation}%</div>
                      <p className="text-xs text-crypto-light">DCA trigger</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-sm">Current Cycle</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-lg font-bold text-cyan-400">#{selectedBot.currentCycle || 1}</div>
                      <p className="text-xs text-crypto-light">Cycle number</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-sm">Total P&L</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-lg font-bold text-emerald-400">
                        ${parseFloat(selectedBot.totalPnl || '0').toFixed(2)}
                      </div>
                      <p className="text-xs text-crypto-light">All-time profit</p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Empty section for future content */}
            <div className="bg-crypto-darker border border-gray-800 rounded-lg p-8 text-center">
              <div className="text-crypto-light">This section is reserved for future features</div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Dashboard Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Total Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-400">${stats?.totalBalance || '0.00'}</div>
                  <p className="text-sm text-crypto-light mt-2">Portfolio value</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Total P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${parseFloat(stats?.totalPnl || '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${stats?.totalPnl || '0.00'}
                  </div>
                  <p className="text-sm text-crypto-light mt-2">Profit and loss</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Active Bots</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-400">{stats?.activeBots || 0}</div>
                  <p className="text-sm text-crypto-light mt-2">Currently running</p>
                </CardContent>
              </Card>
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
                Active Bots
              </button>
              <button
                onClick={() => setActiveSection('history')}
                className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                  activeSection === 'history'
                    ? 'border-crypto-primary text-crypto-primary'
                    : 'border-transparent text-crypto-light hover:text-white'
                }`}
              >
                History
              </button>
            </div>

            {/* Bot List */}
            <div className="space-y-4">
              {activeSection === 'active-bots' && (
                botsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">Loading bots...</div>
                  </div>
                ) : bots.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">No active bots found</div>
                  </div>
                ) : 
                  bots.map((bot: any) => (
                    <Card key={bot.id} className="bg-crypto-darker border-gray-800 hover:border-gray-700 transition-colors cursor-pointer"
                          onClick={() => setSelectedBot(bot)}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-white text-lg">{bot.name}</CardTitle>
                            <p className="text-sm text-crypto-light">
                              {bot.tradingPair} • {bot.strategy} • {bot.direction}
                            </p>
                          </div>
                          <div className="flex space-x-2">
                            <Badge className={`${
                              bot.status === 'active' 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                            }`}>
                              {bot.status || 'inactive'}
                            </Badge>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBotMutation.mutate(bot.id);
                              }}
                              disabled={deleteBotMutation.isPending}
                              className="text-red-400 border-red-600 hover:bg-red-600/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-crypto-light">Base Order</div>
                            <div className="text-white">${bot.baseOrderAmount}</div>
                          </div>
                          <div>
                            <div className="text-crypto-light">Safety Order</div>
                            <div className="text-white">${bot.safetyOrderAmount}</div>
                          </div>
                          <div>
                            <div className="text-crypto-light">Max Safety Orders</div>
                            <div className="text-white">{bot.maxSafetyOrders}</div>
                          </div>
                          <div>
                            <div className="text-crypto-light">Price Deviation</div>
                            <div className="text-white">{bot.priceDeviation}%</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}