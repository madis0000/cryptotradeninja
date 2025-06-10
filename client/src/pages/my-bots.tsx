import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Trash2, TrendingUp, TrendingDown, Calendar, Target, RefreshCw, Activity, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
import { useMarketData } from "@/hooks/useMarketData";
import { BotDetailsPage } from "./bot-details";
import { format } from 'date-fns';

export function MyBotsPage() {
  const [activeSection, setActiveSection] = useState('active-bots');
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize order notifications and market data
  useOrderNotifications();
  const marketData = useMarketData();

  // Utility functions for bot data calculations
  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return 'Unknown';
    }
  };

  const getBotAge = (createdAt: string) => {
    try {
      const created = new Date(createdAt);
      const now = new Date();
      const diffInMs = now.getTime() - created.getTime();
      const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
      return Math.max(1, diffInDays); // Minimum 1 day to avoid division by zero
    } catch {
      return 1;
    }
  };

  const formatBotAge = (createdAt: string) => {
    try {
      const created = new Date(createdAt);
      const now = new Date();
      const diffInMs = now.getTime() - created.getTime();
      
      const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffInMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffInMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffInMs % (1000 * 60)) / 1000);
      
      return `Days:${days} - ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } catch {
      return 'Days:0 - 00:00:00';
    }
  };

  // Fetch bots data (event-driven updates only)
  const { data: bots = [], isLoading: botsLoading } = useQuery<any[]>({
    queryKey: ['/api/bots']
  });

  // Utility functions for calculations
  const getBotData = (botId: number) => {
    return bots.find(b => b.id === botId) || {};
  };

  const getCompletedCycles = (bot: any) => {
    return bot.totalTrades || 0;
  };

  const calculateDailyPnL = (bot: any) => {
    const totalPnL = parseFloat(bot.totalPnl || '0');
    const ageInDays = getBotAge(bot.createdAt);
    return totalPnL / ageInDays;
  };

  // Fetch bot orders for accurate position calculation
  const { data: allBotOrders = {} } = useQuery({
    queryKey: ['/api/all-bot-orders'],
    queryFn: async () => {
      const ordersData: Record<number, any[]> = {};
      for (const bot of bots) {
        try {
          const response = await fetch(`/api/bot-orders/${bot.id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (response.ok) {
            ordersData[bot.id] = await response.json();
          }
        } catch (error) {
          console.error(`Failed to fetch orders for bot ${bot.id}:`, error);
        }
      }
      return ordersData;
    },
    enabled: bots.length > 0,
    refetchInterval: 30000 // Refetch every 30 seconds for fresh data
  });

  // Dynamic Unrealized P&L calculation using database cycle data + live prices
  const calculateUnrealizedPnL = (bot: any) => {
    // Get current market price for the bot's trading pair
    const currentMarketData = marketData.getSymbolData(bot.tradingPair);
    if (!currentMarketData) return 0;
    
    const currentPrice = parseFloat(currentMarketData.price || '0');
    if (currentPrice === 0) return 0;

    // Get bot orders from database to calculate actual position
    const botOrders = allBotOrders[bot.id] || [];
    // Filter filled buy orders from CURRENT ACTIVE CYCLE only (not completed cycles)
    const activeCycleOrders = botOrders.filter((order: any) => 
      order.side === 'BUY' && 
      order.status === 'filled' && 
      !order.completedAt // Only orders from current active cycle
    );
    
    if (activeCycleOrders.length === 0) {
      return 0;
    }
    
    // Calculate actual position from current active cycle filled orders only
    const totalPositionSize = activeCycleOrders.reduce((total: number, order: any) => {
      return total + parseFloat(order.filledQuantity || order.quantity || '0');
    }, 0);
    
    const totalInvested = activeCycleOrders.reduce((total: number, order: any) => {
      const price = parseFloat(order.filledPrice || order.price || '0');
      const qty = parseFloat(order.filledQuantity || order.quantity || '0');
      return total + (price * qty);
    }, 0);
    
    if (totalPositionSize === 0 || totalInvested === 0) return 0;
    
    // Calculate average entry price from actual filled orders
    const averageEntryPrice = totalInvested / totalPositionSize;
    
    // Real-time unrealized P&L: (current_price - avg_entry_price) × position_size
    const unrealizedPnL = (currentPrice - averageEntryPrice) * totalPositionSize;
    
    // Log P&L updates for active positions only
    if (unrealizedPnL !== 0) {
      console.log(`[P&L] ${bot.tradingPair}: $${unrealizedPnL.toFixed(4)}`);
    }
    
    return unrealizedPnL;
  };

  const calculateUnrealizedDailyPnL = (bot: any) => {
    const unrealizedPnL = calculateUnrealizedPnL(bot);
    const ageInDays = getBotAge(bot.createdAt);
    return unrealizedPnL / ageInDays;
  };

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

            {/* Portfolio Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-gradient-to-br from-crypto-darker to-gray-900/50 border border-gray-800/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Total Unrealized P&L</p>
                      <p className={`text-lg font-bold font-mono ${
                        activeBots.reduce((sum, bot) => sum + calculateUnrealizedPnL(getBotData(bot.id)), 0) > 0 
                          ? 'text-green-400' 
                          : activeBots.reduce((sum, bot) => sum + calculateUnrealizedPnL(getBotData(bot.id)), 0) < 0 
                          ? 'text-red-400' 
                          : 'text-gray-400'
                      }`}>
                        {activeBots.reduce((sum, bot) => sum + calculateUnrealizedPnL(getBotData(bot.id)), 0) > 0 ? '+' : ''}$
                        {formatCurrency(activeBots.reduce((sum, bot) => sum + calculateUnrealizedPnL(getBotData(bot.id)), 0))}
                      </p>
                    </div>
                    <Target className="w-8 h-8 text-yellow-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-crypto-darker to-gray-900/50 border border-gray-800/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Total Realized P&L</p>
                      <p className={`text-lg font-bold font-mono ${
                        bots.reduce((sum, bot) => sum + parseFloat(bot.totalPnl || '0'), 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {bots.reduce((sum, bot) => sum + parseFloat(bot.totalPnl || '0'), 0) >= 0 ? '+' : ''}$
                        {formatCurrency(bots.reduce((sum, bot) => sum + parseFloat(bot.totalPnl || '0'), 0))}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-green-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-crypto-darker to-gray-900/50 border border-gray-800/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Active Bots</p>
                      <p className="text-lg font-bold text-white">{activeBots.length}</p>
                    </div>
                    <RefreshCw className="w-8 h-8 text-blue-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-crypto-darker to-gray-900/50 border border-gray-800/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Total Invested</p>
                      <p className="text-lg font-bold text-purple-400">
                        ${formatCurrency(bots.reduce((sum, bot) => sum + parseFloat(bot.totalInvested || '0'), 0))}
                      </p>
                    </div>
                    <Target className="w-8 h-8 text-purple-400" />
                  </div>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {activeBots.map((bot: any) => {
                      const detailedBot = getBotData(bot.id);
                      const unrealizedPnL = calculateUnrealizedPnL(detailedBot);
                      const completedCycles = getCompletedCycles(detailedBot);
                      const totalPnL = parseFloat(detailedBot.totalPnl || '0');
                      const totalInvested = parseFloat(detailedBot.totalInvested || '0');
                      const dailyPnL = calculateDailyPnL(detailedBot);
                      const unrealizedDailyPnL = calculateUnrealizedDailyPnL(detailedBot);
                      
                      return (
                        <Card key={bot.id} className="bg-gradient-to-br from-crypto-darker to-gray-900/50 border border-gray-800/50 hover:border-green-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10 group">
                          <CardHeader className="pb-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-white text-lg font-semibold mb-1 group-hover:text-green-400 transition-colors">
                                  {bot.name}
                                </CardTitle>
                                <div className="flex items-center space-x-2 text-sm">
                                  <span className="text-crypto-primary font-mono font-medium">{bot.tradingPair}</span>
                                  <span className="text-gray-500">•</span>
                                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
                                    {bot.strategy}
                                  </Badge>
                                  <Badge variant="outline" className={`text-xs ${
                                    bot.direction === 'long' 
                                      ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                                  }`}>
                                    {bot.direction.toUpperCase()}
                                  </Badge>
                                </div>
                              </div>
                              <Badge className="bg-green-500/15 text-green-400 border-green-500/30 shadow-lg">
                                <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                                Active
                              </Badge>
                            </div>
                            
                            {/* Performance Metrics */}
                            <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                              <div className="text-center">
                                <div className={`text-lg font-bold font-mono ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}
                                </div>
                                <div className="text-xs text-gray-400 flex items-center justify-center">
                                  {totalPnL >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                  Total P&L
                                </div>
                              </div>
                              <div className="text-center">
                                <div className={`text-lg font-bold font-mono ${unrealizedPnL > 0 ? 'text-green-400' : unrealizedPnL < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                  {unrealizedPnL > 0 ? '+' : ''}${formatCurrency(unrealizedPnL)}
                                </div>
                                <div className="text-xs text-gray-400 flex items-center justify-center">
                                  <Target className="w-3 h-3 mr-1" />
                                  Unrealized P&L
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          
                          <CardContent className="space-y-4">
                            {/* Key Metrics */}
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div className="text-center p-2 bg-gray-800/20 rounded border border-gray-700/30">
                                <div className="text-crypto-primary font-mono font-semibold">{completedCycles}</div>
                                <div className="text-gray-400 flex items-center justify-center mt-1">
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Cycles
                                </div>
                              </div>
                              <div className="text-center p-2 bg-gray-800/20 rounded border border-gray-700/30">
                                <div className="text-white font-mono font-semibold">${formatCurrency(totalInvested)}</div>
                                <div className="text-gray-400">Invested</div>
                              </div>
                              <div className="text-center p-2 bg-gray-800/20 rounded border border-gray-700/30">
                                <div className="text-white font-mono font-semibold">${formatCurrency(detailedBot.baseOrderAmount || '0')}</div>
                                <div className="text-gray-400">Base</div>
                              </div>
                            </div>
                            
                            {/* Bot Configuration */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <span className="text-gray-400">Safety Amount:</span>
                                <div className="text-white font-mono">${formatCurrency(detailedBot.safetyOrderAmount)}</div>
                              </div>
                              <div>
                                <span className="text-gray-400">Max Safety Orders:</span>
                                <div className="text-white font-medium">{detailedBot.maxSafetyOrders}</div>
                              </div>
                              <div>
                                <span className="text-gray-400">Price Deviation:</span>
                                <div className="text-white font-medium">{formatCurrency(detailedBot.priceDeviation)}%</div>
                              </div>
                              <div>
                                <span className="text-gray-400">Daily P&L:</span>
                                <div className={`font-mono font-medium ${dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {dailyPnL >= 0 ? '+' : ''}${formatCurrency(dailyPnL)}
                                </div>
                              </div>
                            </div>
                            
                            {/* Created Date and Bot Age */}
                            <div className="border-t border-gray-700/50 pt-3 space-y-1">
                              <div className="flex items-center text-xs text-gray-500">
                                <Calendar className="w-3 h-3 mr-2" />
                                Created: {formatDateTime(detailedBot.createdAt)}
                              </div>
                              <div className="text-xs text-green-400 font-mono">
                                Age: {formatBotAge(detailedBot.createdAt)}
                              </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex items-center space-x-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedBot(bot)}
                                className="flex-1 text-crypto-light border-gray-600 hover:bg-crypto-primary/10 hover:border-crypto-primary hover:text-crypto-primary transition-all"
                              >
                                View Details
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => stopBotMutation.mutate(bot.id)}
                                disabled={stopBotMutation.isPending}
                                className="text-yellow-400 border-yellow-600/50 hover:bg-yellow-600/10 hover:border-yellow-500"
                              >
                                Stop
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteBotMutation.mutate(bot.id)}
                                disabled={deleteBotMutation.isPending}
                                className="text-red-400 border-red-600/50 hover:bg-red-600/10 hover:border-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {inactiveBots.map((bot: any) => {
                      const detailedBot = getBotData(bot.id);
                      const unrealizedPnL = calculateUnrealizedPnL(detailedBot);
                      const completedCycles = getCompletedCycles(detailedBot);
                      const totalPnL = parseFloat(detailedBot.totalPnl || '0');
                      const totalInvested = parseFloat(detailedBot.totalInvested || '0');
                      const dailyPnL = calculateDailyPnL(detailedBot);
                      const unrealizedDailyPnL = calculateUnrealizedDailyPnL(detailedBot);
                      
                      return (
                        <Card key={bot.id} className="bg-gradient-to-br from-gray-900/80 to-gray-800/30 border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-gray-500/5 group opacity-90">
                          <CardHeader className="pb-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-gray-300 text-lg font-semibold mb-1 group-hover:text-white transition-colors">
                                  {bot.name}
                                </CardTitle>
                                <div className="flex items-center space-x-2 text-sm">
                                  <span className="text-gray-400 font-mono font-medium">{bot.tradingPair}</span>
                                  <span className="text-gray-600">•</span>
                                  <Badge variant="outline" className="text-xs bg-gray-500/10 text-gray-400 border-gray-500/20">
                                    {bot.strategy}
                                  </Badge>
                                  <Badge variant="outline" className={`text-xs ${
                                    bot.direction === 'long' 
                                      ? 'bg-green-500/5 text-green-500/70 border-green-500/10' 
                                      : 'bg-red-500/5 text-red-500/70 border-red-500/10'
                                  }`}>
                                    {bot.direction.toUpperCase()}
                                  </Badge>
                                </div>
                              </div>
                              <Badge className="bg-gray-500/15 text-gray-400 border-gray-500/30">
                                <div className="w-2 h-2 bg-gray-500 rounded-full mr-2"></div>
                                Inactive
                              </Badge>
                            </div>
                            
                            {/* Performance Metrics */}
                            <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-gray-700/20 rounded-lg border border-gray-600/30">
                              <div className="text-center">
                                <div className={`text-lg font-bold font-mono ${totalPnL >= 0 ? 'text-green-400/80' : 'text-red-400/80'}`}>
                                  {totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center justify-center">
                                  {totalPnL >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                  Total P&L
                                </div>
                              </div>
                              <div className="text-center">
                                <div className={`text-lg font-bold font-mono ${unrealizedPnL > 0 ? 'text-green-400/60' : unrealizedPnL < 0 ? 'text-red-400/60' : 'text-gray-400/60'}`}>
                                  {unrealizedPnL > 0 ? '+' : ''}${formatCurrency(unrealizedPnL)}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center justify-center">
                                  <Target className="w-3 h-3 mr-1" />
                                  Unrealized P&L
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          
                          <CardContent className="space-y-4">
                            {/* Key Metrics */}
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div className="text-center p-2 bg-gray-700/15 rounded border border-gray-600/20">
                                <div className="text-gray-400 font-mono font-semibold">{completedCycles}</div>
                                <div className="text-gray-500 flex items-center justify-center mt-1">
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Cycles
                                </div>
                              </div>
                              <div className="text-center p-2 bg-gray-700/15 rounded border border-gray-600/20">
                                <div className="text-gray-300 font-mono font-semibold">${formatCurrency(totalInvested)}</div>
                                <div className="text-gray-500">Invested</div>
                              </div>
                              <div className="text-center p-2 bg-gray-700/15 rounded border border-gray-600/20">
                                <div className="text-gray-300 font-mono font-semibold">${formatCurrency(detailedBot.baseOrderAmount)}</div>
                                <div className="text-gray-500">Base</div>
                              </div>
                            </div>
                            
                            {/* Bot Configuration */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <span className="text-gray-500">Safety Amount:</span>
                                <div className="text-gray-300 font-mono">${formatCurrency(detailedBot.safetyOrderAmount)}</div>
                              </div>
                              <div>
                                <span className="text-gray-500">Max Safety Orders:</span>
                                <div className="text-gray-300 font-medium">{detailedBot.maxSafetyOrders}</div>
                              </div>
                              <div>
                                <span className="text-gray-500">Price Deviation:</span>
                                <div className="text-gray-300 font-medium">{formatCurrency(detailedBot.priceDeviation)}%</div>
                              </div>
                              <div>
                                <span className="text-gray-500">Daily P&L:</span>
                                <div className={`font-mono font-medium ${dailyPnL >= 0 ? 'text-green-400/80' : 'text-red-400/80'}`}>
                                  {dailyPnL >= 0 ? '+' : ''}${formatCurrency(dailyPnL)}
                                </div>
                              </div>
                            </div>
                            
                            {/* Created Date and Bot Age */}
                            <div className="border-t border-gray-600/30 pt-3 space-y-1">
                              <div className="flex items-center text-xs text-gray-600">
                                <Calendar className="w-3 h-3 mr-2" />
                                Created: {formatDateTime(detailedBot.createdAt)}
                              </div>
                              <div className="text-xs text-gray-400 font-mono">
                                Age: {formatBotAge(detailedBot.createdAt)}
                              </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex items-center space-x-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedBot(bot)}
                                className="flex-1 text-gray-400 border-gray-600/50 hover:bg-gray-700/20 hover:border-gray-500 hover:text-gray-300 transition-all"
                              >
                                View Details
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteBotMutation.mutate(bot.id)}
                                disabled={deleteBotMutation.isPending}
                                className="text-red-400/80 border-red-600/30 hover:bg-red-600/10 hover:border-red-500/50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
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