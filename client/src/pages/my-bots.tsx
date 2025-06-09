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
  const [activeSection, setActiveSection] = useState('active');
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
        console.error('WebSocket message parse error:', error);
      }
    };
    
    return () => {
      ws.close();
    };
  }, [selectedBot?.tradingPair]);

  // Fetch bots
  const { data: bots = [], isLoading: botsLoading } = useQuery({
    queryKey: ["/api/bots"],
  });

  // Fetch bot cycles for selected bot
  const { data: botCycles = [] } = useQuery({
    queryKey: ["/api/bot-cycles", selectedBot?.id],
    enabled: !!selectedBot?.id,
  });

  // Fetch bot orders for selected bot
  const { data: botOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/bot-orders", selectedBot?.id],
    enabled: !!selectedBot?.id,
  });

  // Stop bot mutation
  const stopBotMutation = useMutation({
    mutationFn: async (botId: number) => {
      const response = await apiRequest(`/api/bots/${botId}/stop`, {
        method: "POST",
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Bot stopped",
        description: "The trading bot has been stopped successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      setSelectedBot(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error stopping bot",
        description: error.message || "Failed to stop the bot.",
        variant: "destructive",
      });
    },
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
        title: "Bot deleted",
        description: "The trading bot has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      setSelectedBot(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting bot",
        description: error.message || "Failed to delete the bot.",
        variant: "destructive",
      });
    },
  });

  const activeBots = bots.filter((bot: any) => bot.status === 'active');
  const inactiveBots = bots.filter((bot: any) => bot.status !== 'active');

  // Get current active cycle
  const currentCycle = botCycles.find((cycle: any) => cycle.status === 'active');

  // Group orders by cycle
  const ordersByCycle = botOrders.reduce((acc: any, order: any) => {
    const cycleId = order.cycleId || 'no-cycle';
    if (!acc[cycleId]) {
      acc[cycleId] = [];
    }
    acc[cycleId].push(order);
    return acc;
  }, {});

  // Calculate cycle profit
  const calculateCycleProfit = (cycleOrders: any[], cycleData: any) => {
    const buyOrders = cycleOrders.filter(o => o.side === 'BUY' && o.status === 'filled');
    const sellOrders = cycleOrders.filter(o => o.side === 'SELL' && o.status === 'filled');
    
    const totalBought = buyOrders.reduce((sum, o) => sum + (parseFloat(o.filledPrice || o.price || '0') * parseFloat(o.filledQuantity || o.quantity || '0')), 0);
    const totalSold = sellOrders.reduce((sum, o) => sum + (parseFloat(o.filledPrice || o.price || '0') * parseFloat(o.filledQuantity || o.quantity || '0')), 0);
    
    return totalSold - totalBought;
  };

  if (selectedBot) {
    return (
      <div className="container mx-auto p-6 bg-crypto-dark min-h-screen">
        <div className="mb-6">
          <Button
            onClick={() => setSelectedBot(null)}
            className="mb-4 bg-gray-600 hover:bg-gray-700 text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Bots
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">{selectedBot.name}</h1>
              <p className="text-crypto-light">{selectedBot.tradingPair} • {selectedBot.strategy}</p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge className={`${
                selectedBot.status === 'active' 
                  ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                  : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
              }`}>
                {selectedBot.status}
              </Badge>
              {marketData && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">${parseFloat(marketData.price || '0').toFixed(4)}</div>
                  <div className={`text-sm ${parseFloat(marketData.priceChangePercent || '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {parseFloat(marketData.priceChangePercent || '0') >= 0 ? '+' : ''}{parseFloat(marketData.priceChangePercent || '0').toFixed(2)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bot Configuration */}
        <div className="mb-8">
          <Card className="bg-crypto-darker border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Bot Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-crypto-light">Base Order</div>
                  <div className="text-white font-semibold">${selectedBot.baseOrderAmount}</div>
                </div>
                <div>
                  <div className="text-sm text-crypto-light">Safety Order</div>
                  <div className="text-white font-semibold">${selectedBot.safetyOrderAmount}</div>
                </div>
                <div>
                  <div className="text-sm text-crypto-light">Max Safety Orders</div>
                  <div className="text-white font-semibold">{selectedBot.maxSafetyOrders}</div>
                </div>
                <div>
                  <div className="text-sm text-crypto-light">Price Deviation</div>
                  <div className="text-white font-semibold">{selectedBot.priceDeviation}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Current Cycle Info */}
        {currentCycle && (
          <div className="mb-8">
            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Current Cycle #{currentCycle.cycleNumber}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-crypto-light">Status</div>
                    <div className="text-white font-semibold capitalize">{currentCycle.status}</div>
                  </div>
                  <div>
                    <div className="text-sm text-crypto-light">Base Price</div>
                    <div className="text-white font-semibold">${parseFloat(currentCycle.basePrice || '0').toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-crypto-light">Target Profit</div>
                    <div className="text-green-400 font-semibold">{currentCycle.takeProfitPercentage}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-crypto-light">Created</div>
                    <div className="text-white font-semibold">
                      {currentCycle.createdAt ? new Date(currentCycle.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Orders by Cycle */}
        <div className="space-y-6">
          {ordersLoading ? (
            <Card className="bg-crypto-darker border-gray-800">
              <CardContent className="text-center py-8">
                <div className="text-crypto-light">Loading orders...</div>
              </CardContent>
            </Card>
          ) : Object.keys(ordersByCycle).length === 0 ? (
            <Card className="bg-crypto-darker border-gray-800">
              <CardContent className="text-center py-8">
                <div className="text-crypto-light">No orders found for this bot</div>
              </CardContent>
            </Card>
          ) : (
            // Sort cycles by cycle number (descending - newest first)
            Object.entries(ordersByCycle)
              .sort(([, ordersA], [, ordersB]) => {
                const cycleA = botCycles.find((c: any) => c.id === (ordersA as any[])[0]?.cycleId);
                const cycleB = botCycles.find((c: any) => c.id === (ordersB as any[])[0]?.cycleId);
                return (cycleB?.cycleNumber || 0) - (cycleA?.cycleNumber || 0);
              })
              .map(([cycleId, cycleOrders]) => {
                const cycleData = botCycles.find((cycle: any) => cycle.id === parseInt(cycleId));
                const cycleProfit = calculateCycleProfit(cycleOrders as any[], cycleData);
                const isActiveCycle = currentCycle?.id === parseInt(cycleId);
                
                return (
                  <Card key={cycleId} className={`bg-crypto-darker border-gray-800 ${
                    isActiveCycle ? 'ring-2 ring-crypto-primary/30' : ''
                  }`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-white flex items-center gap-2">
                            Cycle #{cycleData?.cycleNumber || 'Unknown'}
                            {isActiveCycle && (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                Active
                              </Badge>
                            )}
                            {cycleData?.status === 'completed' && (
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                Completed
                              </Badge>
                            )}
                          </CardTitle>
                          <p className="text-sm text-crypto-light">
                            {(cycleOrders as any[]).length} orders • 
                            {(cycleOrders as any[]).filter(o => o.status === 'filled').length} filled • 
                            {(cycleOrders as any[]).filter(o => o.status === 'placed').length} pending
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${
                            cycleProfit > 0 ? 'text-green-400' : 
                            cycleProfit < 0 ? 'text-red-400' : 'text-gray-400'
                          }`}>
                            {cycleProfit > 0 ? '+' : ''}${cycleProfit.toFixed(4)}
                          </div>
                          <div className="text-xs text-crypto-light">Cycle P&L</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left py-3 px-4 text-crypto-light">Order Type</th>
                              <th className="text-left py-3 px-4 text-crypto-light">Side</th>
                              <th className="text-left py-3 px-4 text-crypto-light">Price</th>
                              <th className="text-left py-3 px-4 text-crypto-light">Distance</th>
                              <th className="text-left py-3 px-4 text-crypto-light">Quantity</th>
                              <th className="text-left py-3 px-4 text-crypto-light">Status</th>
                              <th className="text-left py-3 px-4 text-crypto-light">Date Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(cycleOrders as any[]).map((order: any, index: number) => {
                              const currentPrice = parseFloat(marketData?.price || '0');
                              const orderPrice = parseFloat(order.filledPrice || order.price || '0');
                              const isUnfilled = order.status !== 'filled' && order.status !== 'cancelled';
                              const distance = currentPrice > 0 && isUnfilled ? ((orderPrice - currentPrice) / currentPrice) * 100 : 0;
                              const isCloseToFill = isUnfilled && Math.abs(distance) < 2;
                              
                              return (
                                <tr key={index} className={`border-b border-gray-800 hover:bg-gray-800/50 ${
                                  isCloseToFill && order.status === 'placed' ? 'bg-yellow-500/5 border-yellow-500/20' : ''
                                }`}>
                                  <td className="py-3 px-4 text-white">
                                    <div className="flex flex-col">
                                      <span className="font-medium capitalize">
                                        {order.orderType?.replace('_', ' ') || order.order_type?.replace('_', ' ')}
                                      </span>
                                      {order.safetyOrderLevel && (
                                        <span className="text-xs text-crypto-light">Level {order.safetyOrderLevel}</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      order.side === 'BUY' 
                                        ? 'bg-green-500/20 text-green-400' 
                                        : 'bg-red-500/20 text-red-400'
                                    }`}>
                                      {order.side}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-white font-mono">
                                    ${orderPrice.toFixed(4)}
                                  </td>
                                  <td className="py-3 px-4">
                                    {isUnfilled && distance !== 0 && (
                                      <span className={`text-xs font-medium ${
                                        distance > 0 ? 'text-green-400' : 'text-red-400'
                                      }`}>
                                        {distance > 0 ? '+' : ''}{distance.toFixed(2)}%
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-white font-mono">
                                    {parseFloat(order.filledQuantity || order.quantity || '0').toFixed(1)}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      order.status === 'filled' 
                                        ? 'bg-green-500/10 text-green-400' : 
                                      order.status === 'placed' 
                                        ? 'bg-blue-500/10 text-blue-400' : 
                                      order.status === 'cancelled' 
                                        ? 'bg-gray-500/10 text-gray-400' :
                                      'bg-red-500/10 text-red-400'
                                    }`}>
                                      {order.status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-crypto-light text-xs">
                                    {order.filledAt ? new Date(order.filledAt).toLocaleString() :
                                     order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 bg-crypto-dark min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">My Trading Bots</h1>
        <p className="text-crypto-light">Manage and monitor your automated trading strategies</p>
      </div>

      {/* Bot List Section */}
      <div className="mt-8">
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveSection('active')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeSection === 'active'
                ? 'bg-crypto-primary text-white'
                : 'bg-crypto-dark text-crypto-light hover:bg-gray-700'
            }`}
          >
            Active Bots ({activeBots.length})
          </button>
          <button
            onClick={() => setActiveSection('inactive')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeSection === 'inactive'
                ? 'bg-crypto-primary text-white'
                : 'bg-crypto-dark text-crypto-light hover:bg-gray-700'
            }`}
          >
            Inactive Bots ({inactiveBots.length})
          </button>
        </div>

        {activeSection === 'active' && (
          <div>
            {botsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="bg-crypto-darker border-gray-800">
                    <CardContent className="p-6">
                      <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                        <div className="h-3 bg-gray-700 rounded w-2/3"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : activeBots.length === 0 ? (
              <Card className="bg-crypto-darker border-gray-800">
                <CardContent className="text-center py-12">
                  <div className="text-crypto-light">No active bots found</div>
                  <p className="text-sm text-gray-500 mt-2">Create a new bot to get started</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeBots.map((bot: any) => (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    onView={() => setSelectedBot(bot)}
                    onStop={() => {
                      setSelectedBot(bot);
                      stopBotMutation.mutate(bot.id);
                    }}
                    onDelete={() => {
                      setSelectedBot(bot);
                      deleteBotMutation.mutate(bot.id);
                    }}
                    isActive={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'inactive' && (
          <div>
            {inactiveBots.length === 0 ? (
              <Card className="bg-crypto-darker border-gray-800">
                <CardContent className="text-center py-12">
                  <div className="text-crypto-light">No inactive bots found</div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {inactiveBots.map((bot: any) => (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    onView={() => setSelectedBot(bot)}
                    onDelete={() => {
                      setSelectedBot(bot);
                      deleteBotMutation.mutate(bot.id);
                    }}
                    isActive={false}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// BotCard component
function BotCard({ 
  bot, 
  onView, 
  onStop, 
  onDelete, 
  isActive 
}: { 
  bot: any; 
  onView: () => void; 
  onStop?: () => void; 
  onDelete: () => void; 
  isActive: boolean; 
}) {
  return (
    <Card className="bg-crypto-darker border-gray-800 hover:border-crypto-primary/30 transition-all cursor-pointer">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold text-lg">{bot.name}</h3>
            <p className="text-crypto-light text-sm">{bot.tradingPair}</p>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            bot.status === 'active' 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-gray-500/20 text-gray-400'
          }`}>
            {bot.status}
          </div>
        </div>
        
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-crypto-light">Strategy:</span>
            <span className="text-white capitalize">{bot.strategy}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-crypto-light">Base Order:</span>
            <span className="text-white">${bot.baseOrderAmount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-crypto-light">Safety Orders:</span>
            <span className="text-white">{bot.maxSafetyOrders}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onView}
            className="flex-1 bg-crypto-primary hover:bg-crypto-primary/80 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
          >
            View Details
          </button>
          {isActive && onStop && (
            <button
              onClick={onStop}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
            >
              Stop
            </button>
          )}
          <button
            onClick={onDelete}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      </CardContent>
    </Card>
  );
}