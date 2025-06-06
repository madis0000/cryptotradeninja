import { useState, useEffect } from "react";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { ActiveBots } from "@/components/dashboard/active-bots";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { CreateBotModal } from "@/components/bots/create-bot-modal";
import { TradingChart } from "@/components/charts/trading-chart";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePublicWebSocket } from "@/hooks/useWebSocketService";
import { MarketData } from "@/types";

export default function Dashboard() {
  const [isCreateBotModalOpen, setIsCreateBotModalOpen] = useState(false);
  const [currentMarketData, setCurrentMarketData] = useState<any>(null);

  // WebSocket connection for real-time updates
  const { connect, disconnect, status } = usePublicWebSocket({
    onMessage: (data) => {
      if (data.type === 'market_update') {
        setCurrentMarketData(data.data);
      }
    },
    onConnect: () => {
      console.log('[DASHBOARD] Connected to WebSocket');
    },
    onDisconnect: () => {
      console.log('[DASHBOARD] Disconnected from WebSocket');
    }
  });

  // Auto-connect to WebSocket when component mounts
  useEffect(() => {
    connect(['BTCUSDT']);
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-6">Trading Dashboard</h1>
        <StatsOverview />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="xl:col-span-2 space-y-6">
          {/* TradingView Real-time Chart */}
          <TradingChart 
            symbol="BTCUSDT" 
            marketData={currentMarketData}
            className="w-full"
          />

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
