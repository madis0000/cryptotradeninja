import { useState, useEffect } from "react";
import { MarketsPanel } from "@/components/shared/markets-panel";
import { TradingHeader } from "@/components/shared/trading-header";
import { OrderBook } from "@/components/trading/order-book";
import { TradingChart } from "@/components/trading/trading-chart";
import { OrderForm } from "@/components/trading/order-form";
import { MarketTrades } from "@/components/trading/market-trades";
import { OrdersHistory } from "@/components/trading/orders-history";
import { usePublicWebSocket } from "@/hooks/useWebSocketService";

interface TickerData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

export default function Trading() {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');

  const publicWs = usePublicWebSocket({
    onMessage: (data: any) => {
      if (data && data.type === 'market_update' && data.data) {
        const marketData = data.data;
        // Update ticker data in real-time
        
        // Update ticker data for any received symbol (will be filtered by subscription)
        setTickerData({
          symbol: marketData.symbol,
          price: marketData.price,
          priceChange: marketData.priceChange,
          priceChangePercent: marketData.priceChangePercent,
          highPrice: marketData.highPrice,
          lowPrice: marketData.lowPrice,
          volume: marketData.volume,
          quoteVolume: marketData.quoteVolume
        });
        // State updated successfully
      }
    },
    onConnect: () => {
      console.log(`[TRADING] Connected to WebSocket for ${selectedSymbol} ticker`);
    },
    onDisconnect: () => {
      console.log('[TRADING] Disconnected from WebSocket');
    }
  });

  const handleSymbolSelect = (symbol: string) => {
    console.log(`[TRADING] Symbol selected: ${symbol}`);
    setSelectedSymbol(symbol);
    setTickerData(null); // Clear previous ticker data
    
    // Change subscription without reconnecting
    publicWs.subscribe([symbol]);
  };

  useEffect(() => {
    // Connect to WebSocket once
    console.log(`[TRADING] Starting WebSocket connection...`);
    publicWs.connect([selectedSymbol]);

    return () => {
      publicWs.disconnect();
    };
  }, []); // Remove selectedSymbol dependency to avoid reconnecting

  useEffect(() => {
    // Change subscription when symbol changes
    if (publicWs.status === 'connected') {
      console.log(`[TRADING] Changing subscription to ${selectedSymbol}`);
      publicWs.subscribe([selectedSymbol]);
    }
  }, [selectedSymbol, publicWs.status]);
  return (
    <div className="min-h-screen bg-crypto-darker">
      <div className="flex h-screen overflow-hidden">
        {/* Left Column */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header Section using shared component */}
          <TradingHeader 
            selectedSymbol={selectedSymbol}
            tickerData={tickerData}
          />

          {/* Main Content Row */}
          <div className="flex flex-1 min-h-0">
            {/* Left Panel - Order Book */}
            <OrderBook className="w-80 border-r border-gray-800" />

            {/* Center Panel - Chart Only */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Chart Section */}
              <TradingChart 
                className="flex-1 border-b border-gray-800 min-h-0" 
                symbol={selectedSymbol}
              />
            </div>
          </div>

          {/* Order Form Section - Dynamic Height */}
          <div className="border-b border-gray-800">
            <OrderForm className="min-h-[16rem]" symbol={selectedSymbol} />
          </div>

          {/* Orders & History Section - Dynamic Height at Bottom */}
          <div className="border-t border-gray-800">
            <OrdersHistory className="min-h-[16rem]" />
          </div>
        </div>

        {/* Right Panel - Markets using shared component */}
        <MarketsPanel 
          className="w-80"
          onSymbolSelect={handleSymbolSelect}
          selectedSymbol={selectedSymbol}
        />
      </div>
    </div>
  );
}