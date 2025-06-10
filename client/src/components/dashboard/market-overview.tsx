import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { MarketData } from "@/types";

const cryptoLogos: { [key: string]: { bg: string; symbol: string } } = {
  'BTC/USDT': { bg: 'bg-orange-500', symbol: '₿' },
  'ETH/USDT': { bg: 'bg-blue-500', symbol: 'Ξ' },
  'ADA/USDT': { bg: 'bg-green-500', symbol: '₳' },
  'BNB/USDT': { bg: 'bg-yellow-500', symbol: 'B' },
  'SOL/USDT': { bg: 'bg-red-500', symbol: 'S' },
};

interface MarketDataResponse {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  timestamp: number;
}

export function MarketOverview() {
  const { data: marketData, isLoading } = useQuery<MarketDataResponse[]>({
    queryKey: ['/api/market'],
  });

  if (isLoading) {
    return (
      <Card className="bg-crypto-dark border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Market Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-700 rounded-full"></div>
                  <div className="space-y-1">
                    <div className="h-4 bg-gray-700 rounded w-12"></div>
                    <div className="h-3 bg-gray-700 rounded w-16"></div>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="h-4 bg-gray-700 rounded w-20"></div>
                  <div className="h-3 bg-gray-700 rounded w-12"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatPrice = (priceStr: string) => {
    const price = parseFloat(priceStr);
    if (isNaN(price)) return '$0.00';
    
    if (price < 1) {
      return `$${price.toFixed(4)}`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatChange = (changeStr: string | undefined) => {
    if (!changeStr) return '0.00%';
    const change = parseFloat(changeStr);
    if (isNaN(change)) return '0.00%';
    
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  return (
    <Card className="bg-crypto-dark border-gray-800">
      <CardHeader>
        <CardTitle className="text-white">Market Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {marketData && marketData.map((data) => {
            // Convert symbol format (DOGEUSDT -> DOGE/USDT)
            const baseAsset = data.symbol.replace('USDT', '');
            const pair = `${baseAsset}/USDT`;
            const logo = cryptoLogos[pair];
            const isPositive = parseFloat(data.priceChangePercent) >= 0;
            
            return (
              <div key={data.symbol} className="flex items-center justify-between py-3">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 ${logo?.bg || 'bg-gray-500'} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                    {logo?.symbol || baseAsset[0]}
                  </div>
                  <div>
                    <p className="font-medium text-white">{baseAsset}</p>
                    <p className="text-xs text-crypto-light">{pair.replace('/', ' / ')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-white">{formatPrice(data.price)}</p>
                  <p className={`text-xs ${isPositive ? 'text-crypto-success' : 'text-crypto-danger'}`}>
                    {formatChange(data.priceChangePercent)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
