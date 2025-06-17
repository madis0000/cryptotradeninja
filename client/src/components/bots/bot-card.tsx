import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TradingBot } from "@shared/schema";

interface BotCardProps {
  bot: TradingBot;
}

export function BotCard({ bot }: BotCardProps) {
  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case 'grid':
        return 'fas fa-th';
      case 'martingale':
        return 'fas fa-chart-line';
      case 'dca':
        return 'fas fa-calendar-alt';
      default:
        return 'fas fa-robot';
    }
  };

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'grid':
        return 'text-crypto-accent bg-crypto-accent/10';
      case 'martingale':
        return 'text-purple-400 bg-purple-400/10';
      case 'dca':
        return 'text-crypto-warning bg-crypto-warning/10';
      default:
        return 'text-crypto-success bg-crypto-success/10';
    }
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatPercentage = (value: string) => {
    const num = parseFloat(value);
    const sign = num >= 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  };

  const isProfit = parseFloat(bot.totalPnl || '0') >= 0;

  return (
    <Card className="border border-gray-800 hover:border-crypto-accent/30 transition-colors bg-crypto-darker">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getStrategyColor(bot.strategy)}`}>
              <i className={getStrategyIcon(bot.strategy)}></i>
            </div>
            <div>
              <h3 className="font-semibold text-white">{bot.name}</h3>
              <p className="text-sm text-crypto-light">
                {bot.tradingPair} • {bot.strategy.charAt(0).toUpperCase() + bot.strategy.slice(1)} Strategy
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-mono ${isProfit ? 'text-crypto-success' : 'text-crypto-danger'}`}>
              {formatCurrency(bot.totalPnl || '0')}
            </p>
            <p className="text-sm text-crypto-light">
              {formatPercentage(bot.winRate || '0')} win rate
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-crypto-success rounded-full animate-pulse"></span>
            <Button variant="ghost" size="sm" className="text-crypto-light hover:text-white p-1">
              <i className="fas fa-cog"></i>
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-800">
          <div>
            <p className="text-crypto-light text-xs uppercase tracking-wide">Investment</p>
            <p className="text-white font-medium">{formatCurrency(bot.baseOrderAmount || '0')}</p>
            <p className="text-sm text-muted-foreground">
              Investment: ${bot.baseOrderAmount}
            </p>
          </div>
          <div>
            <p className="text-crypto-light text-xs uppercase tracking-wide">Total Trades</p>
            <p className="text-white font-medium">{bot.totalTrades || 0}</p>
          </div>
          <div>
            <p className="text-crypto-light text-xs uppercase tracking-wide">Status</p>
            <div className="flex items-center space-x-1">
              <span className="w-2 h-2 bg-crypto-success rounded-full"></span>
              <span className="text-crypto-success text-sm font-medium">Active</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
