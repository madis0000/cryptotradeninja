import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface OrderFormProps {
  className?: string;
}

export function OrderForm({ className }: OrderFormProps) {
  return (
    <div className={className}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none">
        <CardHeader className="py-3 px-4 border-b border-gray-800">
          <div className="flex space-x-4">
            <button className="text-crypto-light hover:text-white text-sm">Spot</button>
            <button className="text-crypto-light hover:text-white text-sm">Cross</button>
            <button className="text-crypto-light hover:text-white text-sm">Isolated</button>
            <button className="text-crypto-light hover:text-white text-sm">Grid</button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl text-gray-500 mb-4">
                <i className="fas fa-plus-circle"></i>
              </div>
              <p className="text-gray-500 text-sm">Order Form</p>
              <p className="text-gray-600 text-xs">Buy/Sell interface - Full width</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}