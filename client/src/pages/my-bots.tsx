import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Trash2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function MyBotsPage() {
  const [activeSection, setActiveSection] = useState('active-bots');
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bots data
  const { data: bots = [], isLoading: botsLoading } = useQuery<any[]>({
    queryKey: ['/api/bots']
  });

  // Fetch bot cycles for selected bot
  const { data: botCycles = [], isLoading: cyclesLoading } = useQuery<any[]>({
    queryKey: ['/api/bot-cycles', selectedBot?.id],
    enabled: !!selectedBot
  });

  // Fetch bot orders for selected bot
  const { data: botOrders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/bot-orders', selectedBot?.id],
    enabled: !!selectedBot
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
        description: "Trading bot has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete trading bot.",
        variant: "destructive",
      });
    }
  });

  // Stop bot mutation
  const stopBotMutation = useMutation({
    mutationFn: async (botId: number) => {
      await apiRequest(`/api/bots/${botId}`, 'PUT', { isActive: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      toast({
        title: "Bot Stopped",
        description: "Trading bot has been successfully stopped.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Stop Failed",
        description: error.message || "Failed to stop trading bot.",
        variant: "destructive",
      });
    }
  });



  const sidebarItems = [
    { id: 'active-bots', label: 'Active Bots', icon: 'fas fa-play-circle' },
    { id: 'bot-templates', label: 'Bot Templates', icon: 'fas fa-template' },
    { id: 'bot-history', label: 'Trading History', icon: 'fas fa-history' },
    { id: 'bot-performance', label: 'Performance', icon: 'fas fa-chart-line' },
    { id: 'bot-settings', label: 'Bot Settings', icon: 'fas fa-cog' },
  ];

  const activeBots = Array.isArray(bots) ? bots.filter((bot: any) => bot.isActive || bot.is_active) : [];
  const inactiveBots = Array.isArray(bots) ? bots.filter((bot: any) => !(bot.isActive || bot.is_active)) : [];

  const renderBotDetails = () => {
    const activeCycles = botCycles?.filter((cycle: any) => cycle.status === 'active') || [];
    const completedCycles = botCycles?.filter((cycle: any) => cycle.status === 'completed') || [];
    const currentCycle = activeCycles[0];

    return (
      <div className="min-h-screen bg-crypto-dark text-white">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedBot(null)}
              className="border-gray-600 hover:border-crypto-accent text-white"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back to Bots
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">{selectedBot.name}</h1>
              <p className="text-crypto-light">{selectedBot.tradingPair || selectedBot.trading_pair}</p>
            </div>
            <Badge className={`ml-auto ${
              selectedBot.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
              selectedBot.status === 'failed' || selectedBot.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
              'bg-gray-500/10 text-gray-400 border-gray-500/20'
            }`}>
              {selectedBot.status === 'active' ? 'Running' :
               selectedBot.status === 'failed' ? 'Failed' :
               selectedBot.status === 'error' ? 'Error' :
               'Stopped'}
            </Badge>
          </div>

          {/* Error Message for Failed Bots */}
          {(selectedBot.status === 'failed' || selectedBot.status === 'error') && selectedBot.errorMessage && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-400">Bot Creation Failed</h3>
                  <p className="mt-1 text-sm text-red-300">{selectedBot.errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Bot Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-crypto-light">Exchange</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-white">Binance Testnet</p>
              </CardContent>
            </Card>

            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-crypto-light">Strategy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-white capitalize">{selectedBot.strategy}</p>
              </CardContent>
            </Card>

            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-crypto-light">Total Investment</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-white">${selectedBot.totalInvested || selectedBot.total_invested || '0.00'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Cycle Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Current Cycle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentCycle ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-crypto-light">Cycle Number:</span>
                      <span className="text-white font-medium">#{currentCycle.cycleNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-crypto-light">Safety Orders Filled:</span>
                      <span className="text-white font-medium">{currentCycle.filledSafetyOrders}/{currentCycle.maxSafetyOrders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-crypto-light">Total Invested:</span>
                      <span className="text-white font-medium">${currentCycle.totalInvested || '0.00'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-crypto-light">Average Price:</span>
                      <span className="text-white font-medium">${currentCycle.currentAveragePrice || 'N/A'}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-crypto-light text-center py-4">No active cycle</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Performance Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-crypto-light">Completed Cycles:</span>
                  <span className="text-white font-medium">{completedCycles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Total PnL:</span>
                  <span className={`font-medium ${parseFloat(selectedBot.totalPnl || selectedBot.total_pnl || '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${selectedBot.totalPnl || selectedBot.total_pnl || '0.00'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Total Trades:</span>
                  <span className="text-white font-medium">{selectedBot.totalTrades || selectedBot.total_trades || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Win Rate:</span>
                  <span className="text-white font-medium">{selectedBot.winRate || selectedBot.win_rate || '0.00'}%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart Placeholder */}
          <Card className="bg-crypto-darker border-gray-800 mb-6">
            <CardHeader>
              <CardTitle className="text-white">Price Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-crypto-dark rounded-lg border border-gray-700 flex items-center justify-center">
                <p className="text-crypto-light">Chart will be implemented here</p>
              </div>
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card className="bg-crypto-darker border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Orders History</CardTitle>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="text-center py-8">
                  <div className="text-crypto-light">Loading orders...</div>
                </div>
              ) : botOrders.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-crypto-light">No orders found for this bot</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-4 text-crypto-light">Order Type</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Side</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Quantity</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Price</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Status</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {botOrders.map((order: any, index: number) => (
                        <tr key={index} className="border-b border-gray-800">
                          <td className="py-3 px-4 text-white capitalize">
                            {order.orderType || order.order_type}
                            {order.safetyOrderLevel && ` (Level ${order.safetyOrderLevel || order.safety_order_level})`}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`font-medium ${order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                              {order.side}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-white">{order.quantity}</td>
                          <td className="py-3 px-4 text-white">${order.price}</td>
                          <td className="py-3 px-4">
                            <Badge className={`${
                              order.status === 'filled' 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : order.status === 'pending'
                                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {order.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-crypto-light">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // If bot is selected, show bot details
  if (selectedBot) {
    return renderBotDetails();
  }

  const renderActiveBots = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Active Trading Bots ({activeBots.length})</h3>
        {botsLoading ? (
          <div className="text-center py-12">
            <div className="text-crypto-light">Loading bots...</div>
          </div>
        ) : activeBots.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-robot text-crypto-accent text-2xl"></i>
            </div>
            <h4 className="text-xl font-semibold text-white mb-2">No Active Bots</h4>
            <p className="text-crypto-light mb-6">You don't have any active trading bots running yet.</p>
            <Button className="bg-crypto-accent hover:bg-crypto-accent/80 text-white">
              <i className="fas fa-plus mr-2"></i>
              Create New Bot
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeBots.map((bot: any) => (
              <Card key={bot.id} className="bg-crypto-darker border-gray-800">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-sm font-medium">{bot.name}</CardTitle>
                    <Badge className={`${
                      bot.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      bot.status === 'failed' || bot.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      'bg-gray-500/10 text-gray-400 border-gray-500/20'
                    }`}>
                      {bot.status === 'active' ? 'Running' :
                       bot.status === 'failed' ? 'Failed' :
                       bot.status === 'error' ? 'Error' :
                       'Stopped'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-crypto-light">Pair:</span>
                      <div className="text-white font-medium">{bot.tradingPair || bot.trading_pair}</div>
                    </div>
                    <div>
                      <span className="text-crypto-light">Strategy:</span>
                      <div className="text-white font-medium capitalize">{bot.strategy}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-crypto-light">Direction:</span>
                      <div className={`font-medium ${bot.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                        {bot.direction?.toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <span className="text-crypto-light">Base Amount:</span>
                      <div className="text-white font-medium">${bot.baseOrderAmount || bot.base_order_amount}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 text-xs border-gray-600 hover:border-crypto-accent text-white"
                      onClick={() => setSelectedBot(bot)}
                    >
                      View Details
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 text-xs border-red-600 hover:border-red-500 text-red-400"
                      onClick={() => stopBotMutation.mutate(bot.id)}
                      disabled={stopBotMutation.isPending}
                    >
                      Stop Bot
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="px-2 text-xs border-red-600 hover:border-red-500 text-red-400"
                      onClick={() => deleteBotMutation.mutate(bot.id)}
                      disabled={deleteBotMutation.isPending}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {inactiveBots.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-medium text-white mb-4">Inactive Bots ({inactiveBots.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inactiveBots.map((bot: any) => (
                <Card key={bot.id} className="bg-crypto-darker border-gray-800 opacity-60">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-sm font-medium">{bot.name}</CardTitle>
                      <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                        Stopped
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-crypto-light">Pair:</span>
                        <div className="text-white font-medium">{bot.tradingPair}</div>
                      </div>
                      <div>
                        <span className="text-crypto-light">Strategy:</span>
                        <div className="text-white font-medium capitalize">{bot.strategy}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1 text-xs border-green-600 hover:border-green-500 text-green-400">
                        Start Bot
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-xs border-gray-600 hover:border-crypto-accent text-white">
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderBotTemplates = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Bot Templates</h3>
        <p className="text-crypto-light mb-6">Choose from pre-configured trading strategies to get started quickly.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'Grid Trading', description: 'Buy low, sell high with automated grid orders', icon: 'fas fa-th' },
            { name: 'DCA Bot', description: 'Dollar cost averaging with regular purchases', icon: 'fas fa-calendar-alt' },
            { name: 'Martingale', description: 'Double down strategy for trend recovery', icon: 'fas fa-chart-line' },
          ].map((template, index) => (
            <div key={index} className="bg-crypto-darker p-4 rounded-lg border border-gray-800 hover:border-crypto-accent/30 transition-colors">
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-crypto-accent/10 rounded-lg flex items-center justify-center mr-3">
                  <i className={`${template.icon} text-crypto-accent`}></i>
                </div>
                <h4 className="text-white font-medium">{template.name}</h4>
              </div>
              <p className="text-crypto-light text-sm mb-4">{template.description}</p>
              <Button size="sm" variant="outline" className="border-gray-700 text-crypto-light hover:bg-gray-800 hover:text-white">
                Use Template
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderBotHistory = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Trading History</h3>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-history text-gray-400 text-2xl"></i>
          </div>
          <h4 className="text-xl font-semibold text-white mb-2">No Trading History</h4>
          <p className="text-crypto-light">Your bot trading history will appear here once you start trading.</p>
        </div>
      </div>
    </div>
  );

  const renderBotPerformance = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Performance Analytics</h3>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-chart-line text-gray-400 text-2xl"></i>
          </div>
          <h4 className="text-xl font-semibold text-white mb-2">No Performance Data</h4>
          <p className="text-crypto-light">Performance metrics will be available once your bots start trading.</p>
        </div>
      </div>
    </div>
  );

  const renderBotSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Bot Settings</h3>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-cog text-gray-400 text-2xl"></i>
          </div>
          <h4 className="text-xl font-semibold text-white mb-2">No Bot Settings</h4>
          <p className="text-crypto-light">Bot configuration options will appear here when you create your first bot.</p>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'active-bots':
        return renderActiveBots();
      case 'bot-templates':
        return renderBotTemplates();
      case 'bot-history':
        return renderBotHistory();
      case 'bot-performance':
        return renderBotPerformance();
      case 'bot-settings':
        return renderBotSettings();
      default:
        return renderActiveBots();
    }
  };

  return (
    <div className="flex h-screen bg-crypto-darker">
      {/* My Bots Sidebar */}
      <div className="w-64 bg-crypto-dark border-r border-gray-800 p-4">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">My Bots</h2>
          <p className="text-sm text-crypto-light">Manage your trading automation</p>
        </div>
        
        <nav className="space-y-2">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                activeSection === item.id
                  ? 'bg-crypto-accent/10 text-crypto-accent border border-crypto-accent/20'
                  : 'text-crypto-light hover:bg-gray-800 hover:text-white'
              }`}
            >
              <i className={item.icon}></i>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      
      {/* My Bots Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <Card className="bg-crypto-dark border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              {sidebarItems.find(item => item.id === activeSection)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderContent()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}