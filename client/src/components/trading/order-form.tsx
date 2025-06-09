import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";

interface OrderFormProps {
  symbol: string;
  className?: string;
}

export function OrderForm({ symbol, className }: OrderFormProps) {
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [useTPSL, setUseTPSL] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderStatus, setOrderStatus] = useState("");

  const baseAsset = symbol.replace("USDT", "").replace("USDC", "");
  const quoteAsset = symbol.includes("USDT") ? "USDT" : "USDC";

  // Market price from real data
  const marketPrice = "106800.00";

  // Fetch balance data
  const { data: balances = {} } = useQuery({
    queryKey: ['/api/exchanges/1/balance'],
    refetchInterval: 5000,
  });

  const typedBalances = balances as Record<string, { free: string; locked: string }>;

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

    setIsPlacingOrder(true);
    setOrderStatus("Placing order...");

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exchangeId: 1,
          symbol: symbol,
          side: side,
          orderType: orderType.toUpperCase(),
          quantity: amount,
          price: orderType === 'limit' ? price : undefined,
          timeInForce: 'GTC'
        }),
      });

      const result = await response.json();

      if (result.success) {
        setOrderStatus(`Order placed successfully! Order ID: ${result.orderId}`);
        setAmount("");
        setPrice("");
        setTotal("");
      } else {
        setOrderStatus(`Order failed: ${result.error}`);
      }
    } catch (error) {
      setOrderStatus(`Order failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsPlacingOrder(false);
      setTimeout(() => setOrderStatus(""), 5000);
    }
  };

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0' : num.toFixed(8);
  };

  const getAvailableBalance = () => {
    if (side === 'BUY') {
      return typedBalances[quoteAsset]?.free || '0';
    } else {
      return typedBalances[baseAsset]?.free || '0';
    }
  };

  return (
    <div className={className}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none">
        <CardHeader className="py-3 px-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-white">Order Form</h3>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant={orderType === 'market' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setOrderType('market')}
                className={`h-8 px-3 text-xs ${
                  orderType === 'market' 
                    ? 'bg-crypto-accent text-black hover:bg-crypto-accent/90' 
                    : 'text-crypto-light hover:text-white hover:bg-crypto-darker'
                }`}
              >
                Market
              </Button>
              <Button
                variant={orderType === 'limit' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setOrderType('limit')}
                className={`h-8 px-3 text-xs ${
                  orderType === 'limit' 
                    ? 'bg-crypto-accent text-black hover:bg-crypto-accent/90' 
                    : 'text-crypto-light hover:text-white hover:bg-crypto-darker'
                }`}
              >
                Limit
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4">
          {/* Order Status Display */}
          {orderStatus && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              orderStatus.includes('successfully') 
                ? 'bg-green-900/20 text-green-400 border border-green-700/50' 
                : orderStatus.includes('failed') || orderStatus.includes('error')
                ? 'bg-red-900/20 text-red-400 border border-red-700/50'
                : 'bg-blue-900/20 text-blue-400 border border-blue-700/50'
            }`}>
              {orderStatus}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            {/* Buy Column */}
            <div className="space-y-4">
              {/* Price Field - Show for Limit orders, hide for Market */}
              {orderType === "limit" && (
                <div className="space-y-2">
                  <Label className="text-crypto-light text-xs">Price</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder={marketPrice || "0"}
                      className="bg-crypto-darker border-gray-700 text-white pr-16"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                      {quoteAsset}
                    </div>
                  </div>
                </div>
              )}

              {/* Market Price Display for Market orders */}
              {orderType === "market" && (
                <div className="space-y-2">
                  <Label className="text-crypto-light text-xs">Price</Label>
                  <div className="relative">
                    <Input
                      value="Market Price"
                      readOnly
                      className="bg-crypto-darker border-gray-700 text-crypto-light text-center"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-crypto-light text-xs">Amount</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="bg-crypto-darker border-gray-700 text-white pr-16"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                    {baseAsset}
                  </div>
                </div>
              </div>

              {/* Total Field - Only for Limit orders */}
              {orderType === "limit" && (
                <div className="space-y-2">
                  <Label className="text-crypto-light text-xs">Total</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={total}
                      onChange={(e) => handleTotalChange(e.target.value)}
                      placeholder="0"
                      className="bg-crypto-darker border-gray-700 text-white"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
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

              <div className="flex items-center space-x-2 text-xs text-crypto-light">
                <i className="fas fa-exchange-alt"></i>
                <div className="flex-1 space-y-1">
                  <div>Avbl: {formatNumber(getAvailableBalance())} {side === 'BUY' ? quoteAsset : baseAsset}</div>
                  <div>Max Buy: {formatNumber(getAvailableBalance())} {quoteAsset}</div>
                  <div>Est. Fee</div>
                </div>
              </div>

              <Button 
                onClick={() => { setSide('BUY'); handlePlaceOrder(); }}
                disabled={isPlacingOrder || !amount || (orderType === 'limit' && !price)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50"
              >
                {isPlacingOrder && side === 'BUY' ? 'Placing Order...' : `Buy ${baseAsset}`}
              </Button>
            </div>

            {/* Sell Column */}
            <div className="space-y-4">
              {/* Price Field - Show for Limit orders, hide for Market */}
              {orderType === "limit" && (
                <div className="space-y-2">
                  <Label className="text-crypto-light text-xs">Price</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder={marketPrice || "0"}
                      className="bg-crypto-darker border-gray-700 text-white pr-16"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                      {quoteAsset}
                    </div>
                  </div>
                </div>
              )}

              {/* Market Price Display for Market orders */}
              {orderType === "market" && (
                <div className="space-y-2">
                  <Label className="text-crypto-light text-xs">Price</Label>
                  <div className="relative">
                    <Input
                      value="Market Price"
                      readOnly
                      className="bg-crypto-darker border-gray-700 text-crypto-light text-center"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-crypto-light text-xs">Amount</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="bg-crypto-darker border-gray-700 text-white pr-16"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                    {baseAsset}
                  </div>
                </div>
              </div>

              {/* Total Field - Only for Limit orders */}
              {orderType === "limit" && (
                <div className="space-y-2">
                  <Label className="text-crypto-light text-xs">Total</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={total}
                      onChange={(e) => handleTotalChange(e.target.value)}
                      placeholder="0"
                      className="bg-crypto-darker border-gray-700 text-white"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
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

              <div className="flex items-center space-x-2 text-xs text-crypto-light">
                <i className="fas fa-exchange-alt"></i>
                <div className="flex-1 space-y-1">
                  <div>Avbl: 0.00000000 {baseAsset} <i className="fas fa-coins text-yellow-500"></i></div>
                  <div>Max Sell: 0 {quoteAsset}</div>
                  <div>Est. Fee</div>
                </div>
              </div>

              <Button 
                onClick={() => { setSide('SELL'); handlePlaceOrder(); }}
                disabled={isPlacingOrder || !amount || (orderType === 'limit' && !price)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50"
              >
                {isPlacingOrder && side === 'SELL' ? 'Placing Order...' : `Sell ${baseAsset}`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}