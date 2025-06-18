import WebSocket from 'ws';
import { WebSocketMessage } from '../types';
import { TickerStreamManager } from '../streams/ticker-stream-manager';
import { KlineStreamManager } from '../streams/kline-stream-manager';
import { TradingOperationsManager } from '../managers/trading-operations-manager';
import { storage } from '../../storage';

export class MessageHandler {
  private tickerStreamManager: TickerStreamManager;
  private klineStreamManager: KlineStreamManager;
  private tradingOperationsManager: TradingOperationsManager;

  constructor(
    tickerStreamManager: TickerStreamManager,
    klineStreamManager: KlineStreamManager,
    tradingOperationsManager: TradingOperationsManager
  ) {
    this.tickerStreamManager = tickerStreamManager;
    this.klineStreamManager = klineStreamManager;
    this.tradingOperationsManager = tradingOperationsManager;
    console.log('[UNIFIED WS] [MESSAGE HANDLER] Initialized');
  }

  /**
   * Get the first available active exchange ID for a user
   * Falls back to any active exchange if user-specific exchange not found
   */
  private async getDefaultExchangeId(userId: number = 1): Promise<number | null> {
    try {
      // First try to get exchanges for the specific user
      const userExchanges = await storage.getExchangesByUserId(userId);
      const activeUserExchange = userExchanges.find(ex => ex.isActive);
      
      if (activeUserExchange) {
        console.log(`[MESSAGE HANDLER] Using user ${userId} exchange: ${activeUserExchange.id} (${activeUserExchange.name})`);
        return activeUserExchange.id;
      }

      // If no user-specific exchange found, get any active exchange as fallback
      console.log(`[MESSAGE HANDLER] No active exchanges found for user ${userId}, trying global fallback`);
      
      // Get all exchanges and find the first active one
      const allExchanges = await storage.getExchangesByUserId(1); // Try user ID 1 as fallback
      const activeExchange = allExchanges.find(ex => ex.isActive);
      
      if (activeExchange) {
        console.log(`[MESSAGE HANDLER] Using fallback exchange: ${activeExchange.id} (${activeExchange.name})`);
        return activeExchange.id;
      }

      console.error(`[MESSAGE HANDLER] No active exchanges found in the system`);
      return null;
    } catch (error) {
      console.error(`[MESSAGE HANDLER] Error getting default exchange ID:`, error);
      return null;
    }
  }

  // Handle incoming WebSocket messages
  async handleMessage(ws: WebSocket, data: any, clientId: string): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      console.log(`[UNIFIED WS SERVER] Received raw message: ${data.toString()}`);
      console.log('[UNIFIED WS SERVER] Parsed message:', message);      switch (message.type) {
        case 'change_subscription':
          await this.handleChangeSubscription(ws, message, clientId);
          break;
        
        case 'subscribe':
          await this.handleSubscribe(ws, message, clientId);
          break;
        
        case 'configure_stream':
          await this.handleConfigureStream(ws, message, clientId);
          break;
        
        case 'unsubscribe':
          await this.handleUnsubscribe(ws, message, clientId);
          break;
        
        case 'test':
          await this.handleTest(ws, message, clientId);
          break;
        
        case 'get_balance':
          await this.handleGetBalance(ws, message, clientId);
          break;
        
        case 'subscribe_balance':
          await this.handleSubscribeBalance(ws, message, clientId);
          break;
          case 'unsubscribe_balance':
          await this.handleUnsubscribeBalance(ws, message, clientId);
          break;
          case 'subscribe_ticker':
          await this.handleSubscribeTicker(ws, message, clientId);
          break;
        
        case 'get_trading_balance':
          await this.handleGetTradingBalance(ws, message, clientId);
          break;
        
        case 'subscribe_trading_balance':
          await this.handleSubscribeTradingBalance(ws, message, clientId);
          break;
        
        case 'unsubscribe_trading_balance':
          await this.handleUnsubscribeTradingBalance(ws, message, clientId);
          break;          case 'get_open_orders':
          {
            const exchangeId = message.exchangeId || await this.getDefaultExchangeId();
            if (exchangeId) {
              await this.handleGetOpenOrders(ws, exchangeId, message.symbol);
            } else {
              console.error('[MESSAGE HANDLER] No valid exchange ID found for get_open_orders');
              ws.send(JSON.stringify({ type: 'error', message: 'No valid exchange ID found' }));
            }
          }
          break;
        
        case 'subscribe_open_orders':
          {
            const exchangeId = message.exchangeId || await this.getDefaultExchangeId();
            if (exchangeId) {
              await this.handleSubscribeOpenOrders(ws, clientId, exchangeId, message.symbol);
            } else {
              console.error('[MESSAGE HANDLER] No valid exchange ID found for subscribe_open_orders');
              ws.send(JSON.stringify({ type: 'error', message: 'No valid exchange ID found' }));
            }
          }
          break;
        
        default:
          console.log(`[MESSAGE HANDLER] Unknown message type: ${message.type}`);
          break;
      }
    } catch (error) {
      console.error('[MESSAGE HANDLER] Error processing message:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    }
  }
  // Handle change subscription (symbol and interval change)
  private async handleChangeSubscription(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { symbol, interval, exchangeId } = message;
      if (!symbol || !interval) {
      console.error('[MESSAGE HANDLER] Change subscription missing symbol or interval');
      return;
    }

    const targetExchangeId = exchangeId || await this.getDefaultExchangeId();
    if (!targetExchangeId) {
      console.error('[MESSAGE HANDLER] No available exchange found');
      return;
    }
    console.log(`[UNIFIED WS SERVER] Change subscription request: symbol=${symbol}, interval=${interval}, exchangeId=${targetExchangeId}`);

    // Setup ticker client
    await this.tickerStreamManager.setupTickerClient(ws, clientId, [symbol], targetExchangeId);
    
    // Setup kline client
    await this.klineStreamManager.setupKlineClient(ws, clientId, symbol, interval, targetExchangeId);    // Send initial data
    this.tickerStreamManager.sendCurrentMarketData(ws, [symbol]);
    await this.klineStreamManager.sendHistoricalKlineData(ws, symbol, interval);
  }
  // Handle subscribe (ticker subscription)
  private async handleSubscribe(ws: WebSocket, message: any, clientId: string): Promise<void> {
    console.log(`[MESSAGE HANDLER] Subscribe request from ${clientId}:`, message);
    
    const { symbols, dataType = 'ticker', exchangeId } = message;
    
    if (!symbols || !Array.isArray(symbols)) {
      console.error('[MESSAGE HANDLER] Invalid symbols in subscribe request');
      return;
    }

    const targetExchangeId = exchangeId || await this.getDefaultExchangeId();
    if (!targetExchangeId) {
      console.error('[MESSAGE HANDLER] No available exchange found');
      return;
    }

    // Handle ticker subscriptions
    if (dataType === 'ticker') {
      // Setup ticker client instead of using subscribeClient
      await this.tickerStreamManager.setupTickerClient(ws, clientId, symbols, targetExchangeId);
      
      // Send initial market data for subscribed symbols
      this.tickerStreamManager.sendCurrentMarketData(ws, symbols);
      
      console.log(`[MESSAGE HANDLER] Client ${clientId} subscribed to tickers:`, symbols);
    }
    
    // Send confirmation
    ws.send(JSON.stringify({
      type: 'subscription_confirmed',
      symbols,
      dataType
    }));
  }  // Handle configure stream (kline configuration)
  private async handleConfigureStream(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { dataType, symbols, interval, exchangeId } = message;
    
    if (!dataType || !symbols || !Array.isArray(symbols) || symbols.length === 0 || !interval) {
      console.error('[MESSAGE HANDLER] Configure stream missing required parameters or empty symbols array');
      return;
    }

    // Validate that symbols array contains valid non-empty strings
    const validSymbols = symbols.filter(symbol => symbol && typeof symbol === 'string' && symbol.trim().length > 0);
    if (validSymbols.length === 0) {
      console.error('[MESSAGE HANDLER] Configure stream has no valid symbols');
      return;
    }

    const targetExchangeId = exchangeId || await this.getDefaultExchangeId();
    if (!targetExchangeId) {
      console.error('[MESSAGE HANDLER] No available exchange found');
      return;
    }
    console.log(`[UNIFIED WS SERVER] Configure stream request: dataType=${dataType}, symbols=[${validSymbols.join(', ')}], interval=${interval}, exchangeId=${targetExchangeId}`);

    if (dataType === 'kline') {
      // For kline streams, we typically handle one symbol at a time
      const symbol = validSymbols[0]; // Take the first valid symbol
      
      // Setup kline client
      await this.klineStreamManager.setupKlineClient(ws, clientId, symbol, interval, targetExchangeId);
      
      // Send initial data
      await this.klineStreamManager.sendHistoricalKlineData(ws, symbol, interval);
    }
  }

  // Handle test messages
  private async handleTest(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    console.log(`[MESSAGE HANDLER] Test message from client ${clientId}:`, message.message);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'test_response',
        message: 'Test message received successfully',
        clientId
      }));
    }
  }

  // Handle client disconnect
  handleClientDisconnect(clientId: string): void {
    console.log(`[MESSAGE HANDLER] Handling disconnect for client ${clientId}`);
    
    // Remove client from all managers
    this.tickerStreamManager.removeClient(clientId);
    this.klineStreamManager.removeClient(clientId);
  }

  // Handle unsubscribe (cleanup all subscriptions for client)
  private async handleUnsubscribe(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    console.log(`[UNIFIED WS SERVER] Unsubscribe request from client ${clientId}`);

    // Remove client from all managers
    this.tickerStreamManager.removeClient(clientId);
    this.klineStreamManager.removeClient(clientId);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'unsubscribe_response',
        message: 'Successfully unsubscribed from all streams',
        clientId
      }));
    }  }

  // Handle balance request
  private async handleGetBalance(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { exchangeId, asset } = message;
    
    const defaultExchangeId = await this.getDefaultExchangeId();
    const targetExchangeId = exchangeId || defaultExchangeId;
    
    if (!targetExchangeId) {
      console.error(`[UNIFIED WS BALANCE FETCHING] No available exchange found for balance request`);
      ws.send(JSON.stringify({
        type: 'balance_error',
        error: 'No available exchange found',
        exchangeId: exchangeId
      }));
      return;
    }
    
    const isAllBalancesRequest = !asset || asset === 'ALL';
    console.log(`[UNIFIED WS BALANCE FETCHING] Get balance request from client ${clientId}: exchangeId=${targetExchangeId}, asset=${asset || 'ALL'}, requestType=${isAllBalancesRequest ? 'ALL_BALANCES' : 'SINGLE_ASSET'}`);
      try {
      const balanceResult = await this.tradingOperationsManager.getAccountBalance(targetExchangeId, asset || 'ALL');
      console.log(`[UNIFIED WS BALANCE FETCHING] Retrieved balance for exchange ${targetExchangeId}:`, balanceResult);
      
      if (isAllBalancesRequest) {
        // Return ALL balances (for My Exchange page)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'balance_update',
            exchangeId: targetExchangeId,
            data: {
              balances: balanceResult.data?.balances || []
            },
            timestamp: balanceResult.timestamp || Date.now(),
            clientId
          }));
        }
      } else {
        // Return single asset balance (for Martingale bot)
        const targetAsset = asset;
        let assetBalance = null;
        if (balanceResult.data && balanceResult.data.balances) {
          assetBalance = balanceResult.data.balances.find((balance: any) => balance.asset === targetAsset);
        }
        
        console.log(`[UNIFIED WS BALANCE FETCHING] Found ${targetAsset} balance:`, assetBalance);
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'balance_update',
            exchangeId: targetExchangeId,
            asset: targetAsset,
            balance: assetBalance || { asset: targetAsset, free: '0.00000000', locked: '0.00000000' },
            timestamp: balanceResult.timestamp || Date.now(),
            clientId
          }));
        }
      }
    } catch (error) {
      console.error(`[UNIFIED WS BALANCE FETCHING] Error getting balance:`, error);
      
      // Send detailed error information
      if (ws.readyState === WebSocket.OPEN) {        const errorMessage = error instanceof Error ? error.message : String(error);
        const isDecryptionError = errorMessage.includes('decrypt') || errorMessage.includes('Decryption failed');
        ws.send(JSON.stringify({
          type: 'balance_error',
          message: isDecryptionError ? 'Failed to decrypt API credentials. Please check your exchange configuration.' : 'Failed to fetch balance',
          error: errorMessage,
          exchangeId: targetExchangeId,
          asset: asset || 'ALL',
          errorType: isDecryptionError ? 'DECRYPTION_ERROR' : 'API_ERROR',
          clientId
        }));      }
    }
  }

  // Handle balance subscription (for real-time updates)
  private async handleSubscribeBalance(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { exchangeId, asset } = message;
    
    const defaultExchangeId = await this.getDefaultExchangeId();
    const targetExchangeId = exchangeId || defaultExchangeId;
    
    if (!targetExchangeId) {
      console.error(`[UNIFIED WS BALANCE FETCHING] No available exchange found for balance subscription`);
      return;
    }
    
    console.log(`[UNIFIED WS BALANCE FETCHING] Subscribe balance request from client ${clientId}: exchangeId=${targetExchangeId}, asset=${asset || 'USDT'}`);
    
    // For now, we'll send the current balance and mark the client as subscribed
    // In the future, this could be extended to listen to real-time balance updates from exchanges
    await this.handleGetBalance(ws, message, clientId);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'balance_subscription_confirmed',
        exchangeId: targetExchangeId,
        asset: asset || 'USDT',
        message: 'Subscribed to balance updates',
        clientId
      }));
    }  }

  // Handle balance unsubscription
  private async handleUnsubscribeBalance(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    console.log(`[UNIFIED WS BALANCE FETCHING] Unsubscribe balance request from client ${clientId}`);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'balance_unsubscription_confirmed',
        message: 'Unsubscribed from balance updates',
        clientId
      }));
    }  }

  // Handle ticker subscription (dedicated ticker-only subscription)
  private async handleSubscribeTicker(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { symbols, exchangeId } = message;
    
    if (!symbols || !Array.isArray(symbols)) {
      console.error('[MESSAGE HANDLER] Subscribe ticker missing symbols array');
      return;
    }

    const targetExchangeId = exchangeId || await this.getDefaultExchangeId();
    if (!targetExchangeId) {
      console.error('[MESSAGE HANDLER] No available exchange found');
      return;
    }

    console.log(`[UNIFIED WS SERVER] Subscribe ticker request: symbols=${symbols.join(', ')}, exchangeId=${targetExchangeId}`);

    // Setup ticker client (dedicated ticker subscription)
    await this.tickerStreamManager.setupTickerClient(ws, clientId, symbols, targetExchangeId);

    // Send confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'ticker_subscription_confirmed',
        symbols,
        exchangeId: targetExchangeId,
        message: 'Subscribed to ticker updates',
        clientId
      }));
    }    // Send initial market data
    this.tickerStreamManager.sendCurrentMarketData(ws, symbols);
  }

  // Handle trading balance request (returns base and quote currencies for a trading symbol)
  private async handleGetTradingBalance(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { symbol, exchangeId } = message;
    
    if (!symbol) {
      console.error('[MESSAGE HANDLER] Get trading balance missing symbol');
      return;
    }

    const defaultExchangeId = await this.getDefaultExchangeId();
    const targetExchangeId = exchangeId || defaultExchangeId;
    
    if (!targetExchangeId) {
      console.error(`[MESSAGE HANDLER] No available exchange found for trading balance request`);
      return;
    }
    
    console.log(`[MESSAGE HANDLER] Get trading balance request from client ${clientId}: symbol=${symbol}, exchangeId=${targetExchangeId}`);
    
    // Extract base and quote assets from symbol
    const baseAsset = symbol.replace(/USDT|USDC|BUSD/g, '');
    const quoteAsset = symbol.includes('USDT') ? 'USDT' : 
                      symbol.includes('USDC') ? 'USDC' : 'BUSD';
    
    try {
      const balanceResult = await this.tradingOperationsManager.getAccountBalance(targetExchangeId, 'ALL');
      console.log(`[MESSAGE HANDLER] Retrieved trading balance for exchange ${targetExchangeId}:`, balanceResult);
      
      if (balanceResult.data && balanceResult.data.balances) {
        const baseBalance = balanceResult.data.balances.find((balance: any) => balance.asset === baseAsset);
        const quoteBalance = balanceResult.data.balances.find((balance: any) => balance.asset === quoteAsset);
        
        console.log(`[MESSAGE HANDLER] Found ${baseAsset} balance:`, baseBalance);
        console.log(`[MESSAGE HANDLER] Found ${quoteAsset} balance:`, quoteBalance);
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'trading_balance_update',
            exchangeId: targetExchangeId,
            symbol: symbol,
            baseBalance: baseBalance || { asset: baseAsset, free: '0.00000000', locked: '0.00000000' },
            quoteBalance: quoteBalance || { asset: quoteAsset, free: '0.00000000', locked: '0.00000000' },
            timestamp: balanceResult.timestamp || Date.now(),
            clientId
          }));
        }
      }
    } catch (error) {
      console.error(`[MESSAGE HANDLER] Error getting trading balance:`, error);
      
      if (ws.readyState === WebSocket.OPEN) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        ws.send(JSON.stringify({
          type: 'balance_error',
          message: 'Failed to fetch trading balance',
          error: errorMessage,
          exchangeId: targetExchangeId,
          symbol: symbol,
          clientId
        }));
      }
    }
  }

  // Handle trading balance subscription
  private async handleSubscribeTradingBalance(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { symbol, exchangeId } = message;
    
    const defaultExchangeId = await this.getDefaultExchangeId();
    const targetExchangeId = exchangeId || defaultExchangeId;
    
    if (!targetExchangeId) {
      console.error(`[MESSAGE HANDLER] No available exchange found for trading balance subscription`);
      return;
    }
    
    console.log(`[MESSAGE HANDLER] Subscribe trading balance request from client ${clientId}: symbol=${symbol}, exchangeId=${targetExchangeId}`);
    
    // Send current balance and mark client as subscribed
    await this.handleGetTradingBalance(ws, message, clientId);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'trading_balance_subscription_confirmed',
        exchangeId: targetExchangeId,
        symbol: symbol,
        message: 'Subscribed to trading balance updates',
        clientId
      }));
    }
  }

  // Handle trading balance unsubscription
  private async handleUnsubscribeTradingBalance(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    console.log(`[MESSAGE HANDLER] Unsubscribe trading balance request from client ${clientId}`);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'trading_balance_unsubscription_confirmed',
        message: 'Unsubscribed from trading balance updates',
        clientId
      }));
    }
  }
  // Add new handler methods
  private async handleGetOpenOrders(ws: WebSocket, exchangeId: number, symbol?: string): Promise<void> {
    try {
      console.log(`[UNIFIED WS OPEN ORDERS] Getting open orders for exchange ${exchangeId}, symbol: ${symbol || 'all'}`);
      
      const openOrders = await this.tradingOperationsManager.getOpenOrders(exchangeId, symbol);
      
      console.log(`[UNIFIED WS OPEN ORDERS] Retrieved ${openOrders.length} open orders`);
      
      ws.send(JSON.stringify({
        type: 'open_orders_update',
        data: {
          exchangeId,
          symbol,
          orders: openOrders,
          timestamp: Date.now()
        }
      }));
      
      console.log(`[UNIFIED WS OPEN ORDERS] ✅ Sent open orders data to client`);
      
    } catch (error) {
      console.error('[UNIFIED WS OPEN ORDERS] ❌ Error getting open orders:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to get open orders',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }  
  private async handleSubscribeOpenOrders(ws: WebSocket, clientId: string, exchangeId: number, symbol?: string): Promise<void> {
    try {
      console.log(`[UNIFIED WS OPEN ORDERS] Client ${clientId} subscribing to open orders for exchange ${exchangeId}, symbol: ${symbol || 'all'}`);
      
      // Store subscription info for this client
      if (!this.openOrderSubscriptions) {
        this.openOrderSubscriptions = new Map();
      }
      
      const subscriptionKey = `${exchangeId}-${symbol || 'ALL'}`;
      if (!this.openOrderSubscriptions.has(subscriptionKey)) {
        this.openOrderSubscriptions.set(subscriptionKey, new Set());
      }
      
      this.openOrderSubscriptions.get(subscriptionKey)?.add(clientId);
      
      console.log(`[UNIFIED WS OPEN ORDERS] Added client ${clientId} to subscription key: ${subscriptionKey}`);
      
      // Send initial open orders
      await this.handleGetOpenOrders(ws, exchangeId, symbol);
      
      ws.send(JSON.stringify({
        type: 'subscription_confirmed',
        channel: 'open_orders',
        exchangeId,
        symbol,
        message: `Subscribed to open orders for exchange ${exchangeId}${symbol ? ` symbol ${symbol}` : ' (all symbols)'}`
      }));
      
      console.log(`[UNIFIED WS OPEN ORDERS] ✅ Subscription confirmed for client ${clientId}`);
      
    } catch (error) {
      console.error('[UNIFIED WS OPEN ORDERS] ❌ Error subscribing to open orders:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to subscribe to open orders',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }
  
  // Add property for open order subscriptions
  private openOrderSubscriptions?: Map<string, Set<string>>;

  // Get status information
  getStatus(): any {
    return {
      tickerClients: this.tickerStreamManager.getActiveClientsCount(),
      tickerSubscriptions: this.tickerStreamManager.getActiveSubscriptionsCount(),
      klineClients: this.klineStreamManager.getActiveClientsCount(),
      klineSubscriptions: this.klineStreamManager.getActiveSubscriptionsCount(),
      pendingOrders: this.tradingOperationsManager.getPendingRequestsCount()
    };
  }
}
