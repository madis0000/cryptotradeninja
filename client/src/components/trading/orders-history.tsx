import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useState, useEffect } from "react";

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

interface OrderHistoryData {
  id: string;
  userId: number;
  botId?: number;
  exchangeOrderId?: string;
  tradingPair: string;
  side: string;
  orderType: string;
  amount: string;
  quoteAmount: string;
  price: string;
  status: string;
  pnl: string;
  fee: string;
  feeAsset?: string;
  executedAt: string;
  type: 'manual' | 'bot';
}

interface OrdersHistoryProps {
  className?: string;
  openOrders?: OpenOrderData[];
  openOrdersLoading?: boolean;
  openOrdersError?: string | null;
  onRefreshOpenOrders?: () => void;
  onCancelOrder?: (orderId: string, symbol: string) => Promise<void>;
}

export function OrdersHistory({ 
  className, 
  openOrders = [], 
  openOrdersLoading = false, 
  openOrdersError = null, 
  onRefreshOpenOrders,
  onCancelOrder 
}: OrdersHistoryProps) {
  const [activeTab, setActiveTab] = useState<'open' | 'history' | 'trades' | 'funds' | 'grid'>('open');
  const [orderHistory, setOrderHistory] = useState<OrderHistoryData[]>([]);
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [orderHistoryError, setOrderHistoryError] = useState<string | null>(null);
  const [cancellingOrders, setCancellingOrders] = useState<Set<string>>(new Set());

  // Fetch order history from database
  const fetchOrderHistory = async () => {
    setOrderHistoryLoading(true);
    setOrderHistoryError(null);
    
    try {
      console.log('[ORDER HISTORY] 📡 Fetching order history from database...');
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const response = await fetch('/api/orders/history?limit=100', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[ORDER HISTORY] ✅ Retrieved ${data.length} order history entries`);
      setOrderHistory(data);
      
    } catch (error) {
      console.error('[ORDER HISTORY] ❌ Error fetching order history:', error);
      setOrderHistoryError(error instanceof Error ? error.message : 'Failed to fetch order history');
    } finally {
      setOrderHistoryLoading(false);
    }
  };

  // Load order history when component mounts or when history tab is selected
  useEffect(() => {
    if (activeTab === 'history' && orderHistory.length === 0) {
      fetchOrderHistory();
    }
  }, [activeTab]);
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatPrice = (price: string) => {
    return parseFloat(price).toFixed(8);
  };

  const formatQuantity = (quantity: string) => {
    return parseFloat(quantity).toFixed(6);
  };

  // Handle order cancellation
  const handleCancelOrder = async (orderId: string, symbol: string) => {
    if (!onCancelOrder) return;
    
    setCancellingOrders(prev => new Set(prev).add(orderId));
    
    try {
      console.log(`[CANCEL ORDER] 🚫 Cancelling order ${orderId} for ${symbol}...`);
      await onCancelOrder(orderId, symbol);
      console.log(`[CANCEL ORDER] ✅ Order ${orderId} cancelled successfully`);
    } catch (error) {
      console.error(`[CANCEL ORDER] ❌ Failed to cancel order ${orderId}:`, error);
    } finally {
      setCancellingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  return (
    <div className={className}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none flex flex-col">
        <CardHeader className="py-3 px-4 border-b border-gray-800 shrink-0">
          <div className="flex space-x-4 text-xs">
            <button 
              className={`${activeTab === 'open' ? 'text-crypto-accent' : 'text-crypto-light hover:text-white'}`}
              onClick={() => setActiveTab('open')}
            >
              Open Orders({openOrders.length})
            </button>
            <button 
              className={`${activeTab === 'history' ? 'text-crypto-accent' : 'text-crypto-light hover:text-white'}`}
              onClick={() => setActiveTab('history')}
            >
              Order History
            </button>
            <button 
              className={`${activeTab === 'trades' ? 'text-crypto-accent' : 'text-crypto-light hover:text-white'}`}
              onClick={() => setActiveTab('trades')}
            >
              Trade History
            </button>
            <button 
              className={`${activeTab === 'funds' ? 'text-crypto-accent' : 'text-crypto-light hover:text-white'}`}
              onClick={() => setActiveTab('funds')}
            >
              Funds
            </button>
            <button 
              className={`${activeTab === 'grid' ? 'text-crypto-accent' : 'text-crypto-light hover:text-white'}`}
              onClick={() => setActiveTab('grid')}
            >
              Grid Orders
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto">
          {activeTab === 'open' && (
            <div className="h-full">
              {openOrdersLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-crypto-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-crypto-light text-sm">Loading open orders...</p>
                  </div>
                </div>
              ) : openOrdersError ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-red-400 text-sm mb-2">Error loading open orders</p>
                    <p className="text-gray-500 text-xs mb-4">{openOrdersError}</p>
                    {onRefreshOpenOrders && (
                      <button 
                        onClick={onRefreshOpenOrders}
                        className="px-3 py-1 bg-crypto-accent text-white text-xs rounded hover:bg-crypto-accent/80"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ) : openOrders.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-4xl text-gray-500 mb-4">
                      <i className="fas fa-list-alt"></i>
                    </div>
                    <p className="text-gray-500 text-sm">No open orders</p>
                    <p className="text-gray-600 text-xs">Your active orders will appear here</p>
                  </div>
                </div>
              ) : (
                <div className="text-xs">
                  <div className="grid grid-cols-8 gap-2 p-3 bg-gray-900 text-gray-400 font-medium">
                    <div>Symbol</div>
                    <div>Side</div>
                    <div>Type</div>
                    <div>Quantity</div>
                    <div>Price</div>
                    <div>Status</div>
                    <div>Time</div>
                    <div>Action</div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {openOrders.map((order) => (
                      <div key={order.orderId} className="grid grid-cols-8 gap-2 p-3 border-b border-gray-800 hover:bg-gray-900">
                        <div className="text-white">{order.symbol}</div>
                        <div className={order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                          {order.side}
                        </div>
                        <div className="text-gray-300">{order.type}</div>
                        <div className="text-gray-300">{formatQuantity(order.quantity)}</div>
                        <div className="text-gray-300">{formatPrice(order.price)}</div>
                        <div className="text-yellow-400">{order.status}</div>
                        <div className="text-gray-400">{formatDate(order.time)}</div>
                        <div className="flex justify-center">
                          {onCancelOrder && (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED') && (
                            <button
                              onClick={() => handleCancelOrder(order.orderId.toString(), order.symbol)}
                              disabled={cancellingOrders.has(order.orderId.toString())}
                              className="group relative overflow-hidden px-3 py-1.5 text-xs bg-gradient-to-r from-red-500/90 via-red-600/90 to-red-700/90 hover:from-red-500 hover:via-red-600 hover:to-red-700 text-white rounded-xl transition-all duration-300 disabled:from-red-400/60 disabled:via-red-400/60 disabled:to-red-400/60 disabled:cursor-not-allowed shadow-lg hover:shadow-red-500/25 transform hover:scale-110 hover:-translate-y-0.5 disabled:transform-none border border-red-400/20 hover:border-red-300/40"
                              title="Cancel Order"
                            >
                              {/* Subtle animated background glow */}
                              <div className="absolute inset-0 bg-gradient-to-r from-red-400/0 via-red-300/20 to-red-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                              
                              {cancellingOrders.has(order.orderId.toString()) ? (
                                <div className="flex items-center space-x-1.5 relative z-10">
                                  <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
                                  <span className="text-xs font-semibold">Cancelling...</span>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-1.5 relative z-10">
                                  <svg 
                                    className="w-3.5 h-3.5 group-hover:rotate-180 transition-all duration-300 drop-shadow-sm" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                  >
                                    <circle cx="12" cy="12" r="10" strokeWidth="2" className="opacity-40"/>
                                    <path 
                                      strokeLinecap="round" 
                                      strokeLinejoin="round" 
                                      strokeWidth={2.5} 
                                      d="M15 9l-6 6m0-6l6 6" 
                                    />
                                  </svg>
                                  <span className="text-xs font-semibold tracking-wide">Cancel</span>
                                </div>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'history' && (
            <div className="h-full">
              {orderHistoryLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-crypto-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-crypto-light text-sm">Loading order history...</p>
                  </div>
                </div>
              ) : orderHistoryError ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-red-400 text-sm mb-2">Error loading order history</p>
                    <p className="text-gray-500 text-xs mb-4">{orderHistoryError}</p>
                    <button 
                      onClick={fetchOrderHistory}
                      className="px-3 py-1 bg-crypto-accent text-white text-xs rounded hover:bg-crypto-accent/80"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : orderHistory.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-4xl text-gray-500 mb-4">
                      <i className="fas fa-history"></i>
                    </div>
                    <p className="text-gray-500 text-sm">No order history</p>
                    <p className="text-gray-600 text-xs">Your completed orders will appear here</p>
                  </div>
                </div>
              ) : (
                <div className="text-xs">
                  <div className="grid grid-cols-8 gap-2 p-3 bg-gray-900 text-gray-400 font-medium">
                    <div>Symbol</div>
                    <div>Side</div>
                    <div>Type</div>
                    <div>Amount</div>
                    <div>Price</div>
                    <div>Status</div>
                    <div>Source</div>
                    <div>Date</div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {orderHistory.map((order) => (
                      <div key={`${order.type}-${order.id}`} className="grid grid-cols-8 gap-2 p-3 border-b border-gray-800 hover:bg-gray-900">
                        <div className="text-white">{order.tradingPair}</div>
                        <div className={order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                          {order.side}
                        </div>
                        <div className="text-gray-300">{order.orderType}</div>
                        <div className="text-gray-300">{formatQuantity(order.amount)}</div>
                        <div className="text-gray-300">{formatPrice(order.price)}</div>
                        <div className="text-green-400">{order.status}</div>
                        <div className="text-gray-400">{order.type === 'bot' ? 'Bot' : 'Manual'}</div>
                        <div className="text-gray-400">{formatDate(new Date(order.executedAt).getTime())}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {(activeTab === 'trades' || activeTab === 'funds' || activeTab === 'grid') && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl text-gray-500 mb-4">
                  <i className="fas fa-history"></i>
                </div>
                <p className="text-gray-500 text-sm">{activeTab === 'trades' ? 'Trade History' : activeTab === 'funds' ? 'Funds' : 'Grid Orders'}</p>
                <p className="text-gray-600 text-xs">Feature coming soon</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}