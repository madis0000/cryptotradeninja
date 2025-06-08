import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MarketTradesProps {
  className?: string;
}

export function MarketTrades({ className }: MarketTradesProps) {
  return (
    <div className={className}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none">
        <CardHeader className="py-3 px-4 border-b border-gray-800">
          <CardTitle className="text-white text-sm">Market Trades</CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-60px)]">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl text-gray-500 mb-4">
                <i className="fas fa-exchange-alt"></i>
              </div>
              <p className="text-gray-500 text-sm">Market Trades</p>
              <p className="text-gray-600 text-xs">Recent transactions</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}