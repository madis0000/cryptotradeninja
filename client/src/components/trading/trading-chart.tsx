import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TradingChartProps {
  className?: string;
}

export function TradingChart({ className }: TradingChartProps) {
  return (
    <div className={className}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none">
        <CardHeader className="py-3 px-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <CardTitle className="text-white text-sm">Chart</CardTitle>
              <div className="flex space-x-2 text-xs">
                <button className="text-crypto-light hover:text-white">Info</button>
                <button className="text-crypto-light hover:text-white">Trading Data</button>
                <button className="text-crypto-light hover:text-white">Trading Analysis</button>
                <button className="text-crypto-light hover:text-white">Square</button>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <button className="text-crypto-light hover:text-white">Original</button>
              <button className="text-crypto-light hover:text-white">Trading View</button>
              <button className="text-crypto-light hover:text-white">Depth</button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-60px)]">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl text-gray-500 mb-6">
                <i className="fas fa-chart-line"></i>
              </div>
              <p className="text-gray-500">Trading Chart</p>
              <p className="text-gray-600 text-sm">Price action visualization</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}