import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { MarketsPanel } from "@/components/shared/markets-panel";
import { TradingHeader } from "@/components/shared/trading-header";
import { TradingChart } from "@/components/trading/trading-chart";
import { GridStrategy } from "@/components/bots/strategies/grid-strategy";
import { MartingaleStrategy } from "@/components/bots/strategies/martingale-strategy";
import { webSocketSingleton } from "@/services/WebSocketSingleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const { data: bots = [] } = useQuery<any[]>({
    queryKey: ['/api/bots']
  });

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

  const [klineData, setKlineData] = useState<any>(null);
  const [currentInterval, setCurrentInterval] = useState("4h");
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const strategies = [
    { id: "grid", name: "Grid", active: true },
    { id: "martingale", name: "Martingale", active: false },
  ];

  // Handle WebSocket messages
  useEffect(() => {
    const unsubscribeData = webSocketSingleton.subscribe((data: any) => {
      console.log('[BOTS] Received WebSocket message:', data?.type, data);
      
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
      
      // Handle kline data for the chart
      if (data && data.type === 'kline_update' && data.data) {
        console.log('[BOTS] Received kline data for chart:', data.data);
        setKlineData(data.data);
      }

      // Handle historical klines (from server)
      if (data && data.type === 'historical_klines' && data.data && data.data.klines) {
        console.log('[BOTS] Received historical klines:', data.data.klines.length, 'candles for', data.data.symbol);
        if (Array.isArray(data.data.klines) && data.data.klines.length > 0) {
          setKlineData(data.data.klines); // Set the klines array as initial kline data
        }
      }

      // Handle historical klines (server sends this message type)
      if (data && data.type === 'historical_klines' && data.data && data.data.klines) {
        console.log('[BOTS] Received historical klines:', data.data.klines.length, 'candles for', data.data.symbol);
        if (Array.isArray(data.data.klines) && data.data.klines.length > 0) {
          setKlineData(data.data.klines); // Set the entire batch as initial kline data
        }
      }

      // Handle historical klines batch (fallback for different message formats)
      if (data && data.type === 'historical_klines_batch' && data.data) {
        console.log('[BOTS] Received historical klines batch:', data.data.length, 'candles');
        if (Array.isArray(data.data) && data.data.length > 0) {
          setKlineData(data.data); // Set the entire batch as initial kline data
        }
      }
    });

    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      console.log(`[BOTS] Connected to unified WebSocket server`);
      setConnectionStatus('connected');
    });

    const unsubscribeDisconnect = webSocketSingleton.onDisconnect(() => {
      console.log('[BOTS] Disconnected from unified WebSocket server');
      setConnectionStatus('disconnected');
    });

    const unsubscribeError = webSocketSingleton.onError(() => {
      console.log('[BOTS] WebSocket error');
      setConnectionStatus('disconnected');
    });

    // Set initial status
    setConnectionStatus(webSocketSingleton.getStatus() as any);

    return () => {
      unsubscribeData();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, []);

  const handleSymbolSelect = (symbol: string) => {
    console.log(`[BOTS] Symbol selected: ${symbol}`);
    setSelectedSymbol(symbol);
    setTickerData(null); // Clear previous ticker data
    setKlineData(null); // Clear previous kline data
    
    // Note: Symbol change will be handled by the useEffect below
  };

  const handleIntervalChange = (interval: string) => {
    console.log(`[BOTS] Interval changed to: ${interval}`);
    setCurrentInterval(interval);
    setKlineData(null); // Clear previous kline data when interval changes
  };

  useEffect(() => {
    // Connect to unified WebSocket server ONCE and add reference
    console.log(`[BOTS] Starting unified WebSocket connection...`);
    
    // Add reference for this component instance
    webSocketSingleton.addReference();
    
    if (!webSocketSingleton.isConnected()) {
      webSocketSingleton.connect();
    }
    
    // Setup initial subscriptions once connected
    const setupSubscriptions = () => {
      if (webSocketSingleton.isConnected()) {
        console.log(`[BOTS] Setting up initial subscriptions for ${selectedSymbol}`);
        webSocketSingleton.changeSymbolSubscription(selectedSymbol, currentInterval);
      }
    };

    let unsubscribeConnect: (() => void) | undefined;

    // If already connected, setup subscriptions immediately
    if (webSocketSingleton.isConnected()) {
      setupSubscriptions();
    } else {
      // Wait for connection
      unsubscribeConnect = webSocketSingleton.onConnect(() => {
        setupSubscriptions();
      });
    }

    // Cleanup function - ALWAYS executed when component unmounts
    return () => {
      console.log('[BOTS] Trading bots page unmounting, cleaning up WebSocket connection');
      
      // Clean up connection listener if it exists
      if (unsubscribeConnect) {
        unsubscribeConnect();
      }
      
      // Send unsubscribe message if connected
      if (webSocketSingleton.isConnected()) {
        console.log('[BOTS] Sending unsubscribe message');
        webSocketSingleton.unsubscribe();
      }
      
      // Remove reference to allow cleanup
      console.log('[BOTS] Removing WebSocket reference');
      webSocketSingleton.removeReference();
    };
  }, []); // Empty dependency array - only run once on mount and cleanup on unmount

  useEffect(() => {
    // Change subscription when symbol or interval changes (but not on initial mount)
    if (webSocketSingleton.isConnected()) {
      console.log(`[BOTS] Changing subscription to ${selectedSymbol} at ${currentInterval}`);
      webSocketSingleton.changeSymbolSubscription(selectedSymbol, currentInterval);
    } else {
      console.log(`[BOTS] WebSocket not connected, cannot change subscription to ${selectedSymbol}`);
    }
  }, [selectedSymbol, currentInterval]);

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
                    klineData={klineData}
                    onIntervalChange={handleIntervalChange}
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
                    <div className="space-y-3">
                      {bots.filter((bot: any) => bot.status === 'active').map((bot: any) => (
                        <div key={bot.id} className="bg-crypto-dark border border-gray-700 rounded p-3">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="text-sm font-medium text-white">{bot.name}</div>
                              <div className="text-xs text-gray-400">{bot.tradingPair} • {bot.direction.toUpperCase()}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-400">Status</div>
                              <div className="text-sm text-green-400">Active</div>
                            </div>
                          </div>
                        </div>
                      ))}
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