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
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
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
}
