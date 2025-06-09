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
    enabled: !!selectedBot,
    refetchInterval: 5000 // Refresh every 5 seconds for real-time data
  });

  // Fetch real-time bot data for selected bot
  const { data: realTimeBotData } = useQuery<any>({
    queryKey: ['/api/bots', selectedBot?.id],
    enabled: !!selectedBot,
    refetchInterval: 3000 // Refresh every 3 seconds for real-time updates
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

  // Stop bot mutation with order cancellation and liquidation
  const stopBotMutation = useMutation({
    mutationFn: async (botId: number) => {
      await apiRequest(`/api/bots/${botId}/stop`, 'POST');
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      toast({
        title: "Bot Stopped Successfully",
        description: `Bot stopped. ${data?.cancelledOrders || 0} orders cancelled, ${data?.liquidated ? 'assets liquidated' : 'no assets to liquidate'}.`,
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
    // Use real-time data if available, fallback to selected bot data
    const botData = realTimeBotData || selectedBot;
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
              <h1 className="text-2xl font-bold text-white">{botData.name}</h1>
              <p className="text-crypto-light">{botData.tradingPair || botData.trading_pair}</p>
              {botData.errorMessage && (
                <p className="text-red-400 text-sm mt-1">{botData.errorMessage}</p>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Badge className={`${
                botData.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                botData.status === 'failed' || botData.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                'bg-gray-500/10 text-gray-400 border-gray-500/20'
              }`}>
                {botData.status === 'active' ? 'Running' :
                 botData.status === 'failed' ? 'Failed' :
                 botData.status === 'error' ? 'Error' :
                 'Stopped'}
              </Badge>
              {botData.status === 'active' && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-400">Live</span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="border-red-600 hover:border-red-500 text-red-400"
                onClick={() => stopBotMutation.mutate(botData.id)}
                disabled={stopBotMutation.isPending || botData.status !== 'active'}
              >
                Stop Bot
              </Button>
            </div>
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

          {/* Bot Configuration Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-crypto-light">Exchange</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-white">Binance Testnet</p>
                <p className="text-xs text-crypto-light mt-1">Exchange ID: {botData.exchangeId}</p>
              </CardContent>
            </Card>

            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-crypto-light">Strategy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-white capitalize">{botData.strategy}</p>
                <p className="text-xs text-crypto-light mt-1">Direction: {botData.direction?.toUpperCase() || 'LONG'}</p>
              </CardContent>
            </Card>

            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-crypto-light">Base Order</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-white">${parseFloat(botData.baseOrderAmount || '0').toFixed(2)}</p>
                <p className="text-xs text-crypto-light mt-1">Initial investment per cycle</p>
              </CardContent>
            </Card>

            <Card className="bg-crypto-darker border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-crypto-light">Safety Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-white">{botData.maxSafetyOrders || 0}</p>
                <p className="text-xs text-crypto-light mt-1">Max: ${parseFloat(botData.safetyOrderAmount || '0').toFixed(2)} each</p>
              </CardContent>
            </Card>
          </div>

          {/* Strategy Configuration */}
          <Card className="bg-crypto-darker border-gray-800 mb-6">
            <CardHeader>
              <CardTitle className="text-white">Strategy Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-crypto-light text-sm">Price Deviation</p>
                  <p className="text-white font-medium">{parseFloat(botData.priceDeviation || '0').toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-crypto-light text-sm">Take Profit</p>
                  <p className="text-white font-medium">{parseFloat(botData.takeProfitPercentage || '0').toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-crypto-light text-sm">Volume Scale</p>
                  <p className="text-white font-medium">{parseFloat(botData.safetyOrderSizeMultiplier || '1').toFixed(1)}x</p>
                </div>
                <div>
                  <p className="text-crypto-light text-sm">Created</p>
                  <p className="text-white font-medium">
                    {botData.createdAt ? new Date(botData.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Cycle with Dynamic P&L */}
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
                      <span className="text-crypto-light">Status:</span>
                      <span className={`font-medium capitalize ${
                        currentCycle.status === 'active' ? 'text-blue-400' :
                        currentCycle.status === 'completed' ? 'text-green-400' :
                        'text-gray-400'
                      }`}>
                        {currentCycle.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-crypto-light">Safety Orders Filled:</span>
                      <span className="text-white font-medium">{currentCycle.filledSafetyOrders}/{currentCycle.maxSafetyOrders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-crypto-light">Total Invested:</span>
                      <span className="text-white font-medium">${parseFloat(currentCycle.totalInvested || '0').toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-crypto-light">Average Price:</span>
                      <span className="text-white font-medium">${parseFloat(currentCycle.currentAveragePrice || '0').toFixed(3)}</span>
                    </div>
                    {currentCycle.totalQuantity && (
                      <div className="flex justify-between">
                        <span className="text-crypto-light">Total Quantity:</span>
                        <span className="text-white font-medium">{parseFloat(currentCycle.totalQuantity).toFixed(3)} {selectedBot.tradingPair?.replace('USDT', '')}</span>
                      </div>
                    )}
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
                  <span className="text-crypto-light">Total Cycles:</span>
                  <span className="text-white font-medium">{botCycles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Active Cycles:</span>
                  <span className="text-blue-400 font-medium">{activeCycles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Completed Cycles:</span>
                  <span className="text-green-400 font-medium">{completedCycles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Total Invested:</span>
                  <span className="text-white font-medium">${parseFloat(botData.totalInvested || '0').toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Total PnL:</span>
                  <span className={`font-medium ${parseFloat(botData.totalPnl || '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${parseFloat(botData.totalPnl || '0').toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Total Orders:</span>
                  <span className="text-white font-medium">{botOrders.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Filled Orders:</span>
                  <span className="text-green-400 font-medium">{botOrders.filter((order: any) => order.status === 'filled').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crypto-light">Win Rate:</span>
                  <span className="text-white font-medium">{parseFloat(botData.winRate || '0').toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Strategy Orders */}
          <Card className="bg-crypto-darker border-gray-800 mb-6">
            <CardHeader>
              <CardTitle className="text-white">Strategy Orders</CardTitle>
              <p className="text-sm text-crypto-light">All orders for this bot with their current status</p>
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
                        <th className="text-left py-3 px-4 text-crypto-light">Price</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Quantity</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Filled</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Status</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Exchange ID</th>
                        <th className="text-left py-3 px-4 text-crypto-light">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {botOrders.map((order: any, index: number) => (
                        <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="py-3 px-4 text-white">
                            <div className="flex flex-col">
                              <span className="font-medium capitalize">
                                {order.orderType?.replace('_', ' ') || order.order_type?.replace('_', ' ')}
                              </span>
                              {order.safetyOrderLevel && (
                                <span className="text-xs text-crypto-light">Level {order.safetyOrderLevel || order.safety_order_level}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-sm font-medium ${
                              order.side === 'BUY' ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {order.side}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-white font-mono">
                            ${parseFloat(order.price || '0').toFixed(3)}
                          </td>
                          <td className="py-3 px-4 text-white font-mono">
                            {parseFloat(order.quantity || '0').toFixed(3)}
                          </td>
                          <td className="py-3 px-4 text-white font-mono">
                            {order.filledQuantity ? parseFloat(order.filledQuantity).toFixed(3) : '0.000'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              order.status === 'placed' || order.status === 'filled' ? 'bg-green-500/10 text-green-400' :
                              order.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                              order.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                              'bg-gray-500/10 text-gray-400'
                            }`}>
                              {order.status || 'unknown'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-crypto-light font-mono text-xs">
                            {order.exchangeOrderId || order.exchange_order_id || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-crypto-light text-xs">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 
                             order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card className="bg-crypto-darker border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Orders History (Filled)</CardTitle>
              <p className="text-sm text-crypto-light">Completed trades and filled orders for this bot</p>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="text-center py-8">
                  <div className="text-crypto-light">Loading orders...</div>
                </div>
              ) : botOrders.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-crypto-light mb-4">Bot Status: {botData.status?.toUpperCase() || 'INACTIVE'}</div>
                  {!botData.isActive ? (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 max-w-md mx-auto">
                      <div className="text-blue-400 font-medium mb-2">Ready to Start Trading</div>
                      <div className="text-crypto-light text-sm">
                        Click "Start Bot" to begin automated Martingale trading on {botData.tradingPair}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 max-w-md mx-auto">
                      <div className="text-yellow-400 font-medium mb-2">Waiting for Market Conditions</div>
                      <div className="text-crypto-light text-sm">
                        Bot is active and monitoring {botData.tradingPair} for entry opportunities
                      </div>
                    </div>
                  )}
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