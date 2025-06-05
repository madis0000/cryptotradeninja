import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { UserStats } from "@/types";

export function StatsOverview() {
  const { data: stats, isLoading } = useQuery<UserStats>({
    queryKey: ['/api/stats'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-crypto-dark border-gray-800">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-2/3"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatPercentage = (value: string) => {
    return `${parseFloat(value).toFixed(2)}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <Card className="bg-crypto-dark border-gray-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-crypto-light">Total Balance</h3>
            <i className="fas fa-wallet text-crypto-accent"></i>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-white font-mono">
              {stats ? formatCurrency(stats.totalBalance) : '$0.00'}
            </p>
            <p className="text-sm text-crypto-success">
              {stats && parseFloat(stats.totalPnl) !== 0 && (
                `${parseFloat(stats.totalPnl) > 0 ? '+' : ''}${formatCurrency(stats.totalPnl)} P&L`
              )}
            </p>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-crypto-dark border-gray-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-crypto-light">Active Bots</h3>
            <i className="fas fa-robot text-crypto-success"></i>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-white">{stats?.activeBots || 0}</p>
            <p className="text-sm text-crypto-light">Trading automatically</p>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-crypto-dark border-gray-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-crypto-light">24h P&L</h3>
            <i className="fas fa-chart-line text-crypto-success"></i>
          </div>
          <div className="space-y-1">
            <p className={`text-2xl font-bold font-mono ${
              stats && parseFloat(stats.totalPnl) >= 0 ? 'text-crypto-success' : 'text-crypto-danger'
            }`}>
              {stats && parseFloat(stats.totalPnl) !== 0 ? formatCurrency(stats.totalPnl) : '$0.00'}
            </p>
            <p className="text-sm text-crypto-light">Total P&L</p>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-crypto-dark border-gray-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-crypto-light">Win Rate</h3>
            <i className="fas fa-percentage text-crypto-warning"></i>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-white">
              {stats ? formatPercentage(stats.winRate) : '0%'}
            </p>
            <p className="text-sm text-crypto-light">
              {stats?.totalTrades || 0} total trades
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
