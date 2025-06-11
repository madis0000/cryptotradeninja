import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { MarketsPanel } from "@/components/shared/markets-panel";
import { TradingHeader } from "@/components/shared/trading-header";
import { TradingChart } from "@/components/trading/trading-chart";
import { GridStrategy } from "@/components/bots/strategies/grid-strategy";
import { MartingaleStrategy } from "@/components/bots/strategies/martingale-strategy";
import { usePublicWebSocket } from "@/hooks/useWebSocketService";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, RefreshCw, Target, TrendingUp, TrendingDown } from "lucide-react";

interface TickerData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

export default function TradingBots() {
  const [selectedSymbol, setSelectedSymbol] = useState("ICPUSDT");
  const [selectedStrategy, setSelectedStrategy] = useState("grid");
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [selectedExchangeId, setSelectedExchangeId] = useState<number | undefined>();
  const queryClient = useQueryClient();
  const [martingaleConfig, setMartingaleConfig] = useState<{
    baseOrderPrice: number;
    takeProfitDeviation: number;
    safetyOrderDeviation: number;
    maxSafetyOrders: number;
    priceDeviationMultiplier: number;
    activeSafetyOrders?: number;
  }>({
    baseOrderPrice: 5.64, // Will be updated by current market price
    takeProfitDeviation: 1.5, // From takeProfit setting
    safetyOrderDeviation: 1.0, // From priceDeviation setting
    maxSafetyOrders: 8, // From maxSafetyOrders setting
    priceDeviationMultiplier: 1.5, // From priceDeviationMultiplier setting
  });

  // Fetch exchanges for balance data
  const { data: exchanges } = useQuery({
    queryKey: ['/api/exchanges']
  });

  // Fetch bots data for Running tab
  const { data: bots = [] } = useQuery({
    queryKey: ['/api/bots']
  });

  // Fetch cycle profits for P&L calculations
  const { data: cycleProfits } = useQuery({
    queryKey: ['/api/cycle-profits']
  });

  // Helper functions for bot metrics
  const formatAge = (createdAt: string) => {
    try {
      const created = new Date(createdAt);
      const now = new Date();
      const diffInMs = now.getTime() - created.getTime();
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      
      if (diffInDays > 0) {
        return `${diffInDays}d`;
      } else if (diffInHours > 0) {
        return `${diffInHours}h`;
      } else {
        return '<1h';
      }
    } catch {
      return '0d';
    }
  };

  const getCompletedCycles = (botId: number) => {
    if (!cycleProfits) return 0;
    return (cycleProfits as any[]).filter((cycle: any) => 
      cycle.botId === botId && cycle.status === 'completed'
    ).length;
  };

  const getTotalPnL = (botId: number) => {
    if (!cycleProfits) return 0;
    return (cycleProfits as any[])
      .filter((cycle: any) => cycle.botId === botId && cycle.status === 'completed')
      .reduce((total: number, cycle: any) => total + parseFloat(cycle.profit || '0'), 0);
  };

  const calculateUnrealizedPnL = (bot: any) => {
    // Get current market price from ticker data
    const currentPrice = parseFloat(tickerData?.price || '0');
    if (currentPrice === 0) return 0;

    // Calculate average entry price and total quantity from active orders
    // This would need to be fetched from the bot's current cycle data
    // For now, return 0 as placeholder - would need API endpoint for current positions
    return 0;
  };

  const calculateAverageDailyPnL = (bot: any) => {
    const totalPnL = getTotalPnL(bot.id);
    const ageInMs = new Date().getTime() - new Date(bot.createdAt).getTime();
    const ageInDays = Math.max(1, ageInMs / (1000 * 60 * 60 * 24));
    return totalPnL / ageInDays;
  };

  const formatCurrency = (amount: number) => {
    return Math.abs(amount) < 0.01 
      ? amount.toFixed(6)
      : amount.toFixed(2);
  };

  // Auto-select first exchange if available
  useEffect(() => {
    if (exchanges && Array.isArray(exchanges) && exchanges.length > 0 && !selectedExchangeId) {
      setSelectedExchangeId((exchanges as any[])[0].id);
    }
  }, [exchanges, selectedExchangeId]);

  const handleExchangeChange = (exchangeId: number) => {
    setSelectedExchangeId(exchangeId);
  };

  const handleBotCreated = () => {
    // Invalidate bot-related queries to refresh the data
    queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
    queryClient.invalidateQueries({ queryKey: ['/api/bot-stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/cycle-profits'] });
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
  };

  const strategies = [
    { id: "grid", name: "Grid", active: true },
    { id: "martingale", name: "Martingale", active: false },
  ];

  const publicWs = usePublicWebSocket({
    onMessage: (data: any) => {
      if (data && data.type === 'market_update' && data.data) {
        const marketData = data.data;
        setTickerData({
          symbol: marketData.symbol,
          price: marketData.price,
          priceChange: marketData.priceChange,
          priceChangePercent: marketData.priceChangePercent,
          highPrice: marketData.highPrice,
          lowPrice: marketData.lowPrice,
          volume: marketData.volume,
          quoteVolume: marketData.quoteVolume
        });
      }
    },
    onConnect: () => {
      console.log(`[BOTS] Connected to WebSocket for ${selectedSymbol} ticker`);
    },
    onDisconnect: () => {
      console.log('[BOTS] Disconnected from WebSocket');
    }
  });

  const handleSymbolSelect = (symbol: string) => {
    console.log(`[BOTS] Symbol selected: ${symbol}`);
    setSelectedSymbol(symbol);
    setTickerData(null);
    publicWs.subscribe([symbol]);
  };

  useEffect(() => {
    console.log(`[BOTS] Starting WebSocket connection...`);
    publicWs.connect([selectedSymbol]);

    return () => {
      publicWs.disconnect();
    };
  }, []);

  useEffect(() => {
    if (publicWs.status === 'connected') {
      console.log(`[BOTS] Changing subscription to ${selectedSymbol}`);
      publicWs.subscribe([selectedSymbol]);
    }
  }, [selectedSymbol, publicWs.status]);

  return (
    <div className="h-screen bg-crypto-darker overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Orange Section - Strategy Selection */}
        <div className="bg-crypto-dark border-b border-gray-800 px-4 py-2">
          <div className="flex items-center space-x-6">
            {strategies.map((strategy) => (
              <Button
                key={strategy.id}
                variant="ghost"
                size="sm"
                onClick={() => setSelectedStrategy(strategy.id)}
                className={`text-xs px-3 py-1.5 ${
                  selectedStrategy === strategy.id
                    ? 'text-orange-400 bg-orange-400/10 border border-orange-400/20' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {strategy.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex">
          {/* Left Side - Market List and Chart with Bottom Tabs */}
          <div className="flex-1 flex flex-col">
            {/* Top Content Row */}
            <div className="flex-1 flex">
              {/* Red Section - Market List (shared component) */}
              <MarketsPanel
                className="w-80"
                onSymbolSelect={handleSymbolSelect}
                selectedSymbol={selectedSymbol}
              />

              {/* Center Area - Chart */}
              <div className="flex-1 flex flex-col">
                {/* Blue Section - Trading Header (shared component) */}
                <TradingHeader 
                  selectedSymbol={selectedSymbol}
                  tickerData={tickerData}
                />

                {/* Green Section - Chart (specific to bots page with future enhancements) */}
                <div className="flex-1 bg-crypto-dark">
                  <TradingChart 
                    symbol={selectedSymbol} 
                    strategy={selectedStrategy === "martingale" ? martingaleConfig : undefined} 
                  />
                </div>
              </div>
            </div>

            {/* Black Section - Bottom Tabs spanning market and chart sections */}
            <div className="h-64 border-t border-gray-800 bg-crypto-dark">
              <Tabs defaultValue="running" className="w-full h-full">
                <TabsList className="bg-transparent border-b border-gray-800 rounded-none h-auto p-0">
                  <TabsTrigger 
                    value="running" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-400 data-[state=active]:bg-transparent data-[state=active]:text-orange-400 text-gray-400 hover:text-white px-4 py-2"
                  >
                    Running
                  </TabsTrigger>
                  <TabsTrigger 
                    value="history" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-400 data-[state=active]:bg-transparent data-[state=active]:text-orange-400 text-gray-400 hover:text-white px-4 py-2"
                  >
                    History
                  </TabsTrigger>
                  <TabsTrigger 
                    value="pnl" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-400 data-[state=active]:bg-transparent data-[state=active]:text-orange-400 text-gray-400 hover:text-white px-4 py-2"
                  >
                    PNL Analysis
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="running" className="p-4">
                  {bots.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <i className="fas fa-robot text-4xl mb-4"></i>
                      <p>No running bots</p>
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                      <div className="space-y-3">
                        {bots.filter((bot: any) => bot.status === 'active').map((bot: any) => {
                          const completedCycles = getCompletedCycles(bot.id);
                          const totalPnL = getTotalPnL(bot.id);
                          const unrealizedPnL = calculateUnrealizedPnL(bot);
                          const avgDailyPnL = calculateAverageDailyPnL(bot);
                          
                          return (
                            <div key={bot.id} className="bg-crypto-darker border border-gray-700 rounded-lg p-4">
                              {/* Header */}
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <div className="text-sm font-medium text-white">{bot.name}</div>
                                  <div className="text-xs text-gray-400">{bot.tradingPair} • {bot.direction.toUpperCase()}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-gray-400">Status</div>
                                  <div className="text-sm text-green-400">Active</div>
                                </div>
                              </div>

                              {/* P&L Summary */}
                              <div className="grid grid-cols-2 gap-4 mb-3">
                                <div className="text-center">
                                  <div className={`text-lg font-bold font-mono ${
                                    totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}
                                  </div>
                                  <div className="text-xs flex items-center justify-center text-gray-400">
                                    {totalPnL >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                    Total P&L
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className={`text-lg font-bold font-mono ${
                                    unrealizedPnL > 0 
                                      ? 'text-green-400'
                                      : unrealizedPnL < 0 
                                        ? 'text-red-400'
                                        : 'text-gray-400'
                                  }`}>
                                    {unrealizedPnL > 0 ? '+' : ''}${formatCurrency(unrealizedPnL)}
                                  </div>
                                  <div className="text-xs flex items-center justify-center text-gray-400">
                                    <Target className="w-3 h-3 mr-1" />
                                    Unrealized
                                  </div>
                                </div>
                              </div>

                              {/* Key Metrics */}
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="text-center p-2 rounded border bg-gray-800/20 border-gray-700/30">
                                  <div className="font-mono font-semibold text-crypto-primary">
                                    {formatAge(bot.createdAt)}
                                  </div>
                                  <div className="flex items-center justify-center mt-1 text-gray-400">
                                    <Clock className="w-3 h-3 mr-1" />
                                    Age
                                  </div>
                                </div>
                                <div className="text-center p-2 rounded border bg-gray-800/20 border-gray-700/30">
                                  <div className="font-mono font-semibold text-crypto-primary">
                                    {completedCycles}
                                  </div>
                                  <div className="flex items-center justify-center mt-1 text-gray-400">
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    Cycles
                                  </div>
                                </div>
                                <div className="text-center p-2 rounded border bg-gray-800/20 border-gray-700/30">
                                  <div className={`font-mono font-semibold ${
                                    avgDailyPnL > 0 
                                      ? 'text-green-400'
                                      : avgDailyPnL < 0 
                                        ? 'text-red-400'
                                        : 'text-gray-400'
                                  }`}>
                                    {avgDailyPnL > 0 ? '+' : ''}${formatCurrency(avgDailyPnL)}
                                  </div>
                                  <div className="flex items-center justify-center mt-1 text-gray-400">
                                    <TrendingUp className="w-3 h-3 mr-1" />
                                    Daily Avg
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="p-4">
                  <div className="text-center py-8 text-gray-400">
                    <i className="fas fa-history text-4xl mb-4"></i>
                    <p>No historical data available</p>
                  </div>
                </TabsContent>

                <TabsContent value="pnl" className="p-4">
                  <div className="text-center py-8 text-gray-400">
                    <i className="fas fa-chart-line text-4xl mb-4"></i>
                    <p>No PNL data available</p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Gray Section - Strategy Configuration Panel - Full Height */}
          <div className="w-80 bg-crypto-dark border-l border-gray-800 flex flex-col">
            <div className="p-4 flex-1 overflow-y-auto min-h-0">
              
              {/* Strategy Configuration Content */}
              {selectedStrategy === "grid" && (
                <GridStrategy className="flex-1" />
              )}
              
              {selectedStrategy === "martingale" && (
                <MartingaleStrategy 
                  className="flex-1" 
                  selectedSymbol={selectedSymbol}
                  selectedExchangeId={selectedExchangeId}
                  exchanges={Array.isArray(exchanges) ? exchanges : []}
                  onExchangeChange={handleExchangeChange}
                  onBotCreated={handleBotCreated}
                  onConfigChange={(config) => {
                    setMartingaleConfig({
                      baseOrderPrice: martingaleConfig.baseOrderPrice, // Keep current market price
                      takeProfitDeviation: parseFloat(config.takeProfit || "1.5"),
                      safetyOrderDeviation: parseFloat(config.priceDeviation || "1.0"),
                      maxSafetyOrders: parseInt(config.maxSafetyOrders || "8"),
                      priceDeviationMultiplier: config.priceDeviationMultiplier?.[0] || 1.5,
                      activeSafetyOrders: config.activeSafetyOrdersEnabled ? parseInt(config.activeSafetyOrders || "1") : undefined,
                    });
                  }}
                />
              )}

              {selectedStrategy === "grid" && (
                <div className="mt-auto pt-6">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-3">Preview</p>
                    <Button 
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                      disabled
                    >
                      Create Grid Bot
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}