import { useState, useEffect } from "react";
import { MarketsPanel } from "@/components/trading/markets-panel";
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
      if (data && data.type === 'market_update' && data.data && data.data.symbol === selectedSymbol) {
        const marketData = data.data;
        console.log(`[TRADING] Received ${selectedSymbol} ticker update:`, marketData);
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
      <div className="flex h-screen">
        {/* Left Column */}
        <div className="flex flex-col flex-1">
          {/* Header Section */}
          <div className="bg-crypto-dark px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <h1 className="text-2xl font-bold text-white">
                  {selectedSymbol ? `${selectedSymbol.replace('USDT', '')}/USDT` : 'BTC/USDT'}
                </h1>
                <div className="flex items-center space-x-2">
                  <span className="text-white text-xl font-semibold font-mono">
                    {tickerData ? parseFloat(tickerData.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                  </span>
                  <span className={`text-sm font-medium ${
                    tickerData && parseFloat(tickerData.priceChangePercent) > 0 
                      ? 'text-green-400' 
                      : tickerData && parseFloat(tickerData.priceChangePercent) < 0 
                        ? 'text-red-400' 
                        : 'text-gray-400'
                  }`}>
                    {tickerData ? `${parseFloat(tickerData.priceChangePercent) > 0 ? '+' : ''}${parseFloat(tickerData.priceChangePercent).toFixed(2)}%` : '--'}
                  </span>
                </div>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex flex-col">
                    <span className="text-crypto-light text-xs">24h High</span>
                    <span className="text-white font-mono">
                      {tickerData ? parseFloat(tickerData.highPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-crypto-light text-xs">24h Low</span>
                    <span className="text-white font-mono">
                      {tickerData ? parseFloat(tickerData.lowPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-crypto-light text-xs">24h Volume</span>
                    <span className="text-white font-mono">
                      {tickerData ? `${parseFloat(tickerData.volume).toFixed(2)} BTC` : '--'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-crypto-light text-xs">24h Volume (USDT)</span>
                    <span className="text-white font-mono">
                      {tickerData ? `${(parseFloat(tickerData.quoteVolume) / 1000000).toFixed(2)}M` : '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

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
          onSymbolSelect={handleSymbolSelect}
          selectedSymbol={selectedSymbol}
        />
      </div>
    </div>
  );
}