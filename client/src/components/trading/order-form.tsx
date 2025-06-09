import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrderWebSocket } from "@/hooks/useOrderWebSocket";
import { useQuery } from "@tanstack/react-query";

interface OrderFormProps {
  className?: string;
  symbol?: string;
}

interface MarketData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
}

interface BalanceData {
  asset: string;
  free: string;
  locked: string;
}

export function OrderForm({ className, symbol = "ICPUSDT" }: OrderFormProps) {
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [total, setTotal] = useState("");
  const [marketPrice, setMarketPrice] = useState("");
  const [useTPSL, setUseTPSL] = useState(false);
  const [balances, setBalances] = useState<Record<string, BalanceData>>({});
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // WebSocket for real-time market data and order placement
  const { lastMessage, sendMessage, isConnected } = useOrderWebSocket(
    `wss://${window.location.host.replace(':5000', ':8080')}`,
    {
      onOpen: () => {
        sendMessage({
          type: 'subscribe',
          symbols: [symbol]
        });
      }
    }
  );

  // Fetch user balances
  const { data: exchangeBalances } = useQuery({
    queryKey: ['/api/exchanges/1/balance', symbol],
    refetchInterval: 5000
  });

  // Get base and quote assets from symbol
  const baseAsset = symbol.replace('USDT', '').replace('USDC', '').replace('BTC', '');
  const quoteAsset = symbol.includes('USDT') ? 'USDT' : symbol.includes('USDC') ? 'USDC' : 'BTC';

  // Process WebSocket market data
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        if (data.type === 'market_update' && data.data.symbol === symbol) {
          setMarketPrice(data.data.price);
          if (orderType === 'market') {
            setPrice(data.data.price);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }
  }, [lastMessage, symbol, orderType]);

  // Calculate total when price or amount changes
  useEffect(() => {
    if (price && amount) {
      const totalValue = (parseFloat(price) * parseFloat(amount)).toFixed(8);
      setTotal(totalValue);
    }
  }, [price, amount]);

  // Calculate amount when total changes
  const handleTotalChange = (value: string) => {
    setTotal(value);
    if (price && value) {
      const amountValue = (parseFloat(value) / parseFloat(price)).toFixed(8);
      setAmount(amountValue);
    }
  };

  // Handle order placement
  const handlePlaceOrder = () => {
    const orderData = {
      type: 'place_order',
      userId: 1, // Get from auth context
      exchangeId: 1,
      symbol: symbol,
      side: side,
      orderType: orderType.toUpperCase(),
      quantity: amount,
      ...(orderType === 'limit' && { price: price }),
      timeInForce: 'GTC',
      clientOrderId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    sendMessage(orderData);
  };

  // Get available balance for the selected side
  const getAvailableBalance = () => {
    if (side === 'BUY') {
      return balances[quoteAsset]?.free || '0';
    } else {
      return balances[baseAsset]?.free || '0';
    }
  };

  return (
    <div className={className}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none">
        <CardHeader className="py-3 px-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex space-x-4">
              <button className="text-white text-sm font-medium">Spot</button>
              <button className="text-crypto-light hover:text-white text-sm">Cross</button>
              <button className="text-crypto-light hover:text-white text-sm">Isolated</button>
              <button className="text-crypto-light hover:text-white text-sm">Grid</button>
            </div>
            <div className="flex items-center space-x-4 text-xs text-crypto-light">
              <div className="flex items-center space-x-1">
                <i className="fas fa-percentage"></i>
                <span>Fee Level</span>
              </div>
              <div className="flex items-center space-x-1">
                <i className="fas fa-robot"></i>
                <span>Auto-Invest</span>
              </div>
              <div className="flex items-center space-x-1">
                <i className="fas fa-euro-sign"></i>
                <span>Buy with EUR</span>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4">
          <Tabs value={orderType} onValueChange={(value) => setOrderType(value as "market" | "limit")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-crypto-darker">
              <TabsTrigger value="market" className="data-[state=active]:bg-crypto-accent data-[state=active]:text-black">
                Market
              </TabsTrigger>
              <TabsTrigger value="limit" className="data-[state=active]:bg-crypto-accent data-[state=active]:text-black">
                Limit
              </TabsTrigger>
            </TabsList>

            {/* Market Order Form */}
            <TabsContent value="market" className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Buy Column */}
                <div className="space-y-4">
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

                  <div className="space-y-2">
                    <Label className="text-crypto-light text-xs">Total</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={total}
                        onChange={(e) => handleTotalChange(e.target.value)}
                        placeholder="0"
                        className="bg-crypto-darker border-gray-700 text-white pr-16"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crypto-light text-sm">
                        {quoteAsset}
                      </div>
                      <button className="absolute right-1 top-1/2 -translate-y-1/2 text-crypto-light text-xs hover:text-white">
                        <i className="fas fa-chevron-down"></i>
                      </button>
                    </div>
                    <div className="text-xs text-crypto-light">
                      Minimum 5 {quoteAsset}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-crypto-light">
                    <i className="fas fa-exchange-alt"></i>
                    <div className="flex-1 space-y-1">
                      <div>Avbl: {parseFloat(getAvailableBalance()).toFixed(8)} {quoteAsset} <i className="fas fa-coins text-yellow-500"></i></div>
                      <div>Max Buy: 0.00000 {baseAsset}</div>
                      <div>Est. Fee</div>
                    </div>
                  </div>

                  <Button 
                    onClick={() => { setSide('BUY'); handlePlaceOrder(); }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
                  >
                    Buy {baseAsset}
                  </Button>
                </div>

                {/* Sell Column */}
                <div className="space-y-4">
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
                      <button className="absolute right-1 top-1/2 -translate-y-1/2 text-crypto-light text-xs hover:text-white">
                        <i className="fas fa-chevron-down"></i>
                      </button>
                    </div>
                  </div>

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
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
                  >
                    Sell {baseAsset}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Limit Order Form */}
            <TabsContent value="limit" className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Buy Column */}
                <div className="space-y-4">
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
                      <button className="absolute right-1 top-1/2 -translate-y-1/2 text-crypto-light text-xs hover:text-white">
                        <i className="fas fa-chevron-down"></i>
                      </button>
                    </div>
                  </div>

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
                      <button className="absolute right-1 top-1/2 -translate-y-1/2 text-crypto-light text-xs hover:text-white">
                        <i className="fas fa-chevron-down"></i>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-crypto-light">
                    <i className="fas fa-exchange-alt"></i>
                  </div>

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
                        Minimum 5 {quoteAsset}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="tpsl-buy" 
                      checked={useTPSL}
                      onCheckedChange={(checked) => setUseTPSL(checked === true)}
                      className="border-gray-600"
                    />
                    <Label htmlFor="tpsl-buy" className="text-crypto-light text-xs">TP/SL</Label>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-crypto-light">
                    <div className="flex-1 space-y-1">
                      <div>Avbl: {parseFloat(getAvailableBalance()).toFixed(8)} {quoteAsset} <i className="fas fa-coins text-yellow-500"></i></div>
                      <div>Max Buy: 0.00000 {baseAsset}</div>
                      <div>Est. Fee</div>
                    </div>
                  </div>

                  <Button 
                    onClick={() => { setSide('BUY'); handlePlaceOrder(); }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
                  >
                    Buy {baseAsset}
                  </Button>
                </div>

                {/* Sell Column */}
                <div className="space-y-4">
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
                      <button className="absolute right-1 top-1/2 -translate-y-1/2 text-crypto-light text-xs hover:text-white">
                        <i className="fas fa-chevron-down"></i>
                      </button>
                    </div>
                  </div>

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
                      <button className="absolute right-1 top-1/2 -translate-y-1/2 text-crypto-light text-xs hover:text-white">
                        <i className="fas fa-chevron-down"></i>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-crypto-light">
                    <i className="fas fa-exchange-alt"></i>
                  </div>

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
                        Minimum 5 {quoteAsset}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="tpsl-sell" 
                      checked={useTPSL}
                      onCheckedChange={(checked) => setUseTPSL(checked === true)}
                      className="border-gray-600"
                    />
                    <Label htmlFor="tpsl-sell" className="text-crypto-light text-xs">TP/SL</Label>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-crypto-light">
                    <div className="flex-1 space-y-1">
                      <div>Avbl: 0.00000000 {baseAsset} <i className="fas fa-coins text-yellow-500"></i></div>
                      <div>Max Sell: 0 {quoteAsset}</div>
                      <div>Est. Fee</div>
                    </div>
                  </div>

                  <Button 
                    onClick={() => { setSide('SELL'); handlePlaceOrder(); }}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
                  >
                    Sell {baseAsset}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}