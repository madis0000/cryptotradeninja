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
        const message = JSON.parse(event.data);
        if (message.type === 'market_update' && message.data.symbol === selectedBot.tradingPair) {
          setMarketData(message.data);
        }
        
        // Listen for order notifications to trigger targeted updates
        if (message.type === 'order_notification' && message.data.botId === selectedBot.id) {
          console.log('[CLIENT WS] Order notification received:', message.data.orderType);
          
          // Only update when a new cycle starts (base order filled)
          if (message.data.orderType === 'base_order' && message.data.status === 'filled') {
            console.log('[CLIENT WS] New cycle detected - updating cycle data');
            queryClient.invalidateQueries({ queryKey: ['/api/bot-cycles', selectedBot.id] });
            queryClient.invalidateQueries({ queryKey: ['/api/bots'] }); // For total P&L
          }
          
          // Update orders when new orders are placed or filled
          if (message.data.status === 'filled' || message.data.status === 'new') {
            console.log('[CLIENT WS] Order update - refreshing order data');
            queryClient.invalidateQueries({ queryKey: ['/api/bot-orders', selectedBot.id] });
          }
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

  // Fetch bots data (event-driven updates only)
  const { data: bots = [], isLoading: botsLoading } = useQuery<any[]>({
    queryKey: ['/api/bots']
  });

  // Fetch bot orders for selected bot (event-driven updates only)
  const { data: botOrders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/bot-orders', selectedBot?.id],
    queryFn: async () => {
      if (!selectedBot?.id) return [];
      const response = await fetch(`/api/bot-orders/${selectedBot.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    },
    enabled: !!selectedBot?.id
  });

  // Fetch individual bot data for the selected bot
  const { data: selectedBotData } = useQuery({
    queryKey: ['/api/bots', selectedBot?.id],
    queryFn: async () => {
      if (!selectedBot?.id) return null;
      const response = await fetch(`/api/bots/${selectedBot.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch bot data');
      return response.json();
    },
    enabled: !!selectedBot?.id
  });

  // Fetch bot cycles for current cycle information (event-driven updates only)
  const { data: botCycles = [] } = useQuery({
    queryKey: ['/api/bot-cycles', selectedBot?.id],
    queryFn: async () => {
      if (!selectedBot?.id) return [];
      const response = await fetch(`/api/bot-cycles/${selectedBot.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch cycles');
      return response.json();
    },
    enabled: !!selectedBot?.id
  });

  // Get current active cycle (highest cycle number)
  const currentCycle = botCycles.length > 0 
    ? botCycles.reduce((latest: any, cycle: any) => {
        return (!latest || cycle.cycleNumber > latest.cycleNumber) ? cycle : latest;
      }, null)
    : null;
    


  // Filter orders for current cycle and history
  const currentCycleOrders = botOrders.filter((order: any) => {
    if (!currentCycle) return false;
    return order.cycleId === currentCycle.id;
  });

  const historyOrders = botOrders.filter((order: any) => {
    // Show all filled orders from previous cycles
    if (!currentCycle) return order.status === 'filled';
    
    // For completed cycles or filled orders from previous cycles
    const isFromPreviousCycle = order.cycleId !== currentCycle.id;
    const isFilledOrder = order.status === 'filled';
    
    return isFromPreviousCycle && isFilledOrder;
  });

  // Group history orders by cycle number and calculate P&L per cycle
  const groupedHistoryOrders = historyOrders.reduce((groups: any, order: any) => {
    const cycle = botCycles.find((c: any) => c.id === order.cycleId);
    const cycleNumber = cycle?.cycleNumber || 'Unknown';
    
    if (!groups[cycleNumber]) {
      groups[cycleNumber] = {
        orders: [],
        cycleData: cycle,
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

  // Sort grouped cycles by cycle number (descending - newest first)
  const sortedCycleGroups = Object.entries(groupedHistoryOrders).sort(([a], [b]) => {
    const cycleA = parseInt(a as string);
    const cycleB = parseInt(b as string);
    return cycleB - cycleA;
  });

  // Fetch general stats for dashboard overview
  const { data: botData } = useQuery({
    queryKey: ['/api/stats'],
    enabled: !!selectedBot
  });

  // Filter bots by status
  const activeBots = bots.filter(bot => bot.status === 'active');
  const inactiveBots = bots.filter(bot => bot.status !== 'active');

  // Calculate average entry price and position size from filled buy orders
  const calculatePositionMetrics = () => {
    if (!botOrders || botOrders.length === 0) {
      return { averageEntryPrice: 0, totalPositionSize: 0, totalInvested: 0 };
    }
    
    const filledBuyOrders = botOrders.filter((order: any) => {
      const status = order.status?.toLowerCase();
      const side = order.side?.toUpperCase();
      const orderType = (order.orderType || order.order_type)?.toLowerCase();
      
      const isFilled = status === 'filled';
      const isBuy = side === 'BUY';
      const isValidType = orderType === 'base_order' || orderType === 'safety_order';
      
      return isFilled && isBuy && isValidType;
    });
    
    if (filledBuyOrders.length === 0) return { averageEntryPrice: 0, totalPositionSize: 0, totalInvested: 0 };
    
    let totalValue = 0;
    let totalQuantity = 0;
    
    filledBuyOrders.forEach((order: any) => {
      // Use filledPrice and filledQuantity from cycleOrders table
      const price = parseFloat(order.filledPrice || order.price || '0');
      const quantity = parseFloat(order.filledQuantity || order.quantity || '0');
      const orderValue = price * quantity;
      
      totalValue += orderValue;
      totalQuantity += quantity;
    });
    
    return {
      averageEntryPrice: totalQuantity > 0 ? totalValue / totalQuantity : 0,
      totalPositionSize: totalQuantity,
      totalInvested: totalValue
    };
  };

  const { averageEntryPrice, totalPositionSize, totalInvested } = calculatePositionMetrics();

  // Calculate next orders to be filled and their distances
  const getNextOrdersInfo = () => {
    if (!botOrders || !marketData) {
      return { takeProfitDistance: null, nextSafetyDistance: null, takeProfitOrder: null, nextSafetyOrder: null };
    }

    const currentPrice = parseFloat(marketData.price || '0');
    if (currentPrice === 0) {
      return { takeProfitDistance: null, nextSafetyDistance: null, takeProfitOrder: null, nextSafetyOrder: null };
    }

    // Find take profit order that is not filled
    const takeProfitOrder = botOrders.find((order: any) => 
      order.orderType === 'take_profit' && 
      order.status !== 'filled' && 
      order.status !== 'cancelled'
    );

    // Find next unfilled safety order (lowest price for long strategy)
    const unfilledSafetyOrders = botOrders.filter((order: any) => 
      order.orderType === 'safety_order' && 
      order.status !== 'filled' && 
      order.status !== 'cancelled'
    ).sort((a: any, b: any) => parseFloat(a.price || '0') - parseFloat(b.price || '0'));

    const nextSafetyOrder = unfilledSafetyOrders[0];

    const calculateDistance = (orderPrice: string) => {
      const price = parseFloat(orderPrice || '0');
      return price > 0 ? ((price - currentPrice) / currentPrice) * 100 : 0;
    };

    return {
      takeProfitDistance: takeProfitOrder ? calculateDistance(takeProfitOrder.price) : null,
      nextSafetyDistance: nextSafetyOrder ? calculateDistance(nextSafetyOrder.price) : null,
      takeProfitOrder: takeProfitOrder || null,
      nextSafetyOrder: nextSafetyOrder || null
    };
  };

  const { takeProfitDistance, nextSafetyDistance, takeProfitOrder, nextSafetyOrder } = getNextOrdersInfo();

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
      if (selectedBot?.id === deleteBotMutation.variables) {
        setSelectedBot(null);
      }
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
                  size="sm"
                  onClick={() => setSelectedBot(null)}
                  className="text-crypto-light border-gray-700 hover:bg-gray-800"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Bots
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-white">{selectedBot.name}</h1>
                  <div className="flex items-center space-x-2">
                    <p className="text-crypto-light">
                      {selectedBot.tradingPair} • {selectedBot.strategy} • {selectedBot.direction}
                    </p>
                    <Badge className={`${
                      selectedBot.status === 'active' 
                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                        : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                    }`}>
                      {selectedBot.status || 'inactive'}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                {marketData && (
                  <div className="text-right">
                    <div className="text-lg font-mono text-green-400">
                      ${parseFloat(marketData.price || '0').toFixed(4)}
                    </div>
                    <div className="text-xs text-crypto-light">Live Price</div>
                  </div>
                )}
              </div>
            </div>

            {/* Bot Configuration and Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4">
              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Base Order</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-green-400">${parseFloat(selectedBot.baseOrderAmount || '0').toFixed(4)}</div>
                  <p className="text-xs text-crypto-light mt-1">Initial order size</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Safety Order</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-blue-400">${parseFloat(selectedBot.safetyOrderAmount || '0').toFixed(4)}</div>
                  <p className="text-xs text-crypto-light mt-1">DCA order size</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Max Safety Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-yellow-400">{selectedBot.maxSafetyOrders}</div>
                  <p className="text-xs text-crypto-light mt-1">DCA limit</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Price Deviation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-purple-400">{parseFloat(selectedBot.priceDeviation || '0').toFixed(4)}%</div>
                  <p className="text-xs text-crypto-light mt-1">DCA trigger</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Current Cycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-cyan-400">#{selectedBot.currentCycle || 1}</div>
                  <p className="text-xs text-crypto-light mt-1">Cycle number</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Cycle P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  {averageEntryPrice > 0 && marketData ? (
                    <div className="text-xl font-bold">
                      <span className={`${
                        parseFloat(marketData.price || '0') > averageEntryPrice ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {parseFloat(marketData.price || '0') > averageEntryPrice ? '+' : ''}
                        ${((parseFloat(marketData.price || '0') - averageEntryPrice) * totalPositionSize).toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xl font-bold text-crypto-light">$0.00</div>
                  )}
                  <p className="text-xs text-crypto-light mt-1">Unrealized P&L</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Total P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-emerald-400">
                    ${parseFloat(selectedBot.totalPnl || '0').toFixed(2)}
                  </div>
                  <p className="text-xs text-crypto-light mt-1">All-time profit</p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Position Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <div className="text-lg font-bold text-orange-400">
                        {averageEntryPrice > 0 ? `$${averageEntryPrice.toFixed(4)}` : 'N/A'}
                      </div>
                      <p className="text-xs text-crypto-light">Average entry price</p>
                    </div>
                    
                    {totalPositionSize > 0 && (
                      <div>
                        <div className="text-sm font-mono text-white">
                          {totalPositionSize.toFixed(6)} {selectedBot.tradingPair?.replace('USDT', '')}
                        </div>
                        <p className="text-xs text-crypto-light">Position size</p>
                      </div>
                    )}

                    {totalInvested > 0 && (
                      <div>
                        <div className="text-sm font-mono text-white">
                          ${totalInvested.toFixed(2)}
                        </div>
                        <p className="text-xs text-crypto-light">Total invested</p>
                      </div>
                    )}

                    {averageEntryPrice > 0 && marketData && (
                      <div className="pt-1 border-t border-gray-700">
                        <div className={`text-xs font-medium ${
                          parseFloat(marketData.price || '0') > averageEntryPrice ? 'text-green-400' : 'text-red-400'
                        }`}>
                          P&L: {parseFloat(marketData.price || '0') > averageEntryPrice ? '+' : ''}
                          {(((parseFloat(marketData.price || '0') - averageEntryPrice) / averageEntryPrice) * 100).toFixed(2)}%
                        </div>
                      </div>
                    )}

                    {/* Next Orders to Fill */}
                    {(takeProfitDistance !== null || nextSafetyDistance !== null) && (
                      <div className="pt-2 border-t border-gray-700 space-y-1">
                        <p className="text-xs text-crypto-light font-medium">Next Orders</p>
                        
                        {takeProfitDistance !== null && takeProfitOrder && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-green-400">Take Profit</span>
                            <div className="text-right">
                              <div className="text-xs font-mono text-white">
                                ${parseFloat(takeProfitOrder.price || '0').toFixed(4)}
                              </div>
                              <div className={`text-xs font-medium ${
                                takeProfitDistance > 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {takeProfitDistance > 0 ? '+' : ''}{takeProfitDistance.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        )}

                        {nextSafetyDistance !== null && nextSafetyOrder && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-yellow-400">Next Safety</span>
                            <div className="text-right">
                              <div className="text-xs font-mono text-white">
                                ${parseFloat(nextSafetyOrder.price || '0').toFixed(4)}
                              </div>
                              <div className={`text-xs font-medium ${
                                nextSafetyDistance > 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {nextSafetyDistance > 0 ? '+' : ''}{nextSafetyDistance.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Current Cycle Orders */}
            <Card className="bg-crypto-darker border-gray-800 mb-6">
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
                          const currentPrice = parseFloat(marketData?.price || '0');
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
                                <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block w-fit ${
                                  order.status === 'filled' ? 'bg-green-500/10 text-green-400' :
                                  order.status === 'placed' ? 'bg-blue-500/10 text-blue-400' :
                                  order.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                                  order.status === 'cancelled' ? 'bg-gray-500/10 text-gray-400' :
                                  'bg-red-500/10 text-red-400'
                                }`}>
                                  {order.status === 'pending' ? 'Pending' :
                                   order.status === 'placed' ? 'Placed' :
                                   order.status === 'filled' ? 'Filled' :
                                   order.status === 'cancelled' ? 'Cancelled' :
                                   order.status}
                                </span>
                              </td>
                              <td className="py-2 px-4">
                                <span className="text-sm text-crypto-light">
                                  {fillPercentage > 0 ? `${fillPercentage.toFixed(0)}%` : '-'}
                                </span>
                              </td>
                              <td className="py-2 px-4">
                                {order.status === 'filled' && order.fee ? (
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

            {/* Bot Orders History */}
            <Card className="bg-crypto-darker border-gray-800 mb-6">
              <CardHeader>
                <CardTitle className="text-white">Bot Orders History</CardTitle>
                <p className="text-sm text-crypto-light">
                  Completed orders from previous cycles ({historyOrders.length} orders)
                </p>
              </CardHeader>
              <CardContent>
                {sortedCycleGroups.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">No completed orders from previous cycles</div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {sortedCycleGroups.map(([cycleNumber, cycleGroup]: [string, any]) => (
                      <div key={cycleNumber} className="border border-gray-700 rounded-lg overflow-hidden">
                        {/* Cycle Header */}
                        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
                          <div className="flex items-center justify-between">
                            <h4 className="text-white font-semibold">
                              Cycle #{cycleNumber}
                            </h4>
                            <div className="flex items-center space-x-4">
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
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bot Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Current Cycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-400">
                    {currentCycle ? `#${currentCycle.cycleNumber}` : 'No Active Cycle'}
                  </div>
                  <p className="text-sm text-crypto-light mt-2">
                    {currentCycle?.status === 'active' ? 'Running' : 'Completed'}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Bot P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${parseFloat(selectedBotData?.totalPnl || '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${parseFloat(selectedBotData?.totalPnl || '0').toFixed(4)}
                  </div>
                  <p className="text-sm text-crypto-light mt-2">
                    {selectedBotData?.totalTrades || 0} trades completed
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-crypto-darker border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Total Invested</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-400">
                    ${totalInvested.toFixed(4)}
                  </div>
                  <p className="text-sm text-crypto-light mt-2">
                    {totalPositionSize.toFixed(1)} {selectedBot?.tradingPair?.replace('USDT', '')} held
                  </p>
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

            {/* Active Bots */}
            {activeSection === 'active-bots' && (
              <div className="space-y-4">
                {botsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-crypto-light">Loading bots...</div>
                  </div>
                ) : activeBots.length === 0 ? (
                  <Card className="bg-crypto-darker border-gray-800">
                    <CardContent className="text-center py-8">
                      <div className="text-crypto-light">No active bots found</div>
                      <p className="text-sm text-crypto-light mt-2">
                        Create your first bot to start automated trading
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  activeBots.map((bot: any) => (
                    <Card key={bot.id} className="bg-crypto-darker border-gray-800">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-white">{bot.name}</CardTitle>
                            <p className="text-sm text-crypto-light mt-1">
                              {bot.tradingPair} • {bot.strategy} • {bot.direction}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                              Active
                            </Badge>
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
                  ))
                )}
              </div>
            )}

            {/* Inactive Bots */}
            {activeSection === 'inactive-bots' && (
              <div className="space-y-4">
                {inactiveBots.length === 0 ? (
                  <Card className="bg-crypto-darker border-gray-800">
                    <CardContent className="text-center py-8">
                      <div className="text-crypto-light">No inactive bots found</div>
                    </CardContent>
                  </Card>
                ) : (
                  inactiveBots.map((bot: any) => (
                    <Card key={bot.id} className="bg-crypto-darker border-gray-800">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-white">{bot.name}</CardTitle>
                            <p className="text-sm text-crypto-light mt-1">
                              {bot.tradingPair} • {bot.strategy} • {bot.direction}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                              Inactive
                            </Badge>
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
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}