/**
 * WebSocket utility functions for consistent exchange handling
 */

export interface WebSocketMessageWithExchange {
  type: string;
  exchangeId?: number;
  [key: string]: any;
}

/**
 * Generate a unique client ID for tracking messages
 */
function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a WebSocket message with proper exchange ID handling
 * @param message - The base message object
 * @param selectedExchangeId - The currently selected exchange ID (can be string or number)
 * @returns Message with properly formatted exchange ID
 */
export function createWebSocketMessage(
  message: { type: string; [key: string]: any }, 
  selectedExchangeId?: string | number | null
): WebSocketMessageWithExchange {
  const baseMessage: WebSocketMessageWithExchange = { ...message };
  
  if (selectedExchangeId) {
    const exchangeId = typeof selectedExchangeId === 'string' 
      ? parseInt(selectedExchangeId) 
      : selectedExchangeId;
    
    if (!isNaN(exchangeId) && exchangeId > 0) {
      baseMessage.exchangeId = exchangeId;
    }
  }
  
  return baseMessage;
}

/**
 * Create a subscription message with exchange ID
 */
export function createSubscriptionMessage(
  symbols: string[], 
  selectedExchangeId?: string | number | null
): WebSocketMessageWithExchange {
  return createWebSocketMessage({
    type: 'subscribe',
    symbols
  }, selectedExchangeId);
}

/**
 * Create a change subscription message (for symbol/interval changes)
 */
export function createChangeSubscriptionMessage(
  symbol: string,
  interval: string,
  selectedExchangeId?: string | number | null
): WebSocketMessageWithExchange {
  return createWebSocketMessage({
    type: 'change_subscription',
    symbol,
    interval
  }, selectedExchangeId);
}

/**
 * Create a balance request message
 */
export function createBalanceRequestMessage(
  asset: string = 'USDT',
  selectedExchangeId?: string | number | null
): WebSocketMessageWithExchange {
  return createWebSocketMessage({
    type: 'get_balance',
    asset
  }, selectedExchangeId);
}

/**
 * Create a configure stream message
 */
export function createConfigureStreamMessage(
  config: {
    dataType: string;
    symbols: string[];
    interval?: string;
    depth?: number;
  },
  selectedExchangeId?: string | number | null
): WebSocketMessageWithExchange {
  return createWebSocketMessage({
    type: 'configure_stream',
    ...config
  }, selectedExchangeId);
}

/**
 * Creates a balance subscription message
 */
export function createBalanceSubscriptionMessage(
  symbol: string,
  exchangeId: number,
  clientId?: string
) {
  return {
    type: 'subscribe_balance',
    symbol,
    exchangeId,
    clientId: clientId || generateClientId()
  };
}

/**
 * Creates a balance unsubscription message
 */
export function createBalanceUnsubscriptionMessage(
  symbol: string,
  exchangeId: number,
  clientId?: string
) {
  return {
    type: 'unsubscribe_balance',
    symbol,
    exchangeId,
    clientId: clientId || generateClientId()
  };
}

/**
 * Creates a balance subscription message for trading page
 */
export function createTradingBalanceSubscriptionMessage(
  symbol: string,
  exchangeId: number,
  clientId?: string
): WebSocketMessageWithExchange {
  return createWebSocketMessage({
    type: 'subscribe_trading_balance',
    symbol,
    clientId: clientId || generateClientId()
  }, exchangeId);
}

/**
 * Creates a balance unsubscription message for trading page
 */
export function createTradingBalanceUnsubscriptionMessage(
  symbol: string,
  exchangeId: number,
  clientId?: string
): WebSocketMessageWithExchange {
  return createWebSocketMessage({
    type: 'unsubscribe_trading_balance',
    symbol,
    clientId: clientId || generateClientId()
  }, exchangeId);
}

/**
 * Creates a specific asset balance request message
 */
export function createAssetBalanceRequestMessage(
  asset: string,
  exchangeId: number,
  clientId?: string
): WebSocketMessageWithExchange {
  return createWebSocketMessage({
    type: 'get_asset_balance',
    asset,
    clientId: clientId || generateClientId()
  }, exchangeId);
}

/**
 * Creates a comprehensive balance request for trading (base + quote currencies)
 */
export function createTradingBalanceRequestMessage(
  symbol: string,
  exchangeId: number,
  clientId?: string
): WebSocketMessageWithExchange {
  return createWebSocketMessage({
    type: 'get_trading_balance',
    symbol,
    clientId: clientId || generateClientId()
  }, exchangeId);
}
