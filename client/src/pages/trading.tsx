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
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
import { 
  createSubscriptionMessage, 
  createChangeSubscriptionMessage,
  createTradingBalanceRequestMessage,
  createTradingBalanceSubscriptionMessage,
  createTradingBalanceUnsubscriptionMessage,
  createOpenOrdersRequestMessage,
  createOpenOrdersSubscriptionMessage,
  createOpenOrdersUnsubscriptionMessage
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

interface OpenOrderData {
  orderId: number;  // Binance returns orderId as number
  clientOrderId: string;
  symbol: string;
  side: string;
  type: string;
  timeInForce: string;
  quantity: string;
  price: string;
  stopPrice?: string;
  status: string;
  time: number;
  updateTime: number;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
}

export default function Trading() {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [klineData, setKlineData] = useState<any>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [currentInterval, setCurrentInterval] = useState<string>('4h');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');  const [selectedExchangeId, setSelectedExchangeId] = useState<number | undefined>();
  
  // Balance states for trading
  const [baseBalance, setBaseBalance] = useState<BalanceData | null>(null);
  const [quoteBalance, setQuoteBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
    // Open orders states
  const [openOrders, setOpenOrders] = useState<OpenOrderData[]>([]);
  const [openOrdersLoading, setOpenOrdersLoading] = useState<boolean>(false);
  const [openOrdersError, setOpenOrdersError] = useState<string | null>(null);
  
  // Initialize order notifications hook for sound notifications
  useOrderNotifications();
  
  // Order execution tracking
  const [lastOrderStatus, setLastOrderStatus] = useState<string | null>(null);
  const [orderHistory, setOrderHistory] = useState<Array<{
    orderId: string;
    symbol: string;
    side: string;
    type: string;
    quantity: string;
    price?: string;
    status: string;
    timestamp: number;
  }>>([]);
  // Enhanced asset extraction logic to handle various trading pairs
  const getAssetPair = (symbol: string) => {
    // Common quote assets in order of preference
    const quoteAssets = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB'];
    
    for (const quote of quoteAssets) {
      if (symbol.endsWith(quote)) {
        return {
          baseAsset: symbol.slice(0, -quote.length),
          quoteAsset: quote
        };
      }
    }
    
    // Fallback: assume last 3-4 characters are quote asset
    if (symbol.length > 6) {
      return {
        baseAsset: symbol.slice(0, -4),
        quoteAsset: symbol.slice(-4)
      };
    } else {
      return {
        baseAsset: symbol.slice(0, -3),
        quoteAsset: symbol.slice(-3)
      };
    }
  };
  // Extract base and quote assets from symbol
  const { baseAsset, quoteAsset } = getAssetPair(selectedSymbol);
  
  // Debug logging for asset extraction
  console.log(`[TRADING PAGE] Symbol: ${selectedSymbol} -> Base: ${baseAsset}, Quote: ${quoteAsset}`);

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
  }, [exchanges, selectedExchangeId]);  // Function to fetch trading balances via API (similar to martingale strategy)
  const fetchTradingBalances = async () => {
    if (!selectedExchangeId) {
      console.log('[MANUAL TRADING] Cannot fetch balances - no exchange selected');
      return;
    }

    setBalanceLoading(true);
    setBalanceError(null);
    
    console.log(`[MANUAL TRADING] ===== FETCHING TRADING BALANCES =====`);
    console.log(`[MANUAL TRADING] 📊 BALANCE REQUEST:`);
    console.log(`[MANUAL TRADING]    Symbol: ${selectedSymbol}`);
    console.log(`[MANUAL TRADING]    Exchange ID: ${selectedExchangeId}`);
    console.log(`[MANUAL TRADING]    Base Asset: ${baseAsset}`);
    console.log(`[MANUAL TRADING]    Quote Asset: ${quoteAsset}`);
      try {
      const response = await fetch(`/api/exchanges/${selectedExchangeId}/balance`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const result = await response.json();
      
      if (response.ok && result.balances) {
        console.log(`[MANUAL TRADING] ✅ BALANCE FETCH SUCCESSFUL:`);
        console.log(`[MANUAL TRADING]    Total Assets: ${result.balances.length}`);
        
        const baseBalance = result.balances.find((balance: any) => balance.asset === baseAsset);
        const quoteBalance = result.balances.find((balance: any) => balance.asset === quoteAsset);
        
        console.log(`[MANUAL TRADING] 💰 ${baseAsset} BALANCE:`, baseBalance || { asset: baseAsset, free: '0.00000000', locked: '0.00000000' });
        console.log(`[MANUAL TRADING]    Available: ${baseBalance?.free || '0.00000000'} ${baseAsset}`);
        console.log(`[MANUAL TRADING]    Locked: ${baseBalance?.locked || '0.00000000'} ${baseAsset}`);
        
        console.log(`[MANUAL TRADING] 💰 ${quoteAsset} BALANCE:`, quoteBalance || { asset: quoteAsset, free: '0.00000000', locked: '0.00000000' });
        console.log(`[MANUAL TRADING]    Available: ${quoteBalance?.free || '0.00000000'} ${quoteAsset}`);
        console.log(`[MANUAL TRADING]    Locked: ${quoteBalance?.locked || '0.00000000'} ${quoteAsset}`);
        
        setBaseBalance(baseBalance || { asset: baseAsset, free: '0.00000000', locked: '0.00000000' });
        setQuoteBalance(quoteBalance || { asset: quoteAsset, free: '0.00000000', locked: '0.00000000' });
        setBalanceError(null);
        
        console.log(`[MANUAL TRADING] ===== BALANCE FETCH COMPLETED =====`);
      } else {
        throw new Error(result.error || 'Failed to fetch balances');
      }
    } catch (error) {
      console.log(`[MANUAL TRADING] ❌ BALANCE FETCH ERROR:`);
      console.log(`[MANUAL TRADING]    Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setBalanceError(error instanceof Error ? error.message : 'Failed to fetch balances');
    } finally {
      setBalanceLoading(false);
    }
  };
  // Function to fetch open orders via API
  const fetchOpenOrders = async () => {
    if (!selectedExchangeId) {
      console.log('[UNIFIED WS OPEN ORDERS] Cannot fetch open orders - no exchange selected');
      setOpenOrdersLoading(false);
      return;
    }

    console.log(`[UNIFIED WS OPEN ORDERS] ===== FETCHING OPEN ORDERS =====`);
    console.log(`[UNIFIED WS OPEN ORDERS] 📊 OPEN ORDERS REQUEST:`);
    console.log(`[UNIFIED WS OPEN ORDERS]    Exchange ID: ${selectedExchangeId}`);
    console.log(`[UNIFIED WS OPEN ORDERS]    Requesting ALL open orders (no symbol filter)`);
    console.log(`[UNIFIED WS OPEN ORDERS]    Current symbol: ${selectedSymbol} (for display context only)`);
    
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('[UNIFIED WS OPEN ORDERS] ❌ No authentication token found');
      setOpenOrdersError('Authentication required');
      setOpenOrdersLoading(false);
      return;
    }
    console.log(`[UNIFIED WS OPEN ORDERS]    Token exists: ${!!token}, length: ${token.length}`);
    
    // Store the exchange ID at the start of the request to validate response
    const requestExchangeId = selectedExchangeId;
    
    try {
      // Don't filter by symbol - get ALL open orders for the exchange
      const response = await fetch(`/api/exchanges/${requestExchangeId}/orders/open`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log(`[UNIFIED WS OPEN ORDERS] 📡 Response status: ${response.status} ${response.statusText}`);
      console.log(`[UNIFIED WS OPEN ORDERS] 📡 Response headers:`, Object.fromEntries(response.headers.entries()));
      
      let result;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const textResult = await response.text();
        console.log(`[UNIFIED WS OPEN ORDERS] ❌ Non-JSON response received:`, textResult.substring(0, 200));
        throw new Error(`Server returned non-JSON response (${response.status}): ${textResult.substring(0, 100)}`);
      }
      
      // Validate that the response is still for the current exchange
      if (requestExchangeId !== selectedExchangeId) {
        console.log(`[UNIFIED WS OPEN ORDERS] ⚠️ Exchange changed during request (${requestExchangeId} -> ${selectedExchangeId}), ignoring response`);
        return;
      }
      
      if (response.ok && result.orders) {
        console.log(`[UNIFIED WS OPEN ORDERS] ✅ OPEN ORDERS FETCH SUCCESSFUL:`);
        console.log(`[UNIFIED WS OPEN ORDERS]    Total Open Orders: ${result.orders.length}`);
        console.log(`[UNIFIED WS OPEN ORDERS]    Orders:`, result.orders);
        
        setOpenOrders(result.orders);
        setOpenOrdersError(null);
        
        console.log(`[UNIFIED WS OPEN ORDERS] ===== OPEN ORDERS FETCH COMPLETED =====`);
      } else {
        throw new Error(result.error || 'Failed to fetch open orders');
      }
    } catch (error) {
      console.log(`[UNIFIED WS OPEN ORDERS] ❌ OPEN ORDERS FETCH ERROR:`);
      console.log(`[UNIFIED WS OPEN ORDERS]    Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Only set error if we're still on the same exchange
      if (requestExchangeId === selectedExchangeId) {
        setOpenOrdersError(error instanceof Error ? error.message : 'Failed to fetch open orders');
      }
    } finally {
      // Only clear loading if we're still on the same exchange
      if (requestExchangeId === selectedExchangeId) {
        setOpenOrdersLoading(false);
      }
    }
  };
  // Cancel order function
  const handleCancelOrder = async (orderId: string, symbol: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('[CANCEL ORDER] ❌ No auth token found');
      throw new Error('Authentication required');
    }

    console.log(`[CANCEL ORDER] 🚫 Cancelling order ${orderId} for ${symbol}...`);

    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          exchangeId: selectedExchangeId,
          symbol: symbol
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to cancel order');
      }

      const result = await response.json();
      console.log(`[CANCEL ORDER] ✅ Order cancelled successfully:`, result);

      // Refresh open orders to reflect the cancellation
      fetchOpenOrders();

    } catch (error) {
      console.error(`[CANCEL ORDER] ❌ Error cancelling order:`, error);
      throw error;
    }
  };  const handleExchangeChange = (exchangeId: number) => {
    console.log(`[TRADING] ===== EXCHANGE CHANGE INITIATED =====`);
    console.log(`[TRADING] Switching from exchange ${selectedExchangeId} to ${exchangeId}`);
    
    // Set loading states immediately
    setOpenOrdersLoading(true);
    setBalanceLoading(true);
    
    // Clear ALL previous exchange data immediately to prevent stale data display
    setOpenOrders([]);
    setBaseBalance(null);
    setQuoteBalance(null);
    setOpenOrdersError(null);
    setBalanceError(null);
    setTickerData(null);
    setKlineData(null);
    
    // Store the previous exchange ID for proper unsubscription
    const previousExchangeId = selectedExchangeId;
    
    // Update the selected exchange ID
    setSelectedExchangeId(exchangeId);
    
    // Enhanced unsubscription from previous exchange
    if (previousExchangeId && webSocketSingleton.isConnected()) {
      console.log(`[TRADING] Unsubscribing from previous exchange: ${previousExchangeId}`);
      
      // Unsubscribe from balance updates
      webSocketSingleton.sendMessage(
        createTradingBalanceUnsubscriptionMessage(selectedSymbol, previousExchangeId)
      );
      
      // Unsubscribe from open orders updates  
      webSocketSingleton.sendMessage(
        createOpenOrdersUnsubscriptionMessage(previousExchangeId)
      );
      
      // Unsubscribe from market data for previous exchange
      webSocketSingleton.sendMessage({
        type: 'unsubscribe',
        symbol: selectedSymbol,
        exchangeId: previousExchangeId
      });
    }
    
    // Wait for unsubscription to process, then setup new exchange
    setTimeout(() => {
      console.log(`[TRADING] Setting up new exchange: ${exchangeId}`);
      
      // Fetch fresh data for new exchange
      fetchTradingBalances();
      fetchOpenOrders();
      
      if (webSocketSingleton.isConnected()) {
        console.log(`[TRADING] Subscribing to new exchange: ${exchangeId}`);
        
        // Subscribe to market data for new exchange
        webSocketSingleton.sendMessage(createChangeSubscriptionMessage(selectedSymbol, currentInterval, exchangeId));
        
        // Subscribe to open orders for new exchange
        console.log(`[UNIFIED WS OPEN ORDERS] Subscribing to open orders for exchange: ${exchangeId} (all symbols)`);
        webSocketSingleton.sendMessage(
          createOpenOrdersSubscriptionMessage(exchangeId)
        );
        
        // Subscribe to balance updates for new exchange
        webSocketSingleton.sendMessage(
          createTradingBalanceSubscriptionMessage(selectedSymbol, exchangeId)
        );
      }
      
      console.log(`[TRADING] ===== EXCHANGE CHANGE COMPLETED =====`);
    }, 200); // Slightly longer delay to ensure proper cleanup
  };  // Handle WebSocket messages
  useEffect(() => {
    const unsubscribeData = webSocketSingleton.subscribe((data: any) => {
      // Add strong exchange filtering at the top level
      if (data && data.exchangeId && data.exchangeId !== selectedExchangeId) {
        console.log(`[TRADING] ⚠️ Ignoring message from exchange ${data.exchangeId} (current: ${selectedExchangeId})`);
        return;
      }
      
      if (data && data.type === 'market_update' && data.data) {
        const marketData = data.data;
        // Additional exchange check for market data
        if (marketData.exchangeId && marketData.exchangeId !== selectedExchangeId) {
          console.log(`[TRADING] ⚠️ Ignoring market update from exchange ${marketData.exchangeId}`);
          return;
        }
        
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
        // Additional exchange check for kline data
        if (data.data.exchangeId && data.data.exchangeId !== selectedExchangeId) {
          console.log(`[TRADING] ⚠️ Ignoring kline update from exchange ${data.data.exchangeId}`);
          return;
        }
        
        console.log('[TRADING] Received kline data for chart:', data.data);
        setKlineData(data.data);
      }
      
      // Handle historical klines for the chart
      if (data && data.type === 'historical_klines' && data.data) {
        // Additional exchange check for historical klines
        if (data.data.exchangeId && data.data.exchangeId !== selectedExchangeId) {
          console.log(`[TRADING] ⚠️ Ignoring historical klines from exchange ${data.data.exchangeId}`);
          return;
        }
        
        console.log('[TRADING] Received historical klines for chart:', data.data.klines?.length || 0, 'candles');
        // Set a flag to indicate we're receiving historical data
        setKlineData({
          type: 'historical_batch',
          symbol: data.data.symbol,
          interval: data.data.interval,
          klines: data.data.klines
        });
      }
      
      // Handle order fill notifications and refresh balances (similar to martingale strategy)
      if (data && data.type === 'order_fill_notification' && data.data) {
        const orderData = data.data;
        console.log(`[MANUAL TRADING] ===== ORDER FILL NOTIFICATION RECEIVED =====`);
        console.log(`[MANUAL TRADING] 📊 ORDER FILL DETAILS:`);
        console.log(`[MANUAL TRADING]    Exchange Order ID: ${orderData.exchangeOrderId}`);
        console.log(`[MANUAL TRADING]    Symbol: ${orderData.symbol}`);
        console.log(`[MANUAL TRADING]    Side: ${orderData.side}`);
        console.log(`[MANUAL TRADING]    Quantity: ${orderData.quantity}`);
        console.log(`[MANUAL TRADING]    Price: ${orderData.price}`);
        console.log(`[MANUAL TRADING]    Status: ${orderData.status}`);
          // Check if this order fill is for our current exchange (any symbol)
        if (orderData.exchangeId === selectedExchangeId) {
          console.log(`[MANUAL TRADING] ✅ ORDER FILL MATCHES CURRENT EXCHANGE:`);
          console.log(`[MANUAL TRADING]    Triggering balance refresh...`);
          
          // Delay balance refresh to allow order settlement
          setTimeout(() => {
            console.log(`[MANUAL TRADING] 🔄 Refreshing balances after order fill...`);
            fetchTradingBalances();
          }, 1000);
        } else {
          console.log(`[MANUAL TRADING] ⚠️ Order fill for different exchange, skipping balance refresh`);
        }
        
        console.log(`[MANUAL TRADING] ===== ORDER FILL PROCESSING COMPLETE =====`);
      }      // Handle ticker updates for price display
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
        // Handle open orders updates
      if (data && data.type === 'open_orders_update' && data.data) {
        console.log(`[UNIFIED WS OPEN ORDERS] ===== OPEN ORDERS UPDATE RECEIVED =====`);
        console.log(`[UNIFIED WS OPEN ORDERS] 📊 OPEN ORDERS DATA:`, data.data);
        console.log(`[UNIFIED WS OPEN ORDERS] 📊 Message Exchange ID: ${data.data.exchangeId}, Selected Exchange ID: ${selectedExchangeId}`);
        
        // Strong exchange ID validation
        if (data.data.exchangeId === selectedExchangeId) {
          console.log(`[UNIFIED WS OPEN ORDERS] ✅ Open orders update matches current exchange: ${selectedExchangeId}`);
          console.log(`[UNIFIED WS OPEN ORDERS]    Total Orders: ${data.data.orders?.length || 0}`);
          
          setOpenOrders(data.data.orders || []);
          setOpenOrdersError(null);
          setOpenOrdersLoading(false); // Clear loading state
          
          console.log(`[UNIFIED WS OPEN ORDERS] ===== OPEN ORDERS STATE UPDATED =====`);
        } else {
          console.log(`[UNIFIED WS OPEN ORDERS] ⚠️ Open orders update for different exchange (${data.data.exchangeId} vs ${selectedExchangeId}), ignoring`);
        }
      }
        // Handle individual order status updates
      if (data && data.type === 'order_status_update' && data.data) {
        console.log(`[UNIFIED WS OPEN ORDERS] ===== ORDER STATUS UPDATE RECEIVED =====`);
        console.log(`[UNIFIED WS OPEN ORDERS] 📊 ORDER STATUS DATA:`, data.data);
        
        const orderData = data.data;
        if (orderData.exchangeId === selectedExchangeId) {
          console.log(`[UNIFIED WS OPEN ORDERS] ✅ Order status update matches current exchange`);
          
          // Update open orders list based on order status
          setOpenOrders(prev => {
            const updatedOrders = [...prev];
            const existingOrderIndex = updatedOrders.findIndex(order => 
              order.orderId === orderData.orderId || order.clientOrderId === orderData.clientOrderId
            );
            
            if (orderData.status === 'NEW' || orderData.status === 'PARTIALLY_FILLED') {
              // Add or update order in open orders
              if (existingOrderIndex >= 0) {
                updatedOrders[existingOrderIndex] = orderData;
                console.log(`[UNIFIED WS OPEN ORDERS] 🔄 Updated existing order: ${orderData.orderId}`);
              } else {
                updatedOrders.push(orderData);
                console.log(`[UNIFIED WS OPEN ORDERS] ➕ Added new order: ${orderData.orderId}`);
              }
            } else if (orderData.status === 'FILLED' || orderData.status === 'CANCELED') {
              // Remove order from open orders
              if (existingOrderIndex >= 0) {
                updatedOrders.splice(existingOrderIndex, 1);
                console.log(`[UNIFIED WS OPEN ORDERS] ➖ Removed completed order: ${orderData.orderId}`);
              }
            }
            
            console.log(`[UNIFIED WS OPEN ORDERS] 📊 Updated open orders count: ${updatedOrders.length}`);
            return updatedOrders;
          });
          
          console.log(`[UNIFIED WS OPEN ORDERS] ===== ORDER STATUS PROCESSING COMPLETE =====`);
        } else {
          console.log(`[UNIFIED WS OPEN ORDERS] ⚠️ Order status update for different exchange (${orderData.exchangeId} vs ${selectedExchangeId}), ignoring`);
        }
      }
    });    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      setConnectionStatus('connected');
      console.log('[TRADING] Connected to unified WebSocket server');
      // Request initial balance data and open orders when connected
      if (selectedExchangeId) {
        fetchTradingBalances();
        fetchOpenOrders();
          // Subscribe to open orders
        console.log(`[UNIFIED WS OPEN ORDERS] Subscribing to open orders on connection for exchange: ${selectedExchangeId} (all symbols)`);
        webSocketSingleton.sendMessage(
          createOpenOrdersSubscriptionMessage(selectedExchangeId) // Remove symbol parameter
        );
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
  }, [selectedExchangeId, selectedSymbol]);  const handleSymbolSelect = (symbol: string) => {
    console.log(`[TRADING] Symbol selected: ${symbol}`);
    console.log(`[UNIFIED WS OPEN ORDERS] Symbol changed - open orders remain the same (all symbols for exchange)`);
      // Unsubscribe from previous symbol balance updates (open orders don't need to change)
    if (selectedExchangeId && webSocketSingleton.isConnected()) {
      webSocketSingleton.sendMessage(
        createTradingBalanceUnsubscriptionMessage(selectedSymbol, selectedExchangeId)
      );
      // Note: We don't unsubscribe from open orders since we want ALL symbols
    }
    
    setSelectedSymbol(symbol);
    setTickerData(null); // Clear previous ticker data
    setKlineData(null); // Clear previous kline data
    setBaseBalance(null); // Clear previous balance data
    setQuoteBalance(null);
    
    // Note: We don't clear open orders since we want to see all symbols for the current exchange
    // Note: Open orders will remain the same, only balances need to be fetched for new symbol
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
        // Request trading balances and open orders
        fetchTradingBalances();
        fetchOpenOrders();
          // Subscribe to open orders
        console.log(`[UNIFIED WS OPEN ORDERS] Setting up initial open orders subscription for exchange: ${selectedExchangeId} (all symbols)`);
        webSocketSingleton.sendMessage(
          createOpenOrdersSubscriptionMessage(selectedExchangeId) // Remove symbol parameter
        );
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
          // Unsubscribe from balance and open orders updates
        if (selectedExchangeId) {
          webSocketSingleton.sendMessage(
            createTradingBalanceUnsubscriptionMessage(selectedSymbol, selectedExchangeId)
          );
          webSocketSingleton.sendMessage(
            createOpenOrdersUnsubscriptionMessage(selectedExchangeId) // Remove symbol parameter for all symbols
          );
        }
      }
      
      // Remove reference to allow cleanup
      console.log('[TRADING] Removing WebSocket reference');
      webSocketSingleton.removeReference();    };
  }, []); // Empty dependency array - only run once on mount and cleanup on unmount

  useEffect(() => {
    // Change subscription when symbol changes (but not on initial mount)
    if (webSocketSingleton.isConnected() && selectedExchangeId) {
      console.log(`[TRADING] Changing subscription to ${selectedSymbol} at ${currentInterval} on exchange ${selectedExchangeId}`);
      webSocketSingleton.sendMessage(createChangeSubscriptionMessage(selectedSymbol, currentInterval, selectedExchangeId));
      // Request balances for new symbol (open orders remain the same for all symbols)
      fetchTradingBalances();
      // Note: We don't re-fetch open orders since we already have all symbols
    } else {
      console.log(`[TRADING] WebSocket not connected or no exchange selected, cannot change subscription to ${selectedSymbol}`);
    }
  }, [selectedSymbol, currentInterval, selectedExchangeId]);
  // Initial balance and open orders fetch when exchange is selected
  useEffect(() => {
    if (selectedExchangeId) {
      console.log(`[MANUAL TRADING] ===== EXCHANGE SELECTION EFFECT =====`);
      console.log(`[MANUAL TRADING] Exchange selected: ${selectedExchangeId}, fetching initial balances and open orders...`);
      console.log(`[UNIFIED WS OPEN ORDERS] Exchange selected: ${selectedExchangeId}, fetching initial open orders...`);
      
      // Clear any existing data immediately when exchange changes
      setOpenOrders([]);
      setOpenOrdersError(null);
      setBalanceError(null);
      
      // Set loading states
      setOpenOrdersLoading(true);
      setBalanceLoading(true);
      
      // Fetch fresh data
      fetchTradingBalances();
      fetchOpenOrders();
      
      console.log(`[MANUAL TRADING] ===== EXCHANGE SELECTION EFFECT COMPLETED =====`);
    }
  }, [selectedExchangeId]);

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
              </div>              {/* Orders & History Section */}
              <div className="h-80 shrink-0 border-t border-gray-800">
                <OrdersHistory 
                  className="h-full" 
                  openOrders={openOrders}
                  openOrdersLoading={openOrdersLoading}
                  openOrdersError={openOrdersError}
                  onRefreshOpenOrders={fetchOpenOrders}
                  onCancelOrder={handleCancelOrder}
                />
              </div>
            </div>            {/* Right Sidebar - Order Form and Markets */}
            <div className="w-80 shrink-0 border-l border-gray-800 flex flex-col">
              {/* Order Form Section - Increased height and optimized spacing */}
              <div className="h-[28rem] shrink-0">
                <OrderForm 
                  className="h-full" 
                  symbol={selectedSymbol} 
                  exchangeId={selectedExchangeId}
                  baseBalance={baseBalance}
                  quoteBalance={quoteBalance}
                  balanceLoading={balanceLoading}
                  balanceError={balanceError}
                  onBalanceRefresh={fetchTradingBalances}
                  tickerData={tickerData}
                />
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
