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

  // Fetch bots data
  const { data: bots = [], isLoading: botsLoading } = useQuery<any[]>({
    queryKey: ['/api/bots']
  });

  // Fetch bot orders for selected bot
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

  // Fetch bot cycles for current cycle information
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

  // Get current active cycle
  const currentCycle = botCycles.find((cycle: any) => cycle.status === 'active') || botCycles[0];

  // Group orders by cycle
  const ordersByCycle = botOrders.reduce((acc: any, order: any) => {
    const cycleId = order.cycleId;
    if (!acc[cycleId]) {
      acc[cycleId] = [];
    }
    acc[cycleId].push(order);
    return acc;
  }, {});

  // Calculate cycle profits
  const calculateCycleProfit = (cycleOrders: any[], cycleData: any) => {
    const filledOrders = cycleOrders.filter(order => order.status === 'filled');
    let totalBought = 0;
    let totalSold = 0;

    filledOrders.forEach(order => {
      const price = parseFloat(order.filledPrice || order.price || '0');
      const quantity = parseFloat(order.filledQuantity || order.quantity || '0');
      const value = price * quantity;

      if (order.side === 'BUY') {
        totalBought += value;
      } else if (order.side === 'SELL') {
        totalSold += value;
      }
    });

    return totalSold - totalBought;
  };

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
                    const cycleA = botCycles.find(c => c.id === (ordersA as any[])[0]?.cycleId);
                    const cycleB = botCycles.find(c => c.id === (ordersB as any[])[0]?.cycleId);
                    return (cycleB?.cycleNumber || 0) - (cycleA?.cycleNumber || 0);
                  })
                  .map(([cycleId, cycleOrders]) => {
                    const cycleData = botCycles.find(cycle => cycle.id === parseInt(cycleId));
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
          )}
        </div>
      )}
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
                          <th className="text-left py-3 px-4 text-crypto-light">Side</th>
                          <th className="text-left py-3 px-4 text-crypto-light">Filled Price</th>
                          <th className="text-left py-3 px-4 text-crypto-light">Filled Qty</th>
                          <th className="text-left py-3 px-4 text-crypto-light">P&L</th>
                          <th className="text-left py-3 px-4 text-crypto-light">Filled Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyOrders.map((order: any, index: number) => {
                          const filledPrice = parseFloat(order.filledPrice || order.price || '0');
                          const filledQty = parseFloat(order.filledQuantity || order.quantity || '0');
                          const orderValue = filledPrice * filledQty;
                          
                          return (
                            <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/50">
                              <td className="py-3 px-4 text-white">
                                <span className="text-sm font-medium">
                                  #{order.cycleNumber || 'N/A'}
                                </span>
                              </td>
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
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  order.side === 'BUY' 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {order.side}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-white font-mono">
                                ${filledPrice.toFixed(4)}
                              </td>
                              <td className="py-3 px-4 text-white font-mono">
                                {filledQty.toFixed(1)}
                              </td>
                              <td className="py-3 px-4 text-white font-mono">
                                ${orderValue.toFixed(4)}
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
                    {currentCycle ? `#${currentCycle.cycleNumber || 1}` : 'No Active Cycle'}
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