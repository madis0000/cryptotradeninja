import { useState } from "react";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { ActiveBots } from "@/components/dashboard/active-bots";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { CreateBotModal } from "@/components/bots/create-bot-modal";
import { TradingChart } from "@/components/charts/trading-chart";
import { usePublicWebSocket } from "@/hooks/useWebSocketService";
import { MarketData } from "@/types";

export default function Dashboard() {
  const [isCreateBotModalOpen, setIsCreateBotModalOpen] = useState(false);
  const [marketData, setMarketData] = useState<MarketData>({});

  // WebSocket connection for real-time updates
  useWebSocket({
    onMarketUpdate: (data: MarketData) => {
      setMarketData(data);
    },
  });

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-6">Trading Dashboard</h1>
        <StatsOverview />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="xl:col-span-2 space-y-6">
          {/* Price Chart Placeholder */}
          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <h2 className="text-lg font-semibold text-white">BTC/USDT</h2>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xl font-bold text-crypto-success">
                      ${marketData['BTC/USDT']?.price?.toFixed(2) || '43,285.12'}
                    </span>
                    <span className="text-sm text-crypto-success bg-crypto-success/10 px-2 py-1 rounded">
                      +{marketData['BTC/USDT']?.change?.toFixed(2) || '2.34'}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="px-3 py-1 text-xs bg-crypto-accent/10 text-crypto-accent border border-crypto-accent/20">
                    1H
                  </Button>
                  <Button variant="ghost" size="sm" className="px-3 py-1 text-xs text-crypto-light hover:bg-gray-800">
                    4H
                  </Button>
                  <Button variant="ghost" size="sm" className="px-3 py-1 text-xs text-crypto-light hover:bg-gray-800">
                    1D
                  </Button>
                  <Button variant="ghost" size="sm" className="px-3 py-1 text-xs text-crypto-light hover:bg-gray-800">
                    1W
                  </Button>
                </div>
              </div>
              
              {/* Mock Chart Area */}
              <div className="h-80 bg-gradient-to-b from-crypto-darker to-crypto-dark rounded-lg border border-gray-800 relative overflow-hidden">
                <div className="absolute inset-0 flex items-end justify-between px-4 pb-4">
                  {/* Mock candlestick chart bars */}
                  {[60, 45, 75, 80, 55, 70, 85, 65, 90, 95].map((height, index) => {
                    const isPositive = Math.random() > 0.5;
                    return (
                      <div
                        key={index}
                        className={`w-2 rounded-t ${isPositive ? 'bg-crypto-success' : 'bg-crypto-danger'}`}
                        style={{ height: `${height}%` }}
                      ></div>
                    );
                  })}
                </div>
                <div className="absolute top-4 left-4 text-xs text-crypto-light">
                  Real-time Price Chart
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Bots */}
          <ActiveBots onCreateBot={() => setIsCreateBotModalOpen(true)} />
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Button 
                  onClick={() => setIsCreateBotModalOpen(true)}
                  className="w-full bg-crypto-success hover:bg-crypto-success/80 text-white font-medium transition-colors"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Create New Bot
                </Button>
                <Button className="w-full bg-crypto-accent/10 hover:bg-crypto-accent/20 text-crypto-accent border border-crypto-accent/20 font-medium transition-colors">
                  <i className="fas fa-key mr-2"></i>
                  Add Exchange API
                </Button>
                <Button variant="ghost" className="w-full border border-gray-600 hover:border-gray-500 text-crypto-light font-medium transition-colors">
                  <i className="fas fa-download mr-2"></i>
                  Export Report
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Market Overview */}
          <MarketOverview />

          {/* Recent Activity */}
          <RecentActivity />
        </div>
      </div>

      {/* Create Bot Modal */}
      <CreateBotModal
        isOpen={isCreateBotModalOpen}
        onClose={() => setIsCreateBotModalOpen(false)}
      />
    </div>
  );
}
