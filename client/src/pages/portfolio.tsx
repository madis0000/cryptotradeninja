import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Portfolio, TradingBot } from "@shared/schema";
import { UserStats } from "@/types";

export default function PortfolioPage() {
  const { data: portfolio, isLoading: portfolioLoading } = useQuery<Portfolio[]>({
    queryKey: ['/api/portfolio'],
    refetchInterval: 10000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['/api/stats'],
    refetchInterval: 10000,
  });

  const { data: bots, isLoading: botsLoading } = useQuery<TradingBot[]>({
    queryKey: ['/api/bots'],
    refetchInterval: 10000,
  });

  const isLoading = portfolioLoading || statsLoading || botsLoading;

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatCrypto = (amount: string, symbol: string) => {
    const num = parseFloat(amount);
    return `${num.toFixed(6)} ${symbol}`;
  };

  const calculatePortfolioValue = () => {
    if (!portfolio) return 0;
    return portfolio.reduce((total, item) => {
      return total + (parseFloat(item.amount) * parseFloat(item.averagePrice));
    }, 0);
  };

  const getTotalInvestment = () => {
    if (!bots) return 0;
    return bots.reduce((total, bot) => total + parseFloat(bot.investmentAmount), 0);
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Portfolio</h1>
        <div className="space-y-6">
          {[...Array(4)].map((_, i) => (
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

  const portfolioValue = calculatePortfolioValue();
  const totalInvestment = getTotalInvestment();
  const totalPnl = parseFloat(stats?.totalPnl || "0");
  const unrealizedPnl = portfolioValue - totalInvestment;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-6">Portfolio Overview</h1>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-crypto-light">Total Value</h3>
                <i className="fas fa-wallet text-crypto-accent"></i>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-white font-mono">
                  {formatCurrency(portfolioValue)}
                </p>
                <p className="text-sm text-crypto-light">Current portfolio value</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-crypto-light">Total Investment</h3>
                <i className="fas fa-chart-pie text-crypto-warning"></i>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-white font-mono">
                  {formatCurrency(totalInvestment)}
                </p>
                <p className="text-sm text-crypto-light">Amount invested</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-crypto-light">Realized P&L</h3>
                <i className="fas fa-chart-line text-crypto-success"></i>
              </div>
              <div className="space-y-1">
                <p className={`text-2xl font-bold font-mono ${
                  totalPnl >= 0 ? 'text-crypto-success' : 'text-crypto-danger'
                }`}>
                  {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
                </p>
                <p className="text-sm text-crypto-light">From trading bots</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-crypto-light">Unrealized P&L</h3>
                <i className="fas fa-clock text-crypto-neutral"></i>
              </div>
              <div className="space-y-1">
                <p className={`text-2xl font-bold font-mono ${
                  unrealizedPnl >= 0 ? 'text-crypto-success' : 'text-crypto-danger'
                }`}>
                  {unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(unrealizedPnl)}
                </p>
                <p className="text-sm text-crypto-light">Unrealized gains/losses</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Asset Holdings */}
        <Card className="bg-crypto-dark border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Asset Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolio && portfolio.length > 0 ? (
              <div className="space-y-4">
                {portfolio.map((asset) => {
                  const value = parseFloat(asset.amount) * parseFloat(asset.averagePrice);
                  const percentOfTotal = portfolioValue > 0 ? (value / portfolioValue) * 100 : 0;
                  
                  return (
                    <div key={asset.id} className="flex items-center justify-between p-4 border border-gray-800 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-crypto-accent/10 rounded-lg flex items-center justify-center">
                          <span className="text-crypto-accent font-bold text-sm">
                            {asset.asset.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{asset.asset}</h3>
                          <p className="text-sm text-crypto-light">
                            {formatCrypto(asset.amount, asset.asset)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-white">{formatCurrency(value)}</p>
                        <p className="text-sm text-crypto-light">
                          {percentOfTotal.toFixed(1)}% of portfolio
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-coins text-crypto-accent text-2xl"></i>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Assets</h3>
                <p className="text-crypto-light">Your asset holdings will appear here once you start trading</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bot Performance */}
        <Card className="bg-crypto-dark border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Bot Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {bots && bots.length > 0 ? (
              <div className="space-y-4">
                {bots.map((bot) => {
                  const pnl = parseFloat(bot.totalPnl);
                  const roi = (pnl / parseFloat(bot.investmentAmount)) * 100;
                  
                  return (
                    <div key={bot.id} className="flex items-center justify-between p-4 border border-gray-800 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          bot.isActive ? 'bg-crypto-success/10' : 'bg-gray-500/10'
                        }`}>
                          <i className={`fas fa-robot ${
                            bot.isActive ? 'text-crypto-success' : 'text-gray-400'
                          }`}></i>
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{bot.name}</h3>
                          <p className="text-sm text-crypto-light">
                            {bot.tradingPair} • {bot.strategy}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono ${pnl >= 0 ? 'text-crypto-success' : 'text-crypto-danger'}`}>
                          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                        </p>
                        <p className={`text-sm ${roi >= 0 ? 'text-crypto-success' : 'text-crypto-danger'}`}>
                          {roi >= 0 ? '+' : ''}{roi.toFixed(2)}% ROI
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-robot text-crypto-accent text-2xl"></i>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Trading Bots</h3>
                <p className="text-crypto-light">Create trading bots to start building your portfolio</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
