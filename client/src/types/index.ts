export interface MarketData {
  [pair: string]: {
    price: number;
    change: number;
  };
}

export interface UserStats {
  totalBalance: string;
  totalPnl: string;
  activeBots: number;
  totalTrades: number;
  winRate: string;
}

export interface WebSocketMessage {
  type: 'connected' | 'market_update' | 'trade_executed' | 'bot_status';
  data?: any;
  clientId?: string;
  message?: string;
}

export interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface CreateBotFormData {
  name: string;
  strategy: string;
  tradingPair: string;
  exchangeId: number;
  investmentAmount: string;
  configuration: Record<string, any>;
}
