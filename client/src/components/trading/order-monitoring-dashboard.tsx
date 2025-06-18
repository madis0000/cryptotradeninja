import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { webSocketSingleton } from "@/services/WebSocketSingleton";
import { Activity, TrendingUp, AlertTriangle, BarChart3, Zap, Target } from "lucide-react";

interface OrderStats {
  total: number;
  manual: number;
  martingale: number;
  limitOrders: number;
  marketOrders: number;
  buyOrders: number;
  sellOrders: number;
}

interface OrderPerformanceMetrics {
  orderId: string;
  symbol: string;
  strategy: string;
  executionLatency: number;
  priceSlippage: number;
  fillRate: number;
  orderEfficiency: number;
  timestamp: number;
}

interface CrossStrategyCorrelation {
  exchangeId: number;
  totalOrders: number;
  manualOrders: number;
  botOrders: number;
  symbolOverlap: string[];
  potentialConflicts: number;
  timestamp: number;
}

interface OrderMonitoringDashboardProps {
  exchangeId?: number;
  className?: string;
}

export function OrderMonitoringDashboard({ exchangeId, className }: OrderMonitoringDashboardProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<OrderPerformanceMetrics[]>([]);
  const [crossStrategyData, setCrossStrategyData] = useState<CrossStrategyCorrelation | null>(null);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);

  useEffect(() => {
    // Subscribe to WebSocket order monitoring events  
    const unsubscribe = webSocketSingleton.subscribe((data: any) => {
      if (!data) return;

      // Handle order distribution stats
      if (data.type === 'order_distribution_stats' && data.stats) {
        console.log('[ORDER DASHBOARD] 📊 Received order distribution stats:', data.stats);
        setOrderStats(data.stats);
        setLastUpdateTime(Date.now());
      }

      // Handle order monitoring status
      if (data.type === 'order_monitoring_status') {
        console.log('[ORDER DASHBOARD] 🔍 Order monitoring status:', data);
        setMonitoringActive(data.monitoringActive);
        setLastUpdateTime(Date.now());
      }

      // Handle order performance metrics
      if (data.type === 'order_performance_metrics' && data.data) {
        console.log('[ORDER DASHBOARD] ⚡ Performance metrics:', data.data);
        setPerformanceMetrics(prev => {
          const updated = [...prev, data.data].slice(-50); // Keep last 50 metrics
          return updated;
        });
        setLastUpdateTime(Date.now());
      }

      // Handle cross-strategy correlation data
      if (data.type === 'cross_strategy_correlation' && data.data) {
        console.log('[ORDER DASHBOARD] 🔗 Cross-strategy correlation:', data.data);
        setCrossStrategyData(data.data);
        setLastUpdateTime(Date.now());
      }

      // Handle order execution analytics
      if (data.type === 'order_execution_analytics' && data.data) {
        console.log('[ORDER DASHBOARD] 📈 Execution analytics:', data.data);
        // Convert execution analytics to performance metrics format
        const metrics: OrderPerformanceMetrics = {
          orderId: data.data.orderId,
          symbol: data.data.symbol,
          strategy: data.data.strategy,
          executionLatency: data.data.executionTime,
          priceSlippage: data.data.priceSlippage,
          fillRate: data.data.fillRate,
          orderEfficiency: data.data.fillRate - Math.abs(data.data.priceSlippage * 10),
          timestamp: data.data.timestamp
        };
        
        setPerformanceMetrics(prev => {
          const updated = [...prev, metrics].slice(-50);
          return updated;
        });
        setLastUpdateTime(Date.now());
      }
    });

    // Track connection status
    const connectionStatus = () => {
      setIsConnected(webSocketSingleton.isConnected());
    };

    connectionStatus();
    const interval = setInterval(connectionStatus, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Calculate average performance metrics
  const avgPerformance = performanceMetrics.length > 0 ? {
    avgLatency: performanceMetrics.reduce((sum, m) => sum + m.executionLatency, 0) / performanceMetrics.length,
    avgSlippage: performanceMetrics.reduce((sum, m) => sum + Math.abs(m.priceSlippage), 0) / performanceMetrics.length,
    avgFillRate: performanceMetrics.reduce((sum, m) => sum + m.fillRate, 0) / performanceMetrics.length,
    avgEfficiency: performanceMetrics.reduce((sum, m) => sum + m.orderEfficiency, 0) / performanceMetrics.length
  } : null;

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'manual': return 'bg-blue-100 text-blue-800';
      case 'martingale': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 80) return 'text-green-600';
    if (efficiency >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Unified Order Monitoring Dashboard
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant={isConnected ? "default" : "destructive"}>
                {isConnected ? "Connected" : "Disconnected"}
              </Badge>
              {monitoringActive && (
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  <Zap className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
          </CardTitle>
          {lastUpdateTime > 0 && (
            <p className="text-sm text-muted-foreground">
              Last updated: {formatTimestamp(lastUpdateTime)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="strategy">Strategy Mix</TabsTrigger>
              <TabsTrigger value="correlation">Correlation</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {orderStats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{orderStats.total}</div>
                      <p className="text-xs text-muted-foreground">Total Orders</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-blue-600">{orderStats.manual}</div>
                      <p className="text-xs text-muted-foreground">Manual Orders</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-green-600">{orderStats.martingale}</div>
                      <p className="text-xs text-muted-foreground">Bot Orders</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">
                        {orderStats.buyOrders}/{orderStats.sellOrders}
                      </div>
                      <p className="text-xs text-muted-foreground">Buy/Sell</p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No order statistics available</p>
                  <p className="text-sm">Connect to exchange to start monitoring</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              {avgPerformance ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{avgPerformance.avgLatency.toFixed(0)}ms</div>
                        <p className="text-xs text-muted-foreground">Avg Execution Time</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{avgPerformance.avgSlippage.toFixed(3)}%</div>
                        <p className="text-xs text-muted-foreground">Avg Price Slippage</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{avgPerformance.avgFillRate.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">Avg Fill Rate</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className={`text-2xl font-bold ${getEfficiencyColor(avgPerformance.avgEfficiency)}`}>
                          {avgPerformance.avgEfficiency.toFixed(1)}
                        </div>
                        <p className="text-xs text-muted-foreground">Efficiency Score</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Recent Order Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {performanceMetrics.slice(-10).reverse().map((metric, index) => (
                          <div key={`${metric.orderId}-${index}`} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <Badge className={getStrategyColor(metric.strategy)}>
                                {metric.strategy}
                              </Badge>
                              <span className="font-mono text-sm">{metric.symbol}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span>{metric.executionLatency}ms</span>
                              <span className={getEfficiencyColor(metric.orderEfficiency)}>
                                {metric.orderEfficiency.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground">
                                {formatTimestamp(metric.timestamp)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No performance data available</p>
                  <p className="text-sm">Performance metrics will appear after order executions</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="strategy" className="space-y-4">
              {orderStats && orderStats.total > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Manual Orders</span>
                      <span>{orderStats.manual} ({((orderStats.manual / orderStats.total) * 100).toFixed(1)}%)</span>
                    </div>
                    <Progress value={(orderStats.manual / orderStats.total) * 100} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Bot Orders</span>
                      <span>{orderStats.martingale} ({((orderStats.martingale / orderStats.total) * 100).toFixed(1)}%)</span>
                    </div>
                    <Progress value={(orderStats.martingale / orderStats.total) * 100} className="h-2" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-lg font-semibold text-blue-600">{orderStats.limitOrders}</div>
                        <p className="text-sm text-muted-foreground">Limit Orders</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-lg font-semibold text-orange-600">{orderStats.marketOrders}</div>
                        <p className="text-sm text-muted-foreground">Market Orders</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No strategy data available</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="correlation" className="space-y-4">
              {crossStrategyData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{crossStrategyData.totalOrders}</div>
                        <p className="text-xs text-muted-foreground">Total Active Orders</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{crossStrategyData.symbolOverlap.length}</div>
                        <p className="text-xs text-muted-foreground">Overlapping Symbols</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className={`text-2xl font-bold ${crossStrategyData.potentialConflicts > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {crossStrategyData.potentialConflicts}
                        </div>
                        <p className="text-xs text-muted-foreground">Potential Conflicts</p>
                      </CardContent>
                    </Card>
                  </div>

                  {crossStrategyData.symbolOverlap.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                          Symbol Overlaps
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {crossStrategyData.symbolOverlap.map(symbol => (
                            <Badge key={symbol} variant="outline" className="bg-yellow-50 text-yellow-800">
                              {symbol}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          These symbols have both manual and bot orders active simultaneously
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No correlation data available</p>
                  <p className="text-sm">Cross-strategy analysis will appear when multiple strategies are active</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
