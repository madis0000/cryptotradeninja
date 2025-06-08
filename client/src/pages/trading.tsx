import { useState } from "react";
import { MarketsPanel } from "@/components/trading/markets-panel";
import { OrderBook } from "@/components/trading/order-book";
import { TradingChart } from "@/components/trading/trading-chart";
import { OrderForm } from "@/components/trading/order-form";
import { MarketTrades } from "@/components/trading/market-trades";
import { OrdersHistory } from "@/components/trading/orders-history";
import { TradingHeader } from "@/components/trading/trading-header";

export default function Trading() {
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");

  return (
    <div className="min-h-screen bg-crypto-darker">
      <div className="flex h-screen">
        {/* Left Column */}
        <div className="flex flex-col flex-1">
          {/* Header Section */}
          <TradingHeader selectedSymbol={selectedSymbol} onSymbolChange={setSelectedSymbol} />

          {/* Main Content Row */}
          <div className="flex flex-1">
            {/* Left Panel - Order Book */}
            <OrderBook className="w-80 border-r border-gray-800" />

            {/* Center Panel - Chart & Trading Interface */}
            <div className="flex-1 flex flex-col">
              {/* Chart Section */}
              <TradingChart className="flex-1 border-b border-gray-800" />

              {/* Order Form Section - Full Width */}
              <OrderForm className="h-64 border-b border-gray-800" />
            </div>
          </div>

          {/* Orders & History Section - Full Screen Width */}
          <OrdersHistory className="h-64 border-t border-gray-800" />
        </div>

        {/* Right Panel - Markets */}
        <MarketsPanel 
          className="w-80 bg-crypto-dark border-l border-gray-800" 
          selectedSymbol={selectedSymbol}
          onSymbolSelect={setSelectedSymbol}
        />
      </div>
    </div>
  );
}