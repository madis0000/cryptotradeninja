import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Play, Square, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { useMarketData } from '@/hooks/useMarketData';
import { useBotUpdates } from '@/hooks/useBotUpdates';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BotDetailsProps {
  bot: any;
  onBack: () => void;
}

export function BotDetailsPage({ bot, onBack }: BotDetailsProps) {
  const [activeSection, setActiveSection] = useState('current-cycle');
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
    const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Initialize bot updates (status, data, cycle, stats)
  useBotUpdates();
  // Stop bot mutation
  const stopBotMutation = useMutation({
    mutationFn: async (botId: number) => {
      return await apiRequest(`/api/bots/${botId}/stop`, 'POST');
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bots', bot.id] });
      
      const message = data?.message || "Trading bot has been stopped and safety orders cancelled.";
      const details = [];
      if (data?.cancelledOrders > 0) details.push(`${data.cancelledOrders} orders cancelled`);
      if (data?.liquidated) details.push('position liquidated');
      
      toast({
        title: "Bot Stopped",
        description: details.length > 0 ? `${message} (${details.join(', ')})` : message,
      });
      setShowStopDialog(false);
    },    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to stop bot";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    }
  });

  // Delete bot mutation
  const deleteBotMutation = useMutation({
    mutationFn: async (botId: number) => {
      return await apiRequest(`/api/bots/${botId}`, 'DELETE');
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      
      const message = data?.message || "Trading bot has been permanently deleted.";
      const details = [];
      if (data?.cancelledOrders > 0) details.push(`${data.cancelledOrders} orders cancelled`);
      if (data?.liquidated) details.push('position liquidated');
      
      toast({
        title: "Bot Deleted",
        description: details.length > 0 ? `${message} (${details.join(', ')})` : message,
      });
      setShowDeleteDialog(false);
      onBack(); // Navigate back to bots list
    },    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete bot";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    }
  });

  const handleStopBot = () => {
    setIsProcessing(true);
    stopBotMutation.mutate(bot.id);
  };

  const handleDeleteBot = () => {
    setIsProcessing(true);
    deleteBotMutation.mutate(bot.id);
  };
  // Get real-time market data via WebSocket
  const { getSymbolData, connectToMarketData, disconnectFromMarketData } = useMarketData();
  const currentMarketData = getSymbolData(bot.tradingPair);

  // Subscribe to market data for this bot's trading pair
  useEffect(() => {
    if (bot?.tradingPair && bot?.exchangeId) {
      console.log(`[BOT DETAILS] Subscribing to market data for ${bot.tradingPair} on exchange ${bot.exchangeId}`);
      connectToMarketData([bot.tradingPair], bot.exchangeId);
    }

    return () => {
      if (bot?.tradingPair) {
        console.log(`[BOT DETAILS] Unsubscribing from market data for ${bot.tradingPair}`);
        // Note: disconnectFromMarketData affects all symbols, so we'll let the cleanup happen naturally
      }
    };
  }, [bot?.tradingPair, bot?.exchangeId, connectToMarketData]);
  // Fetch bot orders for selected bot (event-driven updates only)
  const { data: botOrders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/bot-orders', bot?.id],
    queryFn: async () => {
      if (!bot?.id) return [];
      const response = await fetch(`/api/bot-orders/${bot.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    },
    enabled: !!bot?.id,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
  // Fetch bot cycles for current cycle information
  const { data: botCycles = [] } = useQuery({
    queryKey: ['/api/bot-cycles', bot?.id],
    queryFn: async () => {
      if (!bot?.id) return [];
      const response = await fetch(`/api/bot-cycles/${bot.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch cycles');
      return response.json();
    },
    enabled: !!bot?.id,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
  // Fetch individual bot data for the selected bot
  const { data: selectedBotData } = useQuery({
    queryKey: ['/api/bots', bot?.id],
    queryFn: async () => {
      if (!bot?.id) return null;
      const response = await fetch(`/api/bots/${bot.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch bot data');
      return response.json();
    },
    enabled: !!bot?.id,
    staleTime: 60000, // Consider data fresh for 60 seconds
  });

  // Get current active cycle - prioritize active cycles, then get highest cycle number
  const currentCycle = botCycles.length > 0 
    ? (() => {
        // First try to find an active cycle
        const activeCycle = botCycles.find((cycle: any) => cycle.status === 'active');
        if (activeCycle) return activeCycle;
        
        // If no active cycle, get the latest completed cycle
        return botCycles.reduce((latest: any, cycle: any) => {
          return (!latest || cycle.cycleNumber > latest.cycleNumber) ? cycle : latest;
        }, null);
      })()
    : null;

  // Filter orders for current cycle and history
  const currentCycleOrders = botOrders.filter((order: any) => {
    if (!currentCycle) return false;
    return order.cycleId === currentCycle.id;
  });

  const historyOrders = botOrders.filter((order: any) => {
    // Show all filled orders from completed cycles
    // A cycle is completed if it has both a filled BUY and SELL order
    const isFilledOrder = order.status === 'filled';
    
    if (!isFilledOrder) return false;
    
    // Check if this order's cycle is completed by looking for both buy and sell orders
    const cycleOrders = botOrders.filter((o: any) => o.cycleId === order.cycleId && o.status === 'filled');
    const hasBuyOrder = cycleOrders.some((o: any) => o.side === 'BUY');
    const hasSellOrder = cycleOrders.some((o: any) => o.side === 'SELL');
    const isCycleCompleted = hasBuyOrder && hasSellOrder;
    
    return isCycleCompleted;
  });

  // Group history orders by cycle number with P&L calculation
  const groupedHistoryOrders = historyOrders.reduce((groups: any, order: any) => {
    const cycleNumber = order.cycleNumber || 1;
    
    if (!groups[cycleNumber]) {
      groups[cycleNumber] = {
        cycleNumber,
        orders: [],
        totalBought: 0,
        totalSold: 0,
        pnl: 0
      };
    }
    
    groups[cycleNumber].orders.push(order);
    
    // Calculate cycle P&L including trading fees
    const filledPrice = parseFloat(order.filledPrice || order.price || '0');
    const filledQty = parseFloat(order.filledQuantity || order.quantity || '0');
    const orderValue = filledPrice * filledQty;
    const fee = parseFloat(order.fee || '0');
    
    if (order.side?.toUpperCase() === 'BUY') {
      // For buy orders: cost = order value + fee (assuming fee is in quote currency like USDT)
      // If fee is in base currency (like DOGE), we'd need to convert it
      const feeInQuoteCurrency = order.feeAsset === 'USDT' || order.feeAsset === 'BUSD' ? fee : fee * filledPrice;
      groups[cycleNumber].totalBought += orderValue + feeInQuoteCurrency;
    } else if (order.side?.toUpperCase() === 'SELL') {
      // For sell orders: revenue = order value - fee (fee reduces the received amount)
      const feeInQuoteCurrency = order.feeAsset === 'USDT' || order.feeAsset === 'BUSD' ? fee : fee * filledPrice;
      groups[cycleNumber].totalSold += orderValue - feeInQuoteCurrency;
    }
    
    // Calculate net P&L after fees
    groups[cycleNumber].pnl = groups[cycleNumber].totalSold - groups[cycleNumber].totalBought;
    
    return groups;
  }, {});

  // Calculate position details first
  const filledBuyOrders = currentCycleOrders.filter(order => 
    order.side === 'BUY' && order.status === 'filled'
  );
  
  const totalPositionSize = filledBuyOrders.reduce((total, order) => {
    return total + parseFloat(order.filledQuantity || order.quantity || '0');
  }, 0);
  
  const totalInvested = filledBuyOrders.reduce((total, order) => {
    const price = parseFloat(order.filledPrice || order.price || '0');
    const qty = parseFloat(order.filledQuantity || order.quantity || '0');
    return total + (price * qty);
  }, 0);
  
  const averageEntryPrice = totalPositionSize > 0 ? totalInvested / totalPositionSize : 0;

  // Calculate pending orders that will be cancelled
  const pendingOrders = currentCycleOrders.filter(order => 
    order.status === 'placed' || order.status === 'pending'
  );
  const pendingOrdersCount = pendingOrders.length;
  const totalPendingValue = pendingOrders.reduce((total, order) => {
    const price = parseFloat(order.price || '0');
    const qty = parseFloat(order.quantity || '0');
    return total + (price * qty);
  }, 0);

  // Sort grouped cycles by cycle number (descending - newest first)
  const sortedCycleGroups = Object.entries(groupedHistoryOrders).sort(([a], [b]) => {
    const cycleA = parseInt(a as string);
    const cycleB = parseInt(b as string);
    return cycleB - cycleA;
  });

  // Calculate P&L values for header cards
  const completedCyclesTotal = Object.values(groupedHistoryOrders).reduce((total: number, cycle: any) => {
    return total + cycle.pnl;
  }, 0);

  // Calculate current cycle unrealized P&L
  const currentCycleUnrealizedPnL = averageEntryPrice > 0 && currentMarketData && totalPositionSize > 0 
    ? (parseFloat(currentMarketData.price || '0') - averageEntryPrice) * totalPositionSize 
    : 0;

  // Total unrealized P&L = completed cycles P&L + current cycle unrealized P&L
  const totalUnrealizedPnL = completedCyclesTotal + currentCycleUnrealizedPnL;

  return (
    <div className="space-y-6">
      {/* Bot Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="text-crypto-light border-gray-700 hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Bots
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">{bot.name}</h1>
            <div className="flex items-center space-x-2">
              <p className="text-crypto-light">
                {bot.tradingPair} • {bot.strategy} • {bot.direction}
              </p>
              <Badge className={`${
                bot.status === 'active' 
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
              }`}>
                {bot.status || 'inactive'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="text-right mr-4">
            <div className="text-2xl font-bold text-crypto-primary">
              ${currentMarketData?.price || '0.0000'}
            </div>
            <div className="text-sm text-crypto-light">Live Price</div>
          </div>
          <div className="flex items-center space-x-2">
            {bot.status === 'active' ? (
              <Button 
                variant="outline" 
                size="sm" 
                className="text-red-400 border-red-600 hover:bg-red-600/10"
                onClick={() => setShowStopDialog(true)}
                disabled={isProcessing}
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Bot
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="text-green-400 border-green-600 hover:bg-green-600/10">
                <Play className="h-4 w-4 mr-2" />
                Start Bot
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="text-red-400 border-red-600 hover:bg-red-600/10"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isProcessing}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Bot
            </Button>
          </div>
        </div>
      </div>

      {/* Bot Configuration Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Base Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-400">${bot.baseOrderAmount}</div>
            <p className="text-xs text-crypto-light mt-1">Initial order size</p>
          </CardContent>
        </Card>

        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Safety Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-orange-400">${bot.safetyOrderAmount}</div>
            <p className="text-xs text-crypto-light mt-1">DCA order size</p>
          </CardContent>
        </Card>

        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Max Safety Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-yellow-400">{bot.maxSafetyOrders}</div>
            <p className="text-xs text-crypto-light mt-1">DCA limit</p>
          </CardContent>
        </Card>

        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Price Deviation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-purple-400">{parseFloat(bot.priceDeviation || '0').toFixed(4)}%</div>
            <p className="text-xs text-crypto-light mt-1">DCA trigger</p>
          </CardContent>
        </Card>

        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Unrealized P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${
              totalUnrealizedPnL > 0 ? 'text-green-400' : 
              totalUnrealizedPnL < 0 ? 'text-red-400' : 
              'text-crypto-light'
            }`}>
              {totalUnrealizedPnL > 0 ? '+' : ''}${totalUnrealizedPnL.toFixed(4)}
            </div>
            <p className="text-xs text-crypto-light mt-1">All cycles + current</p>
          </CardContent>
        </Card>

        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Total P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${
              completedCyclesTotal > 0 ? 'text-green-400' : 
              completedCyclesTotal < 0 ? 'text-red-400' : 
              'text-crypto-light'
            }`}>
              {completedCyclesTotal > 0 ? '+' : ''}${completedCyclesTotal.toFixed(4)}
            </div>
            <p className="text-xs text-crypto-light mt-1">Completed cycles only</p>
          </CardContent>
        </Card>
      </div>

      {/* Position Overview */}
      <Card className="bg-crypto-darker border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Current Cycle (#{currentCycle?.cycleNumber || 'N/A'})</CardTitle>
        </CardHeader>
        <CardContent>
          {totalPositionSize > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <div className="text-2xl font-bold text-blue-400">
                  {totalPositionSize.toFixed(2)}
                </div>
                <p className="text-sm text-crypto-light mt-1">Position Size</p>
                <p className="text-xs text-crypto-light">{bot.tradingPair?.replace('USDT', '')} held</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-400">
                  ${averageEntryPrice.toFixed(4)}
                </div>
                <p className="text-sm text-crypto-light mt-1">Average Entry</p>
                <p className="text-xs text-crypto-light">Weighted average price</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">
                  ${totalInvested.toFixed(2)}
                </div>
                <p className="text-sm text-crypto-light mt-1">Total Invested</p>
                <p className="text-xs text-crypto-light">Current cycle cost</p>
              </div>
              <div>
                {averageEntryPrice > 0 && currentMarketData ? (
                  <div className="text-2xl font-bold">
                    <span className={`${
                      parseFloat(currentMarketData.price || '0') > averageEntryPrice ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {parseFloat(currentMarketData.price || '0') > averageEntryPrice ? '+' : ''}
                      ${((parseFloat(currentMarketData.price || '0') - averageEntryPrice) * totalPositionSize).toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-crypto-light">$0.00</div>
                )}
                <p className="text-sm text-crypto-light mt-1">Unrealized P&L</p>
                <p className="text-xs text-crypto-light">Current profit/loss</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-crypto-light">No active position</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bot Sections */}
      <div className="flex space-x-4 border-b border-gray-800">
        <button
          onClick={() => setActiveSection('current-cycle')}
          className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'current-cycle'
              ? 'border-crypto-primary text-crypto-primary'
              : 'border-transparent text-crypto-light hover:text-white'
          }`}
        >
          Current Cycle Orders
        </button>
        <button
          onClick={() => setActiveSection('history')}
          className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'history'
              ? 'border-crypto-primary text-crypto-primary'
              : 'border-transparent text-crypto-light hover:text-white'
          }`}
        >
          Bot Orders History
        </button>
      </div>

      {/* Content based on active section */}
      {activeSection === 'current-cycle' && (
        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Current Cycle Orders</CardTitle>
            <p className="text-sm text-crypto-light">
              Active orders for cycle #{currentCycle?.cycleNumber || 'N/A'}
            </p>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="text-center py-8">
                <div className="text-crypto-light">Loading orders...</div>
              </div>
            ) : currentCycleOrders.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-crypto-light">No active orders for current cycle</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-2 px-4 text-crypto-light">Order Type</th>
                      <th className="text-left py-2 px-4 text-crypto-light">Side</th>
                      <th className="text-left py-2 px-4 text-crypto-light">Price</th>
                      <th className="text-left py-2 px-4 text-crypto-light">Distance</th>
                      <th className="text-left py-2 px-4 text-crypto-light">Quantity</th>
                      <th className="text-left py-2 px-4 text-crypto-light">Status</th>
                      <th className="text-left py-2 px-4 text-crypto-light">% Filled</th>
                      <th className="text-left py-2 px-4 text-crypto-light">Fee</th>
                      <th className="text-left py-2 px-4 text-crypto-light">Date Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentCycleOrders.map((order: any, index: number) => {
                      const currentPrice = parseFloat(currentMarketData?.price || '0');
                      const orderPrice = parseFloat(order.price || '0');
                      const isUnfilled = order.status !== 'filled' && order.status !== 'cancelled';
                      const distance = currentPrice > 0 && isUnfilled ? ((orderPrice - currentPrice) / currentPrice) * 100 : 0;
                      const isCloseToFill = isUnfilled && Math.abs(distance) < 2; // Within 2% of current price
                      
                      // Calculate fill percentage
                      const originalQty = parseFloat(order.quantity || '0');
                      const filledQty = parseFloat(order.filledQuantity || '0');
                      let fillPercentage = 0;
                      
                      if (order.status === 'filled') {
                        fillPercentage = 100;
                      } else if (filledQty > 0 && originalQty > 0) {
                        fillPercentage = (filledQty / originalQty) * 100;
                      }
                      
                      return (
                        <tr key={index} className={`border-b border-gray-800 hover:bg-gray-800/50 ${
                          isCloseToFill && order.status === 'placed' ? 'bg-yellow-500/5 border-yellow-500/20' : ''
                        }`}>
                          <td className="py-2 px-4 text-white">
                            <span className="font-medium">
                              {order.displayName || order.orderType?.replace('_', ' ') || order.order_type?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            <span className={`text-sm font-medium ${
                              order.side === 'BUY' ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {order.side}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-white font-mono">
                            ${parseFloat(order.price || '0').toFixed(4)}
                          </td>
                          <td className="py-2 px-4">
                            {isUnfilled && currentPrice > 0 ? (
                              <span className={`text-sm font-mono ${
                                Math.abs(distance) < 1 ? 'text-red-400 font-bold' :
                                Math.abs(distance) < 2 ? 'text-yellow-400' :
                                'text-crypto-light'
                              }`}>
                                {distance > 0 ? '+' : ''}{distance.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-crypto-light text-sm">-</span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-white font-mono">
                            {parseFloat(order.quantity || '0').toFixed(2)}
                          </td>
                          <td className="py-2 px-4">
                            <Badge className={`text-xs ${
                              order.status === 'filled' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                              order.status === 'placed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                              order.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              'bg-gray-500/10 text-gray-400 border-gray-500/20'
                            }`}>
                              {order.status || 'unknown'}
                            </Badge>
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-mono text-white">
                                {fillPercentage.toFixed(1)}%
                              </span>
                              {fillPercentage > 0 && fillPercentage < 100 && (
                                <div className="w-12 h-2 bg-gray-700 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-400 transition-all"
                                    style={{ width: `${fillPercentage}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            {order.fee && parseFloat(order.fee) > 0 ? (
                              <span className="text-xs text-crypto-light font-mono">
                                {parseFloat(order.fee).toFixed(4)} {order.feeAsset || 'USDT'}
                              </span>
                            ) : (
                              <span className="text-xs text-crypto-light">-</span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-crypto-light text-xs">
                            {order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeSection === 'history' && (
        <Card className="bg-crypto-darker border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Bot Orders History</CardTitle>
            <p className="text-sm text-crypto-light">Completed orders grouped by cycle</p>
          </CardHeader>
          <CardContent>
            {historyOrders.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-crypto-light">No completed orders yet</div>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedCycleGroups.map(([cycleNumber, cycleGroup]: [string, any]) => (
                  <div key={cycleNumber} className="border border-gray-700 rounded-lg p-4">
                    {/* Cycle Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-white">
                          Cycle #{cycleNumber}
                        </h3>
                        <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                          Completed
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-6">
                        <span className="text-sm text-crypto-light">
                          {cycleGroup.orders.length} orders
                        </span>
                        <span className={`font-mono text-sm font-semibold ${
                          cycleGroup.pnl > 0 ? 'text-green-400' : 
                          cycleGroup.pnl < 0 ? 'text-red-400' : 
                          'text-crypto-light'
                        }`}>
                          P&L: {cycleGroup.pnl > 0 ? '+' : ''}${cycleGroup.pnl.toFixed(4)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Cycle Orders Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700 bg-gray-800/30">
                            <th className="text-left py-2 px-4 text-crypto-light">Order Type</th>
                            <th className="text-left py-2 px-4 text-crypto-light">Side</th>
                            <th className="text-left py-2 px-4 text-crypto-light">Filled Price</th>
                            <th className="text-left py-2 px-4 text-crypto-light">Filled Qty</th>
                            <th className="text-left py-2 px-4 text-crypto-light">Value</th>
                            <th className="text-left py-2 px-4 text-crypto-light">Fee</th>
                            <th className="text-left py-2 px-4 text-crypto-light">Filled Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cycleGroup.orders.map((order: any, index: number) => {
                            const filledPrice = parseFloat(order.filledPrice || order.price || '0');
                            const filledQty = parseFloat(order.filledQuantity || order.quantity || '0');
                            const orderValue = filledPrice * filledQty;
                            
                            return (
                              <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/30">
                                <td className="py-2 px-4 text-white">
                                  <span className="font-medium">
                                    {order.displayName || order.orderType?.replace('_', ' ') || 'Unknown'}
                                  </span>
                                </td>
                                <td className="py-2 px-4">
                                  <span className={`text-sm font-medium ${
                                    order.side === 'BUY' ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {order.side || 'N/A'}
                                  </span>
                                </td>
                                <td className="py-2 px-4 text-white font-mono">
                                  ${filledPrice.toFixed(4)}
                                </td>
                                <td className="py-2 px-4 text-white font-mono">
                                  {filledQty.toFixed(2)}
                                </td>
                                <td className="py-2 px-4 text-white font-mono">
                                  ${orderValue.toFixed(2)}
                                </td>
                                <td className="py-2 px-4">
                                  {order.fee && parseFloat(order.fee) > 0 ? (
                                    <span className="text-xs text-crypto-light font-mono">
                                      {parseFloat(order.fee).toFixed(4)} {order.feeAsset || 'USDT'}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-crypto-light">-</span>
                                  )}
                                </td>
                                <td className="py-2 px-4 text-crypto-light text-xs">
                                  {order.filledAt ? new Date(order.filledAt).toLocaleString() : 
                                   order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stop Bot Warning Dialog */}
      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent className="bg-crypto-darker border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Stop Trading Bot</DialogTitle>
            <DialogDescription className="text-crypto-light">
              Are you sure you want to stop this trading bot?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center mt-0.5">
                  <span className="text-xs text-black font-bold">!</span>
                </div>
                <div>
                  <h4 className="text-yellow-400 font-medium mb-2">Warning: Assets will be sold at market price</h4>
                  <p className="text-crypto-light text-sm">
                    Stopping the bot will:
                  </p>                  <ul className="text-crypto-light text-sm mt-2 list-disc list-inside space-y-1">
                    <li>Cancel all unfilled safety orders ({pendingOrdersCount} pending orders)</li>
                    <li>Sell any purchased assets at current market price</li>
                    <li>Complete the current cycle immediately</li>
                    <li>Change bot status to inactive</li>
                  </ul>
                  {totalPositionSize > 0 && (
                    <div className="mt-3 p-2 bg-gray-800/50 rounded">
                      <p className="text-white text-sm">
                        Current position: <span className="font-mono">{totalPositionSize.toFixed(2)} {bot.tradingPair?.replace('USDT', '')}</span>
                      </p>
                      <p className="text-crypto-light text-sm">
                        Estimated market value: <span className="font-mono">${(totalPositionSize * parseFloat(currentMarketData?.price || '0')).toFixed(2)}</span>
                      </p>
                    </div>
                  )}
                  {pendingOrdersCount > 0 && (
                    <div className="mt-3 p-2 bg-yellow-800/30 rounded">
                      <p className="text-yellow-400 text-sm font-medium">
                        {pendingOrdersCount} pending order{pendingOrdersCount > 1 ? 's' : ''} will be cancelled
                      </p>
                      <p className="text-crypto-light text-sm">
                        Total pending value: <span className="font-mono">${totalPendingValue.toFixed(2)} USDT</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowStopDialog(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleStopBot}
              disabled={isProcessing}
            >
              {isProcessing ? 'Stopping...' : 'Stop Bot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Bot Warning Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-crypto-darker border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Trading Bot</DialogTitle>
            <DialogDescription className="text-crypto-light">
              Are you sure you want to permanently delete this trading bot?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center mt-0.5">
                  <span className="text-xs text-white font-bold">!</span>
                </div>
                <div>
                  <h4 className="text-red-400 font-medium mb-2">Permanent Action: This cannot be undone</h4>
                  <p className="text-crypto-light text-sm">
                    Deleting the bot will:
                  </p>                  <ul className="text-crypto-light text-sm mt-2 list-disc list-inside space-y-1">
                    <li>Cancel all unfilled safety orders ({pendingOrdersCount} pending orders)</li>
                    <li>Sell any purchased assets at current market price</li>
                    <li>Permanently delete all bot data and history</li>
                    <li>Remove all cycle and order records</li>
                    <li>This action cannot be reversed</li>
                  </ul>
                  {totalPositionSize > 0 && (
                    <div className="mt-3 p-2 bg-gray-800/50 rounded">
                      <p className="text-white text-sm">
                        Current position: <span className="font-mono">{totalPositionSize.toFixed(2)} {bot.tradingPair?.replace('USDT', '')}</span>
                      </p>
                      <p className="text-crypto-light text-sm">
                        Estimated market value: <span className="font-mono">${(totalPositionSize * parseFloat(currentMarketData?.price || '0')).toFixed(2)}</span>
                      </p>
                    </div>
                  )}
                  {pendingOrdersCount > 0 && (
                    <div className="mt-3 p-2 bg-red-800/30 rounded">
                      <p className="text-red-400 text-sm font-medium">
                        {pendingOrdersCount} pending order{pendingOrdersCount > 1 ? 's' : ''} will be cancelled
                      </p>
                      <p className="text-crypto-light text-sm">
                        Total pending value: <span className="font-mono">${totalPendingValue.toFixed(2)} USDT</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteBot}
              disabled={isProcessing}
            >
              {isProcessing ? 'Deleting...' : 'Delete Bot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}