import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TradingChart } from "@/components/trading/trading-chart";

export default function TradingBots() {
  const [selectedSymbol, setSelectedSymbol] = useState("ICPUSDT");

  // Mock data for trading pairs
  const tradingPairs = [
    { symbol: "1INCHUSDT", price: "0.3317", change: "-6.15%", volume: "3.3M", changeType: "negative" },
    { symbol: "BTCUSDT", price: "106244.38", change: "+0.48%", volume: "1.2B", changeType: "positive" },
    { symbol: "ETHUSDT", price: "3847.12", change: "+2.15%", volume: "800M", changeType: "positive" },
    { symbol: "ICPUSDT", price: "5.635", change: "+9.58%", volume: "42M", changeType: "positive" },
    { symbol: "ADAUSDT", price: "0.8945", change: "-1.23%", volume: "156M", changeType: "negative" },
    { symbol: "DOGEUSDT", price: "0.3421", change: "+5.67%", volume: "89M", changeType: "positive" },
    { symbol: "SOLUSDT", price: "198.45", change: "+3.21%", volume: "234M", changeType: "positive" },
    { symbol: "AVAXUSDT", price: "38.92", change: "-2.11%", volume: "67M", changeType: "negative" },
    { symbol: "DOTUSDT", price: "7.234", change: "+1.89%", volume: "45M", changeType: "positive" },
    { symbol: "LINKUSDT", price: "23.45", change: "-0.95%", volume: "123M", changeType: "negative" },
  ];

  const botTypes = [
    { id: "spot_grid", name: "Spot Grid", active: true },
    { id: "futures_grid", name: "Futures Grid", active: false },
    { id: "arbitrage", name: "Arbitrage Bot", active: false },
    { id: "rebalancing", name: "Rebalancing Bot", active: false },
    { id: "spot_dca", name: "Spot DCA", active: false },
    { id: "futures_twap", name: "Futures TWAP", active: false },
    { id: "algo_orders", name: "Spot Algo Orders", active: false },
  ];

  return (
    <div className="h-screen bg-crypto-darker overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Top Navigation Bar */}
        <div className="bg-crypto-dark border-b border-gray-800 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              {botTypes.map((type) => (
                <Button
                  key={type.id}
                  variant="ghost"
                  size="sm"
                  className={`text-xs px-3 py-1.5 ${
                    type.active 
                      ? 'text-orange-400 bg-orange-400/10 border border-orange-400/20' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {type.name}
                </Button>
              ))}
            </div>
            
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
                Buy ICP
              </Button>
              <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
                Sell ICP
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex">
          {/* Left Panel - Market List */}
          <div className="w-80 bg-crypto-dark border-r border-gray-800 flex flex-col">
            {/* Market Search */}
            <div className="p-3 border-b border-gray-800">
              <Input
                placeholder="Search"
                className="bg-crypto-darker border-gray-700 text-white text-sm h-8"
              />
            </div>

            {/* Market Headers */}
            <div className="px-3 py-2 border-b border-gray-800">
              <div className="grid grid-cols-4 gap-2 text-xs text-gray-400">
                <span>Pair</span>
                <span className="text-right">Last Price</span>
                <span className="text-right">24h Change</span>
                <span className="text-right">24h Volume</span>
              </div>
            </div>

            {/* Market List */}
            <div className="flex-1 overflow-y-auto">
              {tradingPairs.map((pair) => (
                <div
                  key={pair.symbol}
                  onClick={() => setSelectedSymbol(pair.symbol)}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-800/50 border-b border-gray-800/50 ${
                    selectedSymbol === pair.symbol ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="text-white font-medium truncate">{pair.symbol}</div>
                    <div className="text-white text-right">{pair.price}</div>
                    <div className={`text-right ${
                      pair.changeType === 'positive' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {pair.change}
                    </div>
                    <div className="text-gray-400 text-right">{pair.volume}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Center Panel - Chart */}
          <div className="flex-1 bg-crypto-dark">
            {/* Chart Header */}
            <div className="border-b border-gray-800 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg font-bold text-white">{selectedSymbol}</span>
                    <Badge variant="secondary" className="bg-gray-700 text-gray-300 text-xs">
                      {selectedSymbol.replace('USDT', '')}/USDT
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-4 text-sm">
                    <span className="text-green-400">+9.58%</span>
                    <span className="text-gray-400">24h High</span>
                    <span className="text-white">6.00</span>
                    <span className="text-gray-400">24h Low</span>
                    <span className="text-white">5.145</span>
                    <span className="text-gray-400">24h Volume(ICP)</span>
                    <span className="text-white">7,885,734.17</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                    Original
                  </Button>
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                    Trading View
                  </Button>
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                    Depth
                  </Button>
                </div>
              </div>
            </div>

            {/* Chart Area */}
            <div className="h-96">
              <TradingChart symbol={selectedSymbol} />
            </div>

            {/* Bottom Tabs */}
            <div className="border-t border-gray-800">
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

          {/* Right Panel - Bot Configuration */}
          <div className="w-80 bg-crypto-dark border-l border-gray-800 flex flex-col">
            <div className="p-4">
              <h3 className="text-white font-semibold mb-4">Create Bot</h3>
              
              {/* Investment Section */}
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

                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-3">Preview</p>
                  <Button 
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    disabled
                  >
                    Create Bot
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