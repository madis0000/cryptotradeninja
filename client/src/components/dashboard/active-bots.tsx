import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { TradingBot } from "@shared/schema";
import { BotCard } from "@/components/bots/bot-card";

interface ActiveBotsProps {
  onCreateBot: () => void;
}

export function ActiveBots({ onCreateBot }: ActiveBotsProps) {
  const { data: bots, isLoading } = useQuery<TradingBot[]>({
    queryKey: ['/api/bots'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <Card className="bg-crypto-dark border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Active Trading Bots</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-4">
                <div className="animate-pulse">
                  <div className="flex items-center space-x-4 mb-3">
                    <div className="w-10 h-10 bg-gray-700 rounded-lg"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-700 rounded w-32"></div>
                      <div className="h-3 bg-gray-700 rounded w-24"></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-8 bg-gray-700 rounded"></div>
                    <div className="h-8 bg-gray-700 rounded"></div>
                    <div className="h-8 bg-gray-700 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeBots = bots?.filter(bot => bot.isActive) || [];

  return (
    <Card className="bg-crypto-dark border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">Active Trading Bots</CardTitle>
          <Button 
            onClick={onCreateBot}
            className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
          >
            <i className="fas fa-plus mr-2"></i>
            Create Bot
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activeBots.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-robot text-crypto-accent text-2xl"></i>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Active Bots</h3>
            <p className="text-crypto-light mb-4">Create your first trading bot to start automated trading</p>
            <Button 
              onClick={onCreateBot}
              className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
            >
              Create Your First Bot
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {activeBots.map((bot) => (
              <BotCard key={bot.id} bot={bot} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
