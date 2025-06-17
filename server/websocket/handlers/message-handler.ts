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

    // Store client subscription info
    if (!this.clientManager.getClient(clientId)) {
      this.clientManager.addClient(clientId, ws);
    }

    // Handle ticker subscriptions
    if (dataType === 'ticker') {
      await this.tickerStreamManager.subscribeClient(clientId, symbols, exchangeId);
      
      // Send initial data for subscribed symbols
      for (const symbol of symbols) {
        const cachedPrice = this.tickerStreamManager.getCachedPrice(symbol);
        if (cachedPrice) {
          ws.send(JSON.stringify({
            type: 'ticker_update',
            data: cachedPrice
          }));
        }
      }
      
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
    }

    // Send initial market data
    this.tickerStreamManager.sendCurrentMarketData(ws, symbols);
  }

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
