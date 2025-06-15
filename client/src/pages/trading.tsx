import { useState, useEffect } from "react";
import { MarketsPanel } from "@/components/shared/markets-panel";
import { TradingHeader } from "@/components/shared/trading-header";
import { OrderBook } from "@/components/trading/order-book";
import { TradingChart } from "@/components/trading/trading-chart";
import { OrderForm } from "@/components/trading/order-form";
import { MarketTrades } from "@/components/trading/market-trades";
import { OrdersHistory } from "@/components/trading/orders-history";
import { webSocketSingleton } from "@/services/WebSocketSingleton";

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
  const [klineData, setKlineData] = useState<any>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [currentInterval, setCurrentInterval] = useState<string>('4h');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  // Handle WebSocket messages
  useEffect(() => {
    const unsubscribeData = webSocketSingleton.subscribe((data: any) => {
      if (data && data.type === 'market_update' && data.data) {
        const marketData = data.data;
        // Update ticker data in real-time
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
      
      // Handle kline data for the chart
      if (data && data.type === 'kline_update' && data.data) {
        console.log('[TRADING] Received kline data for chart:', data.data);
        setKlineData(data.data);
      }
      
      // Handle historical klines for the chart
      if (data && data.type === 'historical_klines' && data.data) {
        console.log('[TRADING] Received historical klines for chart:', data.data.klines?.length || 0, 'candles');
        // Set a flag to indicate we're receiving historical data
        setKlineData({
          type: 'historical_batch',
          symbol: data.data.symbol,
          interval: data.data.interval,
          klines: data.data.klines
        });
      }
    });

    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      setConnectionStatus('connected');
      console.log('[TRADING] Connected to unified WebSocket server');
    });

    const unsubscribeDisconnect = webSocketSingleton.onDisconnect(() => {
      setConnectionStatus('disconnected');
      console.log('[TRADING] Disconnected from unified WebSocket server');
    });

    const unsubscribeError = webSocketSingleton.onError(() => {
      setConnectionStatus('error');
    });

    // Set initial status
    setConnectionStatus(webSocketSingleton.getStatus() as any);

    return () => {
      unsubscribeData();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, []);

  const handleSymbolSelect = (symbol: string) => {
    console.log(`[TRADING] Symbol selected: ${symbol}`);
    setSelectedSymbol(symbol);
    setTickerData(null); // Clear previous ticker data
    setKlineData(null); // Clear previous kline data
    
    // Note: Symbol change will be handled by the useEffect below
  };

  const handleIntervalChange = (interval: string) => {
    console.log(`[TRADING] Interval changed to: ${interval}`);
    setCurrentInterval(interval);
    setKlineData(null); // Clear previous kline data when interval changes
  };

  useEffect(() => {
    // Connect to unified WebSocket server ONCE and add reference
    console.log(`[TRADING] Starting unified WebSocket connection...`);
    
    // Add reference for this component instance
    webSocketSingleton.addReference();
    
    if (!webSocketSingleton.isConnected()) {
      webSocketSingleton.connect();
    }
    
    // Setup initial subscriptions once connected
    const setupSubscriptions = () => {
      if (webSocketSingleton.isConnected()) {
        console.log(`[TRADING] Setting up initial subscriptions for ${selectedSymbol}`);
        webSocketSingleton.changeSymbolSubscription(selectedSymbol, currentInterval);
      }
    };

    let unsubscribeConnect: (() => void) | undefined;

    // If already connected, setup subscriptions immediately
    if (webSocketSingleton.isConnected()) {
      setupSubscriptions();
    } else {
      // Wait for connection
      unsubscribeConnect = webSocketSingleton.onConnect(() => {
        setupSubscriptions();
      });
    }

    // Cleanup function - ALWAYS executed when component unmounts
    return () => {
      console.log('[TRADING] Trading page unmounting, cleaning up WebSocket connection');
      
      // Clean up connection listener if it exists
      if (unsubscribeConnect) {
        unsubscribeConnect();
      }
      
      // Send unsubscribe message if connected
      if (webSocketSingleton.isConnected()) {
        console.log('[TRADING] Sending unsubscribe message');
        webSocketSingleton.unsubscribe();
      }
      
      // Remove reference to allow cleanup
      console.log('[TRADING] Removing WebSocket reference');
      webSocketSingleton.removeReference();
    };
  }, []); // Empty dependency array - only run once on mount and cleanup on unmount

  useEffect(() => {
    // Change subscription when symbol changes (but not on initial mount)
    if (webSocketSingleton.isConnected()) {
      console.log(`[TRADING] Changing subscription to ${selectedSymbol} at ${currentInterval}`);
      webSocketSingleton.changeSymbolSubscription(selectedSymbol, currentInterval);
    } else {
      console.log(`[TRADING] WebSocket not connected, cannot change subscription to ${selectedSymbol}`);
    }
  }, [selectedSymbol, currentInterval]);
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

            {/* Center Panel - Chart & Trading Interface */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Chart Section */}
              <TradingChart 
                className="flex-1 border-b border-gray-800 min-h-0" 
                symbol={selectedSymbol}
                klineData={klineData}
                onIntervalChange={handleIntervalChange}
              />

              {/* Order Form Section - Fixed Height */}
              <div className="h-64 border-b border-gray-800">
                <OrderForm className="h-full" symbol={selectedSymbol} />
              </div>
            </div>
          </div>

          {/* Orders & History Section - Fixed Height at Bottom */}
          <div className="h-64 border-t border-gray-800">
            <OrdersHistory className="h-full" />
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