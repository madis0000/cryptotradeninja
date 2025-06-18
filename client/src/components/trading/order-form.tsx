import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { webSocketSingleton } from "@/services/WebSocketSingleton";

interface OrderFormProps {
  symbol: string;
  exchangeId?: number;
  className?: string;
  baseBalance?: BalanceData | null;
  quoteBalance?: BalanceData | null;
  balanceLoading?: boolean;
  balanceError?: string | null;
  onBalanceRefresh?: () => void;
  tickerData?: TickerData | null;
}

interface BalanceData {
  asset: string;
  free: string;
  locked: string;
}

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

export function OrderForm({ 
  symbol, 
  exchangeId, 
  className, 
  baseBalance: propBaseBalance, 
  quoteBalance: propQuoteBalance, 
  balanceLoading: propBalanceLoading = false, 
  balanceError: propBalanceError = null,
  onBalanceRefresh,
  tickerData
}: OrderFormProps) {
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [useTPSL, setUseTPSL] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderStatus, setOrderStatus] = useState("");

  // Use prop balances or fallback to local state for backward compatibility
  const [localBaseBalance, setLocalBaseBalance] = useState<BalanceData | null>(null);
  const [localQuoteBalance, setLocalQuoteBalance] = useState<BalanceData | null>(null);
  const [subscribedSymbol, setSubscribedSymbol] = useState<string>("");

  const baseBalance = propBaseBalance || localBaseBalance;
  const quoteBalance = propQuoteBalance || localQuoteBalance;
  const balanceLoading = propBalanceLoading;
  const balanceError = propBalanceError;

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

  const { baseAsset, quoteAsset } = getAssetPair(symbol);
  
  // Debug logging for balance data
  console.log(`[ORDER FORM DEBUG] ===== BALANCE DATA =====`);
  console.log(`[ORDER FORM DEBUG] Base Balance:`, baseBalance);
  console.log(`[ORDER FORM DEBUG] Quote Balance:`, quoteBalance);
  console.log(`[ORDER FORM DEBUG] Balance Loading:`, balanceLoading);
  console.log(`[ORDER FORM DEBUG] Balance Error:`, balanceError);

  // Market price from real data
  // Use ticker data for current market price, fallback to default for the specific symbol
  const getMarketPrice = () => {
    if (tickerData && tickerData.symbol === symbol && tickerData.price) {
      console.log(`[ORDER FORM DEBUG] Using ticker price: ${tickerData.price}`);
      return tickerData.price;
    }
    
    // Fallback prices based on common symbols (more realistic current prices)
    const fallbackPrices: { [key: string]: string } = {
      'BTCUSDT': '43000.00',
      'ETHUSDT': '2400.00',
      'BNBUSDT': '310.00',
      'ADAUSDT': '0.45',
      'ICPUSDT': '5.08',  // Updated to match your example
      'DOGEUSDT': '0.075',
      'SOLUSDT': '95.00',
      'XRPUSDT': '0.52',
      'LTCUSDT': '70.00',
      'DOTUSDT': '6.50'
    };
    
    const fallbackPrice = fallbackPrices[symbol] || '1.00';
    console.log(`[ORDER FORM DEBUG] Using fallback price for ${symbol}: ${fallbackPrice}`);
    return fallbackPrice;
  };
  
  const marketPrice = getMarketPrice();
  
  // Debug logging for market price
  console.log(`[ORDER FORM DEBUG] ===== MARKET PRICE DATA =====`);
  console.log(`[ORDER FORM DEBUG] Symbol: ${symbol}`);
  console.log(`[ORDER FORM DEBUG] Ticker Data:`, tickerData);
  console.log(`[ORDER FORM DEBUG] Market Price: ${marketPrice}`);
  console.log(`[ORDER FORM DEBUG] Market Price (parsed): ${parseFloat(marketPrice)}`);

  // Calculate total when amount or price changes
  useEffect(() => {
    if (orderType === "limit" && amount && price) {
      const calculatedTotal = (parseFloat(amount) * parseFloat(price)).toFixed(8);
      setTotal(calculatedTotal);
    }
  }, [amount, price, orderType]);

  const handleTotalChange = (newTotal: string) => {
    setTotal(newTotal);
    if (price && parseFloat(price) > 0) {
      const calculatedAmount = (parseFloat(newTotal) / parseFloat(price)).toFixed(8);
      setAmount(calculatedAmount);
    }
  };

  const handlePlaceOrder = async () => {
    if (!amount || (orderType === 'limit' && !price)) {
      setOrderStatus("Please fill in all required fields");
      return;
    }

    if (!exchangeId) {
      setOrderStatus("Please select an exchange");
      return;
    }

    // Enhanced logging for order placement
    const orderData = {
      exchangeId: exchangeId,
      symbol: symbol,
      side: activeTab.toUpperCase(),
      orderType: orderType.toUpperCase(),
      quantity: amount,
      price: orderType === 'limit' ? price : undefined,
      timeInForce: 'GTC'
    };

    console.log(`[MANUAL TRADING] ===== STARTING ORDER EXECUTION =====`);
    console.log(`[MANUAL TRADING] 📊 ORDER DETAILS:`);
    console.log(`[MANUAL TRADING]    Symbol: ${symbol}`);
    console.log(`[MANUAL TRADING]    Side: ${activeTab.toUpperCase()}`);
    console.log(`[MANUAL TRADING]    Type: ${orderType.toUpperCase()}`);
    console.log(`[MANUAL TRADING]    Quantity: ${amount} ${baseAsset}`);
    console.log(`[MANUAL TRADING]    Price: ${orderType === 'limit' ? price : 'MARKET'} ${quoteAsset}`);
    console.log(`[MANUAL TRADING]    Exchange ID: ${exchangeId}`);
    
    // Calculate estimated value for logging
    const estimatedValue = orderType === 'limit' && price ? 
      (parseFloat(amount) * parseFloat(price)).toFixed(2) : 
      'Market Value';
    console.log(`[MANUAL TRADING]    Estimated Value: ${estimatedValue} ${quoteAsset}`);

    // Log current balance before order
    console.log(`[MANUAL TRADING] 💰 PRE-ORDER BALANCES:`);
    console.log(`[MANUAL TRADING]    ${baseAsset} Available: ${baseBalance?.free || '0'} (Locked: ${baseBalance?.locked || '0'})`);
    console.log(`[MANUAL TRADING]    ${quoteAsset} Available: ${quoteBalance?.free || '0'} (Locked: ${quoteBalance?.locked || '0'})`);

    setIsPlacingOrder(true);
    setOrderStatus("Placing order...");
    
    const startTime = Date.now();
    console.log(`[MANUAL TRADING] 🚀 Sending order to exchange...`);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(orderData),
      });

      const responseTime = Date.now() - startTime;
      console.log(`[MANUAL TRADING] ⏱️ API Response Time: ${responseTime}ms`);

      const result = await response.json();
      console.log(`[MANUAL TRADING] 📨 ORDER RESPONSE:`, result);

      if (result.success) {
        console.log(`[MANUAL TRADING] ✅ ORDER PLACED SUCCESSFULLY!`);
        console.log(`[MANUAL TRADING]    Exchange Order ID: ${result.orderId}`);
        console.log(`[MANUAL TRADING]    Status: ${result.status || 'NEW'}`); 
        console.log(`[MANUAL TRADING]    Client Order ID: ${result.clientOrderId || 'N/A'}`);
        console.log(`[MANUAL TRADING]    Transaction Time: ${result.transactTime ? new Date(result.transactTime).toISOString() : new Date().toISOString()}`);
        
        setOrderStatus(`✅ Order placed successfully! Order ID: ${result.orderId}`);
        setAmount("");
        setPrice("");
        setTotal("");
        
        // Note: Balance update will be triggered automatically by order fill monitoring
        // The trading page will detect the order fill event and refresh balances via API
        console.log(`[MANUAL TRADING] � Order fill monitoring will trigger balance refresh automatically`);

        // Log success completion
        console.log(`[MANUAL TRADING] ===== ORDER EXECUTION COMPLETE =====`);
        
      } else {
        console.log(`[MANUAL TRADING] ❌ ORDER PLACEMENT FAILED:`);
        console.log(`[MANUAL TRADING]    Error: ${result.error}`);
        console.log(`[MANUAL TRADING]    Details:`, result);
        setOrderStatus(`❌ Order failed: ${result.error}`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.log(`[MANUAL TRADING] ❌ ORDER EXECUTION ERROR:`);
      console.log(`[MANUAL TRADING]    Response Time: ${responseTime}ms`);
      console.log(`[MANUAL TRADING]    Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`[MANUAL TRADING]    Stack:`, error);
      setOrderStatus(`❌ Order failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsPlacingOrder(false);
      setTimeout(() => setOrderStatus(""), 5000);
    }
  };

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0' : num.toFixed(8);
  };

  // Subscribe to order fill notifications (simplified approach like martingale strategy)
  useEffect(() => {
    if (!symbol || !exchangeId || !webSocketSingleton.isConnected()) {
      return;
    }

    console.log(`[ORDER FORM] 📊 Setting up order fill monitoring for ${symbol} on exchange ${exchangeId}`);

    // Handle order fill notifications and refresh balances (similar to martingale strategy)
    const unsubscribe = webSocketSingleton.subscribe((data: any) => {
      if (data && data.type === 'order_fill_notification' && data.data) {
        const orderData = data.data;
        console.log(`[ORDER FORM] ===== ORDER FILL NOTIFICATION RECEIVED =====`);
        console.log(`[ORDER FORM] 📊 ORDER FILL DETAILS:`);
        console.log(`[ORDER FORM]    Exchange Order ID: ${orderData.exchangeOrderId}`);
        console.log(`[ORDER FORM]    Symbol: ${orderData.symbol}`);
        console.log(`[ORDER FORM]    Side: ${orderData.side}`);
        console.log(`[ORDER FORM]    Quantity: ${orderData.quantity}`);
        console.log(`[ORDER FORM]    Price: ${orderData.price}`);
        console.log(`[ORDER FORM]    Status: ${orderData.status}`);
        
        // Check if this order fill is for our current trading pair and exchange
        if (orderData.symbol === symbol && orderData.exchangeId === exchangeId) {
          console.log(`[ORDER FORM] ✅ ORDER FILL MATCHES CURRENT TRADING PAIR:`);
          console.log(`[ORDER FORM]    Triggering balance refresh...`);
          
          // Refresh balances via API call (similar to martingale strategy approach)
          setTimeout(() => {
            console.log(`[ORDER FORM] 🔄 Refreshing balances after order fill...`);
            if (onBalanceRefresh) {
              onBalanceRefresh();
            }
          }, 1000);
        } else {
          console.log(`[ORDER FORM] ⚠️ Order fill for different symbol/exchange, skipping balance refresh`);
        }
        
        console.log(`[ORDER FORM] ===== ORDER FILL PROCESSING COMPLETE =====`);
      }
    });

    return () => {
      console.log(`[ORDER FORM] 🔄 Cleaning up order fill monitoring for ${symbol}`);
      unsubscribe();
    };
  }, [symbol, exchangeId, onBalanceRefresh]);

  // Calculate available balance based on order side
  const getAvailableBalance = () => {
    if (activeTab === "buy") {
      // For buy orders, we need quote currency (e.g., USDT)
      return parseFloat(quoteBalance?.free || '0');
    } else {
      // For sell orders, we need base currency (e.g., BTC)
      return parseFloat(baseBalance?.free || '0');
    }
  };

  const getBalanceSymbol = () => {
    if (activeTab === "buy") {
      return quoteBalance?.asset || quoteAsset;
    } else {
      return baseBalance?.asset || baseAsset;
    }
  };

  const getMaxAmount = () => {
    console.log(`[ORDER FORM DEBUG] ===== MAX AMOUNT CALCULATION =====`);
    console.log(`[ORDER FORM DEBUG] Active Tab: ${activeTab}`);
    console.log(`[ORDER FORM DEBUG] Order Type: ${orderType}`);
    console.log(`[ORDER FORM DEBUG] Symbol: ${symbol}`);
    console.log(`[ORDER FORM DEBUG] Base Asset: ${baseAsset}, Quote Asset: ${quoteAsset}`);
    
    if (activeTab === 'buy') {
      const balance = parseFloat(quoteBalance?.free || '0');
      const priceToUse = orderType === 'limit' && price ? parseFloat(price) : parseFloat(marketPrice);
      const maxAmount = priceToUse > 0 ? (balance / priceToUse).toFixed(8) : '0';
      
      console.log(`[ORDER FORM DEBUG] BUY CALCULATION:`);
      console.log(`[ORDER FORM DEBUG]   Quote Balance (${quoteAsset}): ${balance}`);
      console.log(`[ORDER FORM DEBUG]   Quote Balance Type: ${typeof balance}`);
      console.log(`[ORDER FORM DEBUG]   Quote Balance Raw:`, quoteBalance?.free);
      console.log(`[ORDER FORM DEBUG]   Price to use: ${priceToUse}`);
      console.log(`[ORDER FORM DEBUG]   Price Type: ${typeof priceToUse}`);
      console.log(`[ORDER FORM DEBUG]   Market Price: ${marketPrice}`);
      console.log(`[ORDER FORM DEBUG]   Entered Price: ${price || 'none'}`);
      console.log(`[ORDER FORM DEBUG]   Raw Division: ${balance} / ${priceToUse} = ${balance / priceToUse}`);
      console.log(`[ORDER FORM DEBUG]   Manual Test: 145303 / 5.08 = ${145303 / 5.08}`);
      console.log(`[ORDER FORM DEBUG]   Calculation: ${balance} / ${priceToUse} = ${maxAmount}`);
      console.log(`[ORDER FORM DEBUG]   Expected: ${balance / priceToUse}`);
      
      return maxAmount;
    } else {
      const maxAmount = baseBalance?.free || '0';
      console.log(`[ORDER FORM DEBUG] SELL CALCULATION:`);
      console.log(`[ORDER FORM DEBUG]   Base Balance (${baseAsset}): ${maxAmount}`);
      return maxAmount;
    }
  };

  return (
    <div className={cn("bg-crypto-dark p-3", className)}>
      {/* Tab Navigation - Reduced margin */}
      <div className="flex gap-4 mb-3 border-b border-gray-800">
        <button
          onClick={() => setOrderType("limit")}
          className={cn(
            "pb-1.5 px-1 text-sm font-medium transition-colors relative",
            orderType === "limit"
              ? "text-crypto-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-crypto-primary"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          Limit
        </button>
        <button
          onClick={() => setOrderType("market")}
          className={cn(
            "pb-1.5 px-1 text-sm font-medium transition-colors relative",
            orderType === "market"
              ? "text-crypto-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-crypto-primary"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          Market
        </button>
      </div>



      {/* Remove Card wrapper and use direct content */}
      <div className="flex flex-col h-full">
        {/* Order Status Display */}
        {orderStatus && (
          <div className={`mx-3 mt-2 p-2 rounded-lg text-sm ${
            orderStatus.includes('successfully') 
              ? 'bg-green-900/20 text-green-400 border border-green-700/50' 
              : orderStatus.includes('failed') || orderStatus.includes('error')
              ? 'bg-red-900/20 text-red-400 border border-red-700/50'
              : 'bg-blue-900/20 text-blue-400 border border-blue-700/50'
          }`}>
            {orderStatus}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "buy" | "sell")} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 h-10 p-0 bg-transparent rounded-none">
            <TabsTrigger 
              value="buy" 
              className="h-full rounded-none data-[state=active]:bg-green-600/20 data-[state=active]:text-green-400 text-crypto-light hover:text-white"
            >
              Buy {baseAsset}
            </TabsTrigger>
            <TabsTrigger 
              value="sell" 
              className="h-full rounded-none data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-crypto-light hover:text-white"
            >
              Sell {baseAsset}
            </TabsTrigger>
          </TabsList>

          <div className="p-3 flex-1 overflow-y-auto">
            <TabsContent value="buy" className="mt-0 space-y-3">
              {/* Price Field - Show for Limit orders, hide for Market */}
              {orderType === "limit" && (
                <div className="space-y-1">
                  <Label className="text-crypto-light text-xs">Price</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder={marketPrice || "0"}
                      className="bg-crypto-darker border-gray-700 text-white pr-16 h-9"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                      {quoteAsset}
                    </div>
                  </div>
                </div>
              )}

              {/* Market Price Display for Market orders */}
              {orderType === "market" && (
                <div className="space-y-1">
                  <Label className="text-crypto-light text-xs">Price</Label>
                  <div className="relative">
                    <Input
                      value="Market Price"
                      readOnly
                      className="bg-crypto-darker border-gray-700 text-crypto-light text-center h-9"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-crypto-light text-xs">Amount</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="bg-crypto-darker border-gray-700 text-white pr-16 h-9"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                    {baseAsset}
                  </div>
                </div>
              </div>

              {/* Total Field - Only for Limit orders */}
              {orderType === "limit" && (
                <div className="space-y-1">
                  <Label className="text-crypto-light text-xs">Total</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={total}
                      onChange={(e) => handleTotalChange(e.target.value)}
                      placeholder="0"
                      className="bg-crypto-darker border-gray-700 text-white pr-20 h-9"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-xs">
                      Min 5 {quoteAsset}
                    </div>
                  </div>
                </div>
              )}

              {/* TP/SL - Only for Limit orders */}
              {orderType === "limit" && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="tpsl-buy" 
                    checked={useTPSL}
                    onCheckedChange={(checked) => setUseTPSL(checked === true)}
                    className="border-gray-600"
                  />
                  <Label htmlFor="tpsl-buy" className="text-crypto-light text-xs">TP/SL</Label>
                </div>
              )}

              {/* Balance info - Compact */}
              <div className="space-y-1 text-xs text-crypto-light">
                <div className="flex justify-between">
                  <span>Available:</span>
                  <span className="font-mono">
                    {balanceLoading ? '...' : balanceError ? `Error: ${balanceError}` : `${formatNumber(getAvailableBalance())} ${quoteAsset}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Max Buy:</span>
                  <span className="font-mono">
                    {balanceLoading ? '...' : balanceError ? `Error: ${balanceError}` : `${formatNumber(getMaxAmount())} ${baseAsset}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Est. Fee:</span>
                  <span className="font-mono">0.1%</span>
                </div>
              </div>

              <Button 
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || !amount || (orderType === 'limit' && !price) || !exchangeId}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 h-9"
              >
                {isPlacingOrder ? 'Placing Order...' : `Buy ${baseAsset}`}
              </Button>
            </TabsContent>

            <TabsContent value="sell" className="mt-0 space-y-3">
              {/* Price Field - Show for Limit orders, hide for Market */}
              {orderType === "limit" && (
                <div className="space-y-1">
                  <Label className="text-crypto-light text-xs">Price</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder={marketPrice || "0"}
                      className="bg-crypto-darker border-gray-700 text-white pr-16 h-9"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                      {quoteAsset}
                    </div>
                  </div>
                </div>
              )}

              {/* Market Price Display for Market orders */}
              {orderType === "market" && (
                <div className="space-y-1">
                  <Label className="text-crypto-light text-xs">Price</Label>
                  <div className="relative">
                    <Input
                      value="Market Price"
                      readOnly
                      className="bg-crypto-darker border-gray-700 text-crypto-light text-center h-9"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-crypto-light text-xs">Amount</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="bg-crypto-darker border-gray-700 text-white pr-16 h-9"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                    {baseAsset}
                  </div>
                </div>
              </div>

              {/* Total Field - Only for Limit orders */}
              {orderType === "limit" && (
                <div className="space-y-1">
                  <Label className="text-crypto-light text-xs">Total</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={total}
                      onChange={(e) => handleTotalChange(e.target.value)}
                      placeholder="0"
                      className="bg-crypto-darker border-gray-700 text-white pr-20 h-9"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-xs">
                      Min 5 {quoteAsset}
                    </div>
                  </div>
                </div>
              )}

              {/* TP/SL - Only for Limit orders */}
              {orderType === "limit" && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="tpsl-sell" 
                    checked={useTPSL}
                    onCheckedChange={(checked) => setUseTPSL(checked === true)}
                    className="border-gray-600"
                  />
                  <Label htmlFor="tpsl-sell" className="text-crypto-light text-xs">TP/SL</Label>
                </div>
              )}

              {/* Balance info - Compact */}
              <div className="space-y-1 text-xs text-crypto-light">
                <div className="flex justify-between">
                  <span>Available:</span>
                  <span className="font-mono">
                    {balanceLoading ? '...' : balanceError ? `Error: ${balanceError}` : `${formatNumber(getAvailableBalance())} ${baseAsset}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Max Sell:</span>
                  <span className="font-mono">
                    {balanceLoading ? '...' : balanceError ? `Error: ${balanceError}` : `${formatNumber(getMaxAmount())} ${baseAsset}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Est. Fee:</span>
                  <span className="font-mono">0.1%</span>
                </div>
              </div>

              <Button 
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || !amount || (orderType === 'limit' && !price) || !exchangeId}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 h-9"
              >
                {isPlacingOrder ? 'Placing Order...' : `Sell ${baseAsset}`}
              </Button>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}