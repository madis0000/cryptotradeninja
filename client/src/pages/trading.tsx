import { Card, CardContent } from "@/components/ui/card";

export default function Trading() {
  return (
    <div className="min-h-screen bg-crypto-darker p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Trading</h1>
          <p className="text-crypto-light">Execute trades, monitor positions, and manage your trading activities</p>
        </div>

        {/* Placeholder Content */}
        <Card className="bg-crypto-dark border-gray-800">
          <CardContent className="p-12">
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl text-gray-500 mb-6">
                  <i className="fas fa-chart-bar"></i>
                </div>
                <h2 className="text-2xl font-bold text-gray-400 mb-4">Trading Interface</h2>
                <p className="text-gray-500 max-w-md">
                  This page will contain trading interfaces, order placement, position management, 
                  and real-time market data visualization.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}