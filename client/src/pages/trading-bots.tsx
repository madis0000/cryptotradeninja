import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MartingaleStrategy } from "@/components/bots/strategies/martingale-strategy";
import { GridStrategy } from "@/components/bots/strategies/grid-strategy";
import { Plus, Bot, TrendingUp, DollarSign, Zap, AlertTriangle, Settings, BarChart3, History, Eye } from "lucide-react";

interface TradingBot {
  id: number;
  name: string;
  strategy: string;
  tradingPair: string;
  direction: string;
  isActive: boolean;
  baseOrderAmount: string;
  safetyOrderAmount: string;
  maxSafetyOrders: number;
  takeProfitPercentage: string;
  priceDeviation: string;
  totalPnl: string;
  totalTrades: number;
  winRate: string;
  createdAt: string;
}

export default function TradingBots() {
  const [location, navigate] = useLocation();
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [activeSection, setActiveSection] = useState(() => {
    if (location === "/bots/overview") return "overview";
    if (location === "/create-bot") return "create";
    return "overview";
  });

  // Fetch bots from API
  const { data: bots = [], isLoading } = useQuery<TradingBot[]>({
    queryKey: ["/api/bots"],
  });

  // Fetch user stats
  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  });

  const getStatusBadge = (isActive: boolean) => {
    return isActive ? (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
    ) : (
      <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Stopped</Badge>
    );
  };

  const sidebarItems = [
    { 
      id: "overview", 
      label: "Overview", 
      icon: BarChart3,
      path: "/bots/overview"
    },
    { 
      id: "create", 
      label: "Create Bot", 
      icon: Plus,
      path: "/create-bot"
    },
    { 
      id: "history", 
      label: "Trading History", 
      icon: History,
      path: "/bots/history"
    }
  ];

  const handleSectionChange = (sectionId: string, path: string) => {
    setActiveSection(sectionId);
    navigate(path);
  };

  const activeBots = bots.filter(bot => bot.isActive).length;
  const totalInvested = bots.reduce((sum, bot) => sum + parseFloat(bot.baseOrderAmount), 0);
  const totalPnl = bots.reduce((sum, bot) => sum + parseFloat(bot.totalPnl), 0);

  return (
    <div className="min-h-screen bg-crypto-darker">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-crypto-dark border-r border-gray-800 min-h-screen">
          <div className="p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Bot className="w-6 h-6 text-crypto-accent" />
              Bot Management
            </h2>
            
            <nav className="space-y-2">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id, item.path)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-crypto-accent text-white'
                        : 'text-crypto-light hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white">
                {activeSection === "overview" && "Bot Overview"}
                {activeSection === "create" && "Create Trading Bot"}
                {activeSection === "history" && "Trading History"}
              </h1>
              <p className="text-crypto-light mt-1">
                {activeSection === "overview" && "Monitor and manage your trading bots"}
                {activeSection === "create" && "Set up automated trading strategies"}
                {activeSection === "history" && "View completed bot trading cycles"}
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          {activeSection === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-crypto-dark border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Bot className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-crypto-light">Total Bots</p>
                      <p className="text-xl font-bold text-white">{bots.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-crypto-dark border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <Zap className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-crypto-light">Active</p>
                      <p className="text-xl font-bold text-white">{activeBots}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-crypto-dark border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-crypto-light">Total PnL</p>
                      <p className={`text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-crypto-dark border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      <DollarSign className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm text-crypto-light">Invested</p>
                      <p className="text-xl font-bold text-white">${totalInvested.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Content Sections */}
          {activeSection === "overview" && (
            <Card className="bg-crypto-dark border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Trading Bots</CardTitle>
                <CardDescription className="text-crypto-light">
                  {bots.length === 0 ? "No bots created yet" : `Managing ${bots.length} trading bot${bots.length !== 1 ? 's' : ''}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crypto-accent mx-auto"></div>
                    <p className="text-crypto-light mt-2">Loading bots...</p>
                  </div>
                ) : bots.length === 0 ? (
                  <div className="text-center py-8">
                    <Bot className="w-12 h-12 text-crypto-light mx-auto mb-4" />
                    <p className="text-crypto-light">No trading bots created yet</p>
                    <p className="text-sm text-crypto-light/70 mt-1 mb-4">
                      Create your first bot to start automated trading
                    </p>
                    <Button 
                      onClick={() => handleSectionChange("create", "/create-bot")}
                      className="bg-crypto-accent hover:bg-crypto-accent-dark text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Bot
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bots.map((bot) => (
                      <div key={bot.id} className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-crypto-accent/20 rounded-lg flex items-center justify-center">
                              <Bot className="w-5 h-5 text-crypto-accent" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-white">{bot.name}</h3>
                              <p className="text-sm text-crypto-light">
                                {bot.strategy.charAt(0).toUpperCase() + bot.strategy.slice(1)} • {bot.tradingPair} • {bot.direction}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            {getStatusBadge(bot.isActive)}
                            <div className="text-right">
                              <p className={`font-semibold ${parseFloat(bot.totalPnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {parseFloat(bot.totalPnl) >= 0 ? '+' : ''}${parseFloat(bot.totalPnl).toFixed(2)}
                              </p>
                              <p className="text-sm text-crypto-light">${parseFloat(bot.baseOrderAmount).toFixed(2)} invested</p>
                            </div>
                            <Button variant="outline" size="sm" className="border-gray-700 text-crypto-light hover:bg-gray-800">
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </div>
                        </div>
                        <Separator className="my-4 bg-gray-800" />
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <p className="text-crypto-light">Base Order</p>
                            <p className="text-white font-medium">${parseFloat(bot.baseOrderAmount).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-crypto-light">Safety Orders</p>
                            <p className="text-white font-medium">{bot.maxSafetyOrders}</p>
                          </div>
                          <div>
                            <p className="text-crypto-light">Take Profit</p>
                            <p className="text-white font-medium">{parseFloat(bot.takeProfitPercentage).toFixed(2)}%</p>
                          </div>
                          <div>
                            <p className="text-crypto-light">Total Trades</p>
                            <p className="text-white font-medium">{bot.totalTrades}</p>
                          </div>
                          <div>
                            <p className="text-crypto-light">Win Rate</p>
                            <p className="text-white font-medium">{parseFloat(bot.winRate).toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeSection === "create" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-crypto-dark border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Grid Trading Bot
                  </CardTitle>
                  <CardDescription className="text-crypto-light">
                    Profit from market volatility with automated grid orders
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GridStrategy 
                    selectedSymbol={selectedSymbol}
                    className="space-y-4"
                  />
                </CardContent>
              </Card>

              <Card className="bg-crypto-dark border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Martingale Bot
                  </CardTitle>
                  <CardDescription className="text-crypto-light">
                    Average down with increasing position sizes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MartingaleStrategy 
                    selectedSymbol={selectedSymbol}
                    className="space-y-4"
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === "history" && (
            <Card className="bg-crypto-dark border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Trading History</CardTitle>
                <CardDescription className="text-crypto-light">
                  View completed bot trading cycles and performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <History className="w-12 h-12 text-crypto-light mx-auto mb-4" />
                  <p className="text-crypto-light">No trading history yet</p>
                  <p className="text-sm text-crypto-light/70 mt-1">
                    Completed bot cycles and trades will appear here
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}