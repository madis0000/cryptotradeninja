import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Trade } from "@shared/schema";

export function RecentActivity() {
  const { data: trades, isLoading } = useQuery<Trade[]>({
    queryKey: ['/api/trades'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <Card className="bg-crypto-dark border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-gray-700 rounded-full"></div>
                <div className="flex-1 space-y-1">
                  <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const recentTrades = trades?.slice(0, 10) || [];

  const getActivityIcon = (side: string) => {
    return side === 'buy' ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
  };

  const getActivityColor = (side: string) => {
    return side === 'buy' ? 'text-crypto-success' : 'text-crypto-danger';
  };

  const getActivityBg = (side: string) => {
    return side === 'buy' ? 'bg-crypto-success/10' : 'bg-crypto-danger/10';
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatAmount = (amount: string) => {
    return parseFloat(amount).toFixed(6);
  };

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(parseFloat(price));
  };

  return (
    <Card className="bg-crypto-dark border-gray-800">
      <CardHeader>
        <CardTitle className="text-white">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {recentTrades.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-history text-crypto-accent text-2xl"></i>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Recent Activity</h3>
            <p className="text-crypto-light">Your trading activity will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentTrades.map((trade) => (
              <div key={trade.id} className="flex items-start space-x-3">
                <div className={`w-8 h-8 ${getActivityBg(trade.side)} rounded-full flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <i className={`${getActivityIcon(trade.side)} ${getActivityColor(trade.side)} text-xs`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">
                    {trade.side.toUpperCase()} order executed
                  </p>
                  <p className="text-xs text-crypto-light">
                    {formatAmount(trade.amount)} {trade.tradingPair.split('/')[0]} @ {formatPrice(trade.price)} • {formatTime(trade.executedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded ${
                    trade.status === 'filled' 
                      ? 'bg-crypto-success/10 text-crypto-success'
                      : trade.status === 'pending'
                      ? 'bg-yellow-500/10 text-yellow-500'
                      : 'bg-crypto-danger/10 text-crypto-danger'
                  }`}>
                    {trade.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
