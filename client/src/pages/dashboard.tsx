import { useState, useEffect } from "react";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { ActiveBots } from "@/components/dashboard/active-bots";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { CreateBotModal } from "@/components/bots/create-bot-modal";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { webSocketSingleton } from "@/services/WebSocketSingleton";
import { MarketData } from "@/types";

export default function Dashboard() {
  const [isCreateBotModalOpen, setIsCreateBotModalOpen] = useState(false);
  const [currentMarketData, setCurrentMarketData] = useState<any>(null);

  // Handle WebSocket messages
  useEffect(() => {
    const unsubscribeData = webSocketSingleton.subscribe((data: any) => {
      console.log('[DASHBOARD] Received WebSocket data:', data);
      if (data.type === 'market_update') {
        setCurrentMarketData(data.data);
      } else if (data.type === 'kline_update') {
        // Handle kline data for chart updates
        setCurrentMarketData(data.data);
      }
    });

    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      console.log('[DASHBOARD] Connected to unified WebSocket');
    });

    const unsubscribeDisconnect = webSocketSingleton.onDisconnect(() => {
      console.log('[DASHBOARD] Disconnected from unified WebSocket');
    });

    return () => {
      unsubscribeData();
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, []);

  // WebSocket connection disabled since dashboard has no chart components
  useEffect(() => {
    console.log('[DASHBOARD] WebSocket connection disabled - no chart components present');
  }, []);

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
          {/* Chart Placeholder - Will be implemented later */}
          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="h-96 flex items-center justify-center border-2 border-dashed border-gray-600 rounded-lg">
                <div className="text-center">
                  <div className="text-4xl text-gray-500 mb-4">
                    <i className="fas fa-chart-line"></i>
                  </div>
                  <h3 className="text-lg font-medium text-gray-400">Chart Component</h3>
                  <p className="text-sm text-gray-500 mt-2">Trading chart will be implemented here</p>
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
