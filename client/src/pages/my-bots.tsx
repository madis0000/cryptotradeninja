import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, TrendingUp, TrendingDown, Calendar, Target, RefreshCw, Activity, DollarSign, Play, Square, History, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
import { useMarketData } from "@/hooks/useMarketData";
import { useUserWebSocket } from "@/hooks/useWebSocketService";
import { audioService } from "@/services/audioService";
import { BotDetailsPage } from "./bot-details";
import { format } from 'date-fns';

export function MyBotsPage() {
  const [activeTab, setActiveTab] = useState('running');
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize order notifications and market data
  const { playTestNotification } = useOrderNotifications();
  const marketData = useMarketData();

  // Fetch user settings for audio notifications
  const { data: settings } = useQuery({
    queryKey: ['/api/settings'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // WebSocket connection for audio notifications
  useUserWebSocket({
    onMessage: async (message) => {
      console.log('[AUDIO] WebSocket message received:', message);
      
      // Handle order fill notifications
      if (message.type === 'order_notification') {
        console.log('[AUDIO] Order notification detected:', message.data);
        
        if (message.data?.status === 'filled') {
          console.log('[AUDIO] Order filled detected:', message.data);
          
          if (!settings) {
            console.log('[AUDIO] Settings not loaded yet, skipping notification');
            return;
          }
          
          const data = message.data;
          
          console.log('[AUDIO] Processing order fill notification:', data);
          
          // Determine order type based on the order data
          let orderType: 'take_profit' | 'safety_order' | 'base_order' = 'safety_order';
          
          if (data.side === 'SELL') {
            orderType = 'take_profit';
          } else if (data.orderType === 'base_order') {
            orderType = 'base_order';
          } else {
            orderType = 'safety_order';
          }

          console.log(`[AUDIO] Playing ${orderType} notification sound for order ${data.orderId}`);
          console.log('[AUDIO] Using settings:', settings);
          
          try {
            // Play notification sound
            await audioService.playOrderFillNotification(orderType, settings);
            console.log(`[AUDIO] Successfully played ${orderType} notification`);
          } catch (error) {
            console.error('[AUDIO] Failed to play notification:', error);
          }
        } else {
          console.log(`[AUDIO] Order status is ${message.data?.status}, not filled`);
        }
      } else {
        console.log(`[AUDIO] Message type is ${message.type}, not order_notification`);
      }
    }
  });

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
      return Math.max(0.042, diffInDays); // Minimum 1 hour (1/24 day) to avoid division by zero
    } catch {
      return 0.042; // 1 hour in days
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

  // Fetch bot statistics
  const { data: botStats = [] } = useQuery({
    queryKey: ['/api/bot-stats']
  });

  // Fetch cycle profits for display
  const { data: cycleProfits = [] } = useQuery({
    queryKey: ['/api/cycle-profits']
  });

  // Fetch bot cycles for active bots to get current average prices
  const activeBotIds = bots.filter(bot => bot.status === 'active').map(bot => bot.id);
  const { data: botCycles = [], isLoading: cyclesLoading, refetch: refetchCycles } = useQuery({
    queryKey: ['/api/bot-cycles', activeBotIds],
    queryFn: async () => {
      if (activeBotIds.length === 0) return [];
      // Use authenticated fetch for each bot's cycles
      const results = await Promise.all(
        activeBotIds.map(botId => 
          fetch(`/api/bot-cycles/${botId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json'
            }
          }).then(res => res.json())
        )
      );
      return results.flat();
    },
    enabled: activeBotIds.length > 0,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
    refetchIntervalInBackground: true
  });

  // Utility functions for calculations
  const getBotData = (botId: number) => {
    return bots.find(b => b.id === botId) || {};
  };

  const getBotStats = (botId: number) => {
    return botStats.find(stats => stats.botId === botId) || { completedCycles: 0, totalPnL: 0, totalInvested: 0 };
  };

  const getCompletedCycles = (bot: any) => {
    const stats = getBotStats(bot.id);
    return stats.completedCycles;
  };

  const getTotalPnL = (bot: any) => {
    const stats = getBotStats(bot.id);
    return stats.totalPnL;
  };

  const getTotalInvested = (bot: any) => {
    const stats = getBotStats(bot.id);
    return stats.totalInvested;
  };



  const calculateDailyPnL = (bot: any) => {
    const totalPnL = getTotalPnL(bot);
    const ageInDays = getBotAge(bot.createdAt);
    return totalPnL / ageInDays;
  };

  const calculateUnrealizedPnL = (bot: any) => {
    if (!bot.id || bot.status !== 'active') {
      return 0;
    }
    
    const symbolData = marketData.getSymbolData(bot.tradingPair);
    const currentPrice = parseFloat(symbolData?.price || '0');
    if (!currentPrice || currentPrice <= 0) {
      return 0;
    }
    
    // Find the active cycle for this bot
    const activeCycle = botCycles.find(cycle => cycle.botId === bot.id && cycle.status === 'active');
    if (!activeCycle) {
      return 0;
    }
    
    // Get current average price and total quantity from the cycle
    const averageEntryPrice = parseFloat(activeCycle.currentAveragePrice || '0');
    const totalQuantity = parseFloat(activeCycle.totalQuantity || '0');
    
    if (averageEntryPrice <= 0 || totalQuantity <= 0) {
      return 0;
    }
    
    // Calculate unrealized P&L: (current_price - average_entry_price) * total_quantity
    const unrealizedPnL = (currentPrice - averageEntryPrice) * totalQuantity;
    
    return unrealizedPnL;
  };

  const calculateUnrealizedDailyPnL = (bot: any) => {
    const unrealizedPnL = calculateUnrealizedPnL(bot);
    const ageInDays = getBotAge(bot.createdAt);
    return unrealizedPnL / ageInDays;
  };

  // Helper function to calculate average daily P&L from completed cycles only
  const calculateAverageDailyPnL = (bot: any) => {
    const completedCycles = getCompletedCycles(bot);
    if (completedCycles === 0) return 0;
    
    const totalPnL = getTotalPnL(bot);
    const ageInDays = getBotAge(bot.createdAt);
    return totalPnL / ageInDays;
  };

  // Format age display
  const formatAge = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h`;
    } else {
      return `${diffHours}h`;
    }
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

  const renderBotCard = (bot: any, isActive: boolean = true) => {
    const detailedBot = getBotData(bot.id);
    const unrealizedPnL = calculateUnrealizedPnL(detailedBot);
    const completedCycles = getCompletedCycles(detailedBot);
    const totalPnL = getTotalPnL(detailedBot);
    const totalInvested = getTotalInvested(detailedBot);
    const dailyPnL = calculateDailyPnL(detailedBot);
    const unrealizedDailyPnL = calculateUnrealizedDailyPnL(detailedBot);

    return (
      <Card 
        key={bot.id} 
        className={`bg-gradient-to-br ${
          isActive 
            ? 'from-crypto-darker to-gray-900/50 border-gray-800/50 hover:border-green-500/30 hover:shadow-green-500/10' 
            : 'from-gray-900/80 to-gray-800/30 border-gray-700/50 hover:border-gray-600/50 hover:shadow-gray-500/5 opacity-90'
        } border transition-all duration-300 hover:shadow-lg group`}
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className={`text-lg font-semibold mb-1 transition-colors ${
                isActive ? 'text-white group-hover:text-green-400' : 'text-gray-300 group-hover:text-white'
              }`}>
                {bot.name}
              </CardTitle>
              <div className="flex items-center space-x-2 text-sm">
                <span className={`font-mono font-medium ${isActive ? 'text-crypto-primary' : 'text-gray-400'}`}>
                  {bot.tradingPair}
                </span>
                <span className={isActive ? 'text-gray-500' : 'text-gray-600'}>•</span>
                <Badge variant="outline" className={`text-xs ${
                  isActive 
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                    : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                }`}>
                  {bot.strategy}
                </Badge>
                <Badge variant="outline" className={`text-xs ${
                  bot.direction === 'long' 
                    ? isActive 
                      ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                      : 'bg-green-500/5 text-green-500/70 border-green-500/10'
                    : isActive 
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-red-500/5 text-red-500/70 border-red-500/10'
                }`}>
                  {bot.direction.toUpperCase()}
                </Badge>
              </div>
            </div>
            <Badge className={`${
              isActive 
                ? 'bg-green-500/15 text-green-400 border-green-500/30 shadow-lg' 
                : 'bg-gray-500/15 text-gray-400 border-gray-500/30'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-2 ${
                isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
              }`}></div>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          
          {/* Performance Metrics */}
          <div className={`grid grid-cols-2 gap-4 mt-4 p-3 rounded-lg border ${
            isActive ? 'bg-gray-800/30 border-gray-700/50' : 'bg-gray-700/20 border-gray-600/30'
          }`}>
            <div className="text-center">
              <div className={`text-lg font-bold font-mono ${
                totalPnL >= 0 
                  ? isActive ? 'text-green-400' : 'text-green-400/80' 
                  : isActive ? 'text-red-400' : 'text-red-400/80'
              }`}>
                {totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}
              </div>
              <div className={`text-xs flex items-center justify-center ${
                isActive ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {totalPnL >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                Total P&L
              </div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold font-mono ${
                unrealizedPnL > 0 
                  ? isActive ? 'text-green-400' : 'text-green-400/60'
                  : unrealizedPnL < 0 
                    ? isActive ? 'text-red-400' : 'text-red-400/60'
                    : isActive ? 'text-gray-400' : 'text-gray-400/60'
              }`}>
                {unrealizedPnL > 0 ? '+' : ''}${formatCurrency(unrealizedPnL)}
              </div>
              <div className={`text-xs flex items-center justify-center ${
                isActive ? 'text-gray-400' : 'text-gray-500'
              }`}>
                <Target className="w-3 h-3 mr-1" />
                Unrealized P&L
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className={`text-center p-2 rounded border ${
              isActive ? 'bg-gray-800/20 border-gray-700/30' : 'bg-gray-700/15 border-gray-600/20'
            }`}>
              <div className={`font-mono font-semibold ${
                isActive ? 'text-crypto-primary' : 'text-gray-400'
              }`}>
                {formatAge(bot.createdAt)}
              </div>
              <div className={`flex items-center justify-center mt-1 ${
                isActive ? 'text-gray-400' : 'text-gray-500'
              }`}>
                <Clock className="w-3 h-3 mr-1" />
                Age
              </div>
            </div>
            <div className={`text-center p-2 rounded border ${
              isActive ? 'bg-gray-800/20 border-gray-700/30' : 'bg-gray-700/15 border-gray-600/20'
            }`}>
              <div className={`font-mono font-semibold ${
                isActive ? 'text-crypto-primary' : 'text-gray-400'
              }`}>
                {completedCycles}
              </div>
              <div className={`flex items-center justify-center mt-1 ${
                isActive ? 'text-gray-400' : 'text-gray-500'
              }`}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Cycles
              </div>
            </div>
          </div>

          {/* P&L Metrics */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className={`text-center p-2 rounded border ${
              isActive ? 'bg-gray-800/20 border-gray-700/30' : 'bg-gray-700/15 border-gray-600/20'
            }`}>
              <div className={`font-mono font-semibold ${
                unrealizedPnL > 0 
                  ? isActive ? 'text-green-400' : 'text-green-400/60'
                  : unrealizedPnL < 0 
                    ? isActive ? 'text-red-400' : 'text-red-400/60'
                    : isActive ? 'text-gray-400' : 'text-gray-400/60'
              }`}>
                {unrealizedPnL > 0 ? '+' : ''}${formatCurrency(unrealizedPnL)}
              </div>
              <div className={`flex items-center justify-center mt-1 ${
                isActive ? 'text-gray-400' : 'text-gray-500'
              }`}>
                <Target className="w-3 h-3 mr-1" />
                Unrealized
              </div>
            </div>
            <div className={`text-center p-2 rounded border ${
              isActive ? 'bg-gray-800/20 border-gray-700/30' : 'bg-gray-700/15 border-gray-600/20'
            }`}>
              <div className={`font-mono font-semibold ${
                calculateAverageDailyPnL(bot) > 0 
                  ? isActive ? 'text-green-400' : 'text-green-400/60'
                  : calculateAverageDailyPnL(bot) < 0 
                    ? isActive ? 'text-red-400' : 'text-red-400/60'
                    : isActive ? 'text-gray-400' : 'text-gray-400/60'
              }`}>
                {calculateAverageDailyPnL(bot) > 0 ? '+' : ''}${formatCurrency(calculateAverageDailyPnL(bot))}
              </div>
              <div className={`flex items-center justify-center mt-1 ${
                isActive ? 'text-gray-400' : 'text-gray-500'
              }`}>
                <TrendingUp className="w-3 h-3 mr-1" />
                Daily Avg
              </div>
            </div>
          </div>

          {/* Trading Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className={`text-center p-2 rounded border ${
              isActive ? 'bg-gray-800/20 border-gray-700/30' : 'bg-gray-700/15 border-gray-600/20'
            }`}>
              <div className={`font-mono font-semibold ${
                isActive ? 'text-white' : 'text-gray-300'
              }`}>
                ${formatCurrency(detailedBot.baseOrderAmount)}
              </div>
              <div className={isActive ? 'text-gray-400' : 'text-gray-500'}>
                Base
              </div>
            </div>
          </div>

          {/* Bot Details */}
          <div className={`space-y-2 text-xs border-t pt-3 ${
            isActive ? 'border-gray-700/50' : 'border-gray-600/30'
          }`}>
            <div className="flex justify-between">
              <span className={isActive ? 'text-gray-400' : 'text-gray-500'}>
                Daily P&L:
              </span>
              <span className={`font-mono ${
                dailyPnL >= 0 
                  ? isActive ? 'text-green-400' : 'text-green-400/80'
                  : isActive ? 'text-red-400' : 'text-red-400/80'
              }`}>
                {dailyPnL >= 0 ? '+' : ''}${formatCurrency(dailyPnL)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={isActive ? 'text-gray-400' : 'text-gray-500'}>
                Unrealized P&L:
              </span>
              <span className={`font-mono ${
                unrealizedPnL >= 0 
                  ? isActive ? 'text-green-400' : 'text-green-400/80'
                  : isActive ? 'text-red-400' : 'text-red-400/80'
              }`}>
                {unrealizedPnL >= 0 ? '+' : ''}${formatCurrency(unrealizedPnL)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={isActive ? 'text-gray-400' : 'text-gray-500'}>
                Age:
              </span>
              <span className={`font-mono ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                {formatBotAge(bot.createdAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={isActive ? 'text-gray-400' : 'text-gray-500'}>
                Current Price:
              </span>
              <span className={`font-mono ${isActive ? 'text-crypto-primary' : 'text-gray-400'}`}>
                ${marketData.getSymbolData(bot.tradingPair)?.price || '0.00'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2 pt-2">
            <Button
              onClick={() => setSelectedBot(bot)}
              variant="outline"
              size="sm"
              className={`flex-1 ${
                isActive 
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white' 
                  : 'border-gray-600/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
              }`}
            >
              View Details
            </Button>
            {isActive && (
              <Button
                onClick={() => stopBotMutation.mutate(bot.id)}
                variant="outline"
                size="sm"
                disabled={stopBotMutation.isPending}
                className="border-yellow-600 text-yellow-400 hover:bg-yellow-600 hover:text-white"
              >
                <Square className="h-4 w-4" />
              </Button>
            )}
            <Button
              onClick={() => deleteBotMutation.mutate(bot.id)}
              variant="outline"
              size="sm"
              disabled={deleteBotMutation.isPending}
              className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

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
                        cycleProfits.reduce((sum: number, cycle) => sum + (cycle.cycleProfit || 0), 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {cycleProfits.reduce((sum: number, cycle) => sum + (cycle.cycleProfit || 0), 0) >= 0 ? '+' : ''}$
                        {formatCurrency(cycleProfits.reduce((sum: number, cycle) => sum + (cycle.cycleProfit || 0), 0))}
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
                      <p className="text-lg font-bold font-mono text-crypto-primary">
                        {activeBots.length}
                      </p>
                    </div>
                    <Activity className="w-8 h-8 text-blue-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-crypto-darker to-gray-900/50 border border-gray-800/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Completed Cycles</p>
                      <p className="text-lg font-bold font-mono text-purple-400">
                        {cycleProfits.length}
                      </p>
                    </div>
                    <RefreshCw className="w-8 h-8 text-purple-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bot Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-crypto-darker border border-gray-700">
                <TabsTrigger 
                  value="running" 
                  className="data-[state=active]:bg-crypto-primary data-[state=active]:text-white text-gray-400 flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Running Bots ({activeBots.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="history" 
                  className="data-[state=active]:bg-crypto-primary data-[state=active]:text-white text-gray-400 flex items-center gap-2"
                >
                  <History className="w-4 h-4" />
                  History ({inactiveBots.length})
                </TabsTrigger>
              </TabsList>

              {/* Running Bots Tab */}
              <TabsContent value="running" className="space-y-4 mt-6">
                <h2 className="text-xl font-semibold text-white">Running Trading Bots</h2>
                {botsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">Loading bots...</div>
                  </div>
                ) : activeBots.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">No running bots found</div>
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {activeBots.map((bot: any) => renderBotCard(bot, true))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* History Bots Tab */}
              <TabsContent value="history" className="space-y-4 mt-6">
                <h2 className="text-xl font-semibold text-white">Bot History</h2>
                {botsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">Loading bots...</div>
                  </div>
                ) : inactiveBots.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">No inactive bots found</div>
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {inactiveBots.map((bot: any) => renderBotCard(bot, false))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}