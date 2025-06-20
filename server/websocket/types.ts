import WebSocket from 'ws';

// WebSocket client interfaces
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

export interface WebSocketMessage {
  type: string;
  symbols?: string[];
  symbol?: string;
  interval?: string;
  exchangeId?: number;
  [key: string]: any;
}

export interface KlineUpdate {
  symbol: string;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
  trades: number;
  interval: string;
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