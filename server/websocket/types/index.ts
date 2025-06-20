import WebSocket from 'ws';

export interface UserConnection {
  ws: WebSocket;
  userId: number;
  listenKey?: string;
}

export interface MarketSubscription {
  ws: WebSocket;
  symbols: Set<string>;
  dataType?: string;
  interval?: string;
  clientId?: string;
}

export interface TickerClient {
  ws: WebSocket;
  clientId: string;
  symbols: Set<string>;
  isActive: boolean;
}

export interface KlineClient {
  ws: WebSocket;
  clientId: string;
  symbol: string;
  interval: string;
  isActive: boolean;
}

export interface BalanceSubscription {
  ws: WebSocket;
  userId: number;
  exchangeId: number;
  symbol: string;
  clientId?: string;
}

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
  closePosition?: boolean;
  activationPrice?: string;
  callbackRate?: string;
  workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
  priceProtect?: boolean;
}

export interface OrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  workingTime: number;
  selfTradePreventionMode: string;
}

export interface MarketUpdate {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  timestamp: number;
}

export interface KlineUpdate {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
  timestamp: number;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
  symbol?: string;
  interval?: string;
  symbols?: string[];
  dataType?: string;
  clientId?: string;
  message?: string;
  exchangeId?: number;
  asset?: string;
  userId?: number;
  apiKey?: string;
  requestId?: string;
}

export interface ExtendedWebSocket extends WebSocket {
  clientId: string;
  isAlive: boolean;
  subscriptions?: SubscriptionInfo[];
  userId?: number;
  balanceSubscriptions?: Set<string>;
  balanceIntervals?: { [key: string]: NodeJS.Timeout };
}

export interface SubscriptionInfo {
  symbol?: string;
  interval?: string;
  dataType?: string;
  depth?: number;
  [key: string]: any;
}
