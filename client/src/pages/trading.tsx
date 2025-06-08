import { MarketsPanel } from "@/components/trading/markets-panel";
import { OrderBook } from "@/components/trading/order-book";
import { TradingChart } from "@/components/trading/trading-chart";
import { OrderForm } from "@/components/trading/order-form";
import { MarketTrades } from "@/components/trading/market-trades";
import { OrdersHistory } from "@/components/trading/orders-history";

export default function Trading() {
  return (
    <div className="min-h-screen bg-crypto-darker">
      <div className="flex">
        {/* Header Section - Only spans Order Book and Chart */}
        <div className="flex-1">
          <div className="bg-crypto-dark px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-white">ICP/USDT</h1>
                <span className="text-crypto-success text-xl font-semibold">5.334</span>
                <span className="text-crypto-success text-sm">24h Change</span>
                <span className="text-crypto-light text-sm">24h High</span>
                <span className="text-crypto-light text-sm">24h Low</span>
                <span className="text-crypto-light text-sm">24h Volume/ICP</span>
                <span className="text-crypto-light text-sm">24h Volume/USDT</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Panel Header - Markets Section Header */}
        <MarketsPanel className="w-80 bg-crypto-dark border-l border-gray-800" />
      </div>

      <div className="flex h-[calc(100vh-140px)]">
        {/* Left Panel - Order Book */}
        <OrderBook className="w-80 border-r border-gray-800" />

        {/* Center Panel - Chart & Trading Interface */}
        <div className="flex-1 flex flex-col">
          {/* Chart Section */}
          <TradingChart className="flex-1 border-b border-gray-800" />

          {/* Order Form Section - Full Width */}
          <OrderForm className="h-64 border-b border-gray-800" />
        </div>

        {/* Right Panel - Markets & Trades Continuation */}
        <div className="w-80 border-l border-gray-800">
          <div className="flex flex-col h-full">
            {/* Markets List Content - Continues from header */}
            <div className="flex-1 border-b border-gray-800">
              <div className="bg-crypto-dark h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl text-gray-500 mb-4">
                    <i className="fas fa-coins"></i>
                  </div>
                  <p className="text-gray-500 text-sm">Markets List</p>
                  <p className="text-gray-600 text-xs">Trading pairs display</p>
                </div>
              </div>
            </div>

            {/* Market Trades Section */}
            <MarketTrades className="flex-1" />
          </div>
        </div>
      </div>

      {/* Orders & History Section - Full Screen Width */}
      <OrdersHistory className="h-64 border-t border-gray-800" />
    </div>
  );
}