import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface OrdersHistoryProps {
  className?: string;
}

export function OrdersHistory({ className }: OrdersHistoryProps) {
  return (
    <div className={`${className} relative z-10`}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none">
        <CardHeader className="py-3 px-4 border-b border-gray-800">
          <div className="flex space-x-4 text-xs">
            <button className="text-crypto-accent">Open Orders(0)</button>
            <button className="text-crypto-light hover:text-white">Order History</button>
            <button className="text-crypto-light hover:text-white">Trade History</button>
            <button className="text-crypto-light hover:text-white">Funds</button>
            <button className="text-crypto-light hover:text-white">Grid Orders</button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl text-gray-500 mb-4">
                <i className="fas fa-history"></i>
              </div>
              <p className="text-gray-500 text-sm">Orders & History</p>
              <p className="text-gray-600 text-xs">Trading activity - Full screen width</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}