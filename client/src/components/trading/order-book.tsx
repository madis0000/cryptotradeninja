import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface OrderBookProps {
  className?: string;
}

export function OrderBook({ className }: OrderBookProps) {
  return (
    <div className={className}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none flex flex-col">
        <CardHeader className="py-3 px-4 border-b border-gray-800 shrink-0">
          <CardTitle className="text-white text-sm">Order Book</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl text-gray-500 mb-4">
                <i className="fas fa-list-ul"></i>
              </div>
              <p className="text-gray-500 text-sm">Order Book</p>
              <p className="text-gray-600 text-xs">Buy/Sell orders display</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}