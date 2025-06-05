import { TradingStrategy } from "@/types";

export const TRADING_STRATEGIES: TradingStrategy[] = [
  {
    id: 'grid',
    name: 'Grid Trading',
    description: 'Buy low, sell high with automated grid orders',
    icon: 'fas fa-th'
  },
  {
    id: 'martingale',
    name: 'Martingale',
    description: 'Double down strategy for trend recovery',
    icon: 'fas fa-chart-line'
  },
  {
    id: 'dca',
    name: 'Dollar Cost Average',
    description: 'Regular purchases to average cost over time',
    icon: 'fas fa-calendar-alt'
  }
];

export const TRADING_PAIRS = [
  'BTC/USDT',
  'ETH/USDT',
  'ADA/USDT',
  'BNB/USDT',
  'SOL/USDT',
  'DOT/USDT',
  'LINK/USDT',
  'AVAX/USDT'
];

export const EXCHANGE_OPTIONS = [
  { id: 1, name: 'Binance', value: 'binance' },
  { id: 2, name: 'Coinbase Pro', value: 'coinbase' },
  { id: 3, name: 'Kraken', value: 'kraken' },
  { id: 4, name: 'KuCoin', value: 'kucoin' }
];
