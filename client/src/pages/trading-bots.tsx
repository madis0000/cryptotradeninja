import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { MarketsPanel } from "@/components/shared/markets-panel";
import { TradingHeader } from "@/components/shared/trading-header";
import { TradingChart } from "@/components/trading/trading-chart";
import { usePublicWebSocket } from "@/hooks/useWebSocketService";

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
                  <TradingChart symbol={selectedSymbol} />
                </div>
              </div>
            </div>

            {/* Black Section - Bottom Tabs spanning market and chart sections */}
            <div className="border-t border-gray-800 bg-crypto-dark">
              <Tabs defaultValue="running" className="w-full">
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
                  <div className="text-center py-8 text-gray-400">
                    <i className="fas fa-robot text-4xl mb-4"></i>
                    <p>No running bots for this pair</p>
                  </div>
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

          {/* Gray Section - Strategy Configuration Panel */}
          <div className="w-80 bg-crypto-dark border-l border-gray-800 flex flex-col">
            <div className="p-4 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Create {strategies.find(s => s.id === selectedStrategy)?.name} Bot</h3>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 text-xs px-2 py-1">
                    Buy {selectedSymbol.replace('USDT', '')}
                  </Button>
                  <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 text-xs px-2 py-1">
                    Sell {selectedSymbol.replace('USDT', '')}
                  </Button>
                </div>
              </div>
              
              {selectedStrategy === "grid" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">1. Price Settings</label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Price Deviation</span>
                        <span className="text-white">1 %</span>
                      </div>
                      <Input
                        placeholder="Grid number"
                        className="bg-crypto-darker border-gray-700 text-white text-sm h-8"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">2. Investment</label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Quote Order Size</span>
                        <span className="text-white flex items-center">
                          77.5 <span className="text-gray-400 ml-1">USDT</span>
                        </span>
                      </div>
                      <Input
                        placeholder="5.000"
                        className="bg-crypto-darker border-gray-700 text-white text-sm h-8"
                      />
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">DCA Order Size</span>
                        <span className="text-white flex items-center">
                          77.5 <span className="text-gray-400 ml-1">USDT</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Max DCA Orders</span>
                        <span className="text-white">8</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Available</label>
                    <div className="text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Spot Balance</span>
                        <span className="text-white">0.00 USDT</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400"></span>
                        <span className="text-white">-- USDT</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Advanced (Optional)</label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full justify-start text-gray-400 hover:text-white h-8"
                    >
                      <i className="fas fa-chevron-right mr-2"></i>
                      Advanced Settings
                    </Button>
                  </div>
                </div>
              )}

              {selectedStrategy === "martingale" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">1. Martingale Settings</label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Multiplier</span>
                        <span className="text-white">2.0x</span>
                      </div>
                      <Input
                        placeholder="Initial order size"
                        className="bg-crypto-darker border-gray-700 text-white text-sm h-8"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">2. Risk Management</label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Max Orders</span>
                        <span className="text-white">5</span>
                      </div>
                      <Input
                        placeholder="Stop Loss %"
                        className="bg-crypto-darker border-gray-700 text-white text-sm h-8"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Available</label>
                    <div className="text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Spot Balance</span>
                        <span className="text-white">0.00 USDT</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-auto pt-6">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-3">Preview</p>
                  <Button 
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    disabled
                  >
                    Create {strategies.find(s => s.id === selectedStrategy)?.name} Bot
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}