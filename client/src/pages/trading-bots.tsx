import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { TradingBot } from "@shared/schema";
import { CreateBotModal } from "@/components/bots/create-bot-modal";
import { BotCard } from "@/components/bots/bot-card";

export default function TradingBots() {
  const [isCreateBotModalOpen, setIsCreateBotModalOpen] = useState(false);

  const { data: bots, isLoading } = useQuery<TradingBot[]>({
    queryKey: ['/api/bots'],
    refetchInterval: 5000,
  });

  const activeBots = bots?.filter(bot => bot.isActive) || [];
  const inactiveBots = bots?.filter(bot => !bot.isActive) || [];

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-6">Trading Bots</h1>
        </div>
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="bg-crypto-dark border-gray-800">
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-gray-700 rounded w-1/4"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Trading Bots</h1>
          <Button 
            onClick={() => setIsCreateBotModalOpen(true)}
            className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
          >
            <i className="fas fa-plus mr-2"></i>
            Create Bot
          </Button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-crypto-light">Active Bots</p>
                  <p className="text-2xl font-bold text-white">{activeBots.length}</p>
                </div>
                <i className="fas fa-robot text-crypto-success text-2xl"></i>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-crypto-light">Total P&L</p>
                  <p className="text-2xl font-bold text-crypto-success">
                    ${bots?.reduce((acc, bot) => acc + parseFloat(bot.totalPnl), 0).toFixed(2) || '0.00'}
                  </p>
                </div>
                <i className="fas fa-chart-line text-crypto-success text-2xl"></i>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-crypto-light">Total Trades</p>
                  <p className="text-2xl font-bold text-white">
                    {bots?.reduce((acc, bot) => acc + bot.totalTrades, 0) || 0}
                  </p>
                </div>
                <i className="fas fa-exchange-alt text-crypto-accent text-2xl"></i>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Active Bots */}
      {activeBots.length > 0 && (
        <Card className="bg-crypto-dark border-gray-800 mb-8">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <span>Active Bots</span>
              <Badge variant="secondary" className="bg-crypto-success/10 text-crypto-success">
                {activeBots.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeBots.map((bot) => (
                <BotCard key={bot.id} bot={bot} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inactive Bots */}
      {inactiveBots.length > 0 && (
        <Card className="bg-crypto-dark border-gray-800 mb-8">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <span>Inactive Bots</span>
              <Badge variant="secondary" className="bg-gray-500/10 text-gray-400">
                {inactiveBots.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {inactiveBots.map((bot) => (
                <BotCard key={bot.id} bot={bot} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {(!bots || bots.length === 0) && (
        <Card className="bg-crypto-dark border-gray-800">
          <CardContent className="p-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-robot text-crypto-accent text-2xl"></i>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No Trading Bots</h3>
              <p className="text-crypto-light mb-6">Create your first trading bot to start automated trading</p>
              <Button 
                onClick={() => setIsCreateBotModalOpen(true)}
                className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
              >
                <i className="fas fa-plus mr-2"></i>
                Create Your First Bot
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Bot Modal */}
      <CreateBotModal
        isOpen={isCreateBotModalOpen}
        onClose={() => setIsCreateBotModalOpen(false)}
      />
    </div>
  );
}
