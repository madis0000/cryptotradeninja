import { useState, useEffect } from "react";
import { MarketsPanel } from "@/components/shared/markets-panel";
import { TradingHeader } from "@/components/shared/trading-header";
import { OrderBook } from "@/components/trading/order-book";
import { TradingChart } from "@/components/trading/trading-chart";
import { OrderForm } from "@/components/trading/order-form";
import { MarketTrades } from "@/components/trading/market-trades";
import { OrdersHistory } from "@/components/trading/orders-history";
import { webSocketSingleton } from "@/services/WebSocketSingleton";
import { useQuery } from "@tanstack/react-query";
import { 
  createSubscriptionMessage, 
  createChangeSubscriptionMessage,
  createTradingBalanceRequestMessage,
  createTradingBalanceSubscriptionMessage,
  createTradingBalanceUnsubscriptionMessage
} from "@/utils/websocket-helpers";

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

interface BalanceData {
  asset: string;
  free: string;
  locked: string;
}

export default function Trading() {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [klineData, setKlineData] = useState<any>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [currentInterval, setCurrentInterval] = useState<string>('4h');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [selectedExchangeId, setSelectedExchangeId] = useState<number | undefined>();
  
  // Balance states for trading
  const [baseBalance, setBaseBalance] = useState<BalanceData | null>(null);
  const [quoteBalance, setQuoteBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Extract base and quote assets from symbol
  const baseAsset = selectedSymbol.replace(/USDT|USDC|BUSD/g, '');
  const quoteAsset = selectedSymbol.includes('USDT') ? 'USDT' : 
                   selectedSymbol.includes('USDC') ? 'USDC' : 'BUSD';

  // Fetch exchanges for trading
  const { data: exchanges } = useQuery({
    queryKey: ['/api/exchanges']
  });

  // Auto-select first exchange if available
  useEffect(() => {
    if (exchanges && Array.isArray(exchanges) && exchanges.length > 0 && !selectedExchangeId) {
      const activeExchange = exchanges.find((ex: any) => ex.isActive);
      setSelectedExchangeId(activeExchange?.id || exchanges[0].id);
    }
  }, [exchanges, selectedExchangeId]);

  const handleExchangeChange = (exchangeId: number) => {
    setSelectedExchangeId(exchangeId);
    // TODO: Update WebSocket subscriptions for the new exchange
    console.log(`[TRADING] Exchange changed to: ${exchangeId}`);
  };

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

      // Handle balance updates for trading
      if (data && data.type === 'trading_balance_update' && data.exchangeId === selectedExchangeId) {
        console.log('[TRADING] Received trading balance update:', data);
        setBalanceLoading(false);
        setBalanceError(null);
        
        if (data.baseBalance) {
          setBaseBalance(data.baseBalance);
        }
        if (data.quoteBalance) {
          setQuoteBalance(data.quoteBalance);
        }
      }

      // Handle balance errors
      if (data && data.type === 'balance_error') {
        console.error('[TRADING] Balance error:', data.error);
        setBalanceLoading(false);
        setBalanceError(data.error);
      }

      // Handle ticker updates for price display
      if (data && data.type === 'ticker_update' && data.data) {
        const tickerUpdate = data.data;
        if (tickerUpdate.symbol === selectedSymbol) {
          setTickerData(prev => ({
            ...prev,
            symbol: tickerUpdate.symbol,
            price: tickerUpdate.price,
            priceChange: tickerUpdate.priceChange,
            priceChangePercent: tickerUpdate.priceChangePercent,
            highPrice: tickerUpdate.highPrice,
            lowPrice: tickerUpdate.lowPrice,
            volume: tickerUpdate.volume,
            quoteVolume: tickerUpdate.quoteVolume
          }));
        }
      }
    });

    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      setConnectionStatus('connected');
      console.log('[TRADING] Connected to unified WebSocket server');
      
      // Request initial balance data when connected
      if (selectedExchangeId) {
        requestTradingBalances();
      }
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
  }, [selectedExchangeId, selectedSymbol]);

  // Function to request trading balances
  const requestTradingBalances = () => {
    if (!selectedExchangeId || !webSocketSingleton.isConnected()) {
      console.log('[TRADING] Cannot request balances - no exchange selected or WebSocket not connected');
      return;
    }

    setBalanceLoading(true);
    setBalanceError(null);
    
    console.log(`[TRADING] Requesting trading balances for ${selectedSymbol} on exchange ${selectedExchangeId}`);
    
    // Subscribe to balance updates for this symbol
    webSocketSingleton.sendMessage(
      createTradingBalanceSubscriptionMessage(selectedSymbol, selectedExchangeId)
    );
    
    // Request initial balance data
    webSocketSingleton.sendMessage(
      createTradingBalanceRequestMessage(selectedSymbol, selectedExchangeId)
    );
  };

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
      if (webSocketSingleton.isConnected() && selectedExchangeId) {
        console.log(`[TRADING] Setting up initial subscriptions for ${selectedSymbol} on exchange ${selectedExchangeId}`);
        webSocketSingleton.sendMessage(createChangeSubscriptionMessage(selectedSymbol, currentInterval, selectedExchangeId));
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
    if (webSocketSingleton.isConnected() && selectedExchangeId) {
      console.log(`[TRADING] Changing subscription to ${selectedSymbol} at ${currentInterval} on exchange ${selectedExchangeId}`);
      webSocketSingleton.sendMessage(createChangeSubscriptionMessage(selectedSymbol, currentInterval, selectedExchangeId));
    } else {
      console.log(`[TRADING] WebSocket not connected or no exchange selected, cannot change subscription to ${selectedSymbol}`);
    }
  }, [selectedSymbol, currentInterval, selectedExchangeId]);
  return (
    <div className="min-h-screen bg-crypto-darker">
      <div className="flex h-screen overflow-hidden">
        {/* Left Panel - Order Book */}
        <div className="w-80 shrink-0">
          <OrderBook className="h-full border-r border-gray-800" />
        </div>

        {/* Center Column - Main Trading Area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header Section */}
          <div className="shrink-0">
            <TradingHeader 
              selectedSymbol={selectedSymbol}
              tickerData={tickerData}
              selectedExchangeId={selectedExchangeId}
              onExchangeChange={handleExchangeChange}
            />
          </div>

          {/* Main Content Row */}
          <div className="flex flex-1 min-h-0">
            {/* Left Side - Chart and Orders History */}
            <div className="flex flex-col flex-1 min-w-0">
              {/* Chart Section */}
              <div className="flex-1 min-h-0">
                <TradingChart 
                  className="h-full" 
                  symbol={selectedSymbol}
                  klineData={klineData}
                  onIntervalChange={handleIntervalChange}
                />
              </div>

              {/* Orders & History Section - Under Chart */}
              <div className="h-64 shrink-0 border-t border-gray-800">
                <OrdersHistory className="h-full" />
              </div>
            </div>

            {/* Right Sidebar - Order Form and Markets */}
            <div className="w-80 shrink-0 border-l border-gray-800 flex flex-col">
              {/* Order Form Section */}
              <div className="h-96 shrink-0">
                <OrderForm className="h-full" symbol={selectedSymbol} exchangeId={selectedExchangeId} />
              </div>
              
              {/* Markets Panel Section */}
              <div className="flex-1 min-h-0 border-t border-gray-800">
                <MarketsPanel 
                  className="h-full"
                  onSymbolSelect={handleSymbolSelect}
                  selectedSymbol={selectedSymbol}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}