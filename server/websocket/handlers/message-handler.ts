import WebSocket from 'ws';
import { WebSocketMessage } from '../types';
import { TickerStreamManager } from '../streams/ticker-stream-manager';
import { KlineStreamManager } from '../streams/kline-stream-manager';
import { TradingOperationsManager } from '../managers/trading-operations-manager';

export class MessageHandler {
  private tickerStreamManager: TickerStreamManager;
  private klineStreamManager: KlineStreamManager;
  private tradingOperationsManager: TradingOperationsManager;
  private readonly DEFAULT_EXCHANGE_ID = 1; // Default to exchange ID 1 for backward compatibility

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

    const targetExchangeId = exchangeId || this.DEFAULT_EXCHANGE_ID;
    console.log(`[UNIFIED WS SERVER] Change subscription request: symbol=${symbol}, interval=${interval}, exchangeId=${targetExchangeId}`);

    // Setup ticker client
    await this.tickerStreamManager.setupTickerClient(ws, clientId, [symbol], targetExchangeId);
    
    // Setup kline client
    await this.klineStreamManager.setupKlineClient(ws, clientId, symbol, interval, targetExchangeId);    // Send initial data
    this.tickerStreamManager.sendCurrentMarketData(ws, [symbol]);
    await this.klineStreamManager.sendHistoricalKlineData(ws, symbol, interval);
  }
  // Handle subscribe (ticker subscription)
  private async handleSubscribe(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { symbols, exchangeId } = message;
    
    if (!symbols || !Array.isArray(symbols)) {
      console.error('[MESSAGE HANDLER] Subscribe missing symbols array');
      return;
    }

    const targetExchangeId = exchangeId || this.DEFAULT_EXCHANGE_ID;
    console.log(`[UNIFIED WS SERVER] Subscribe request: symbols=${symbols.join(', ')}, exchangeId=${targetExchangeId}`);

    // Setup ticker client
    await this.tickerStreamManager.setupTickerClient(ws, clientId, symbols, targetExchangeId);

    // Send initial data
    this.tickerStreamManager.sendCurrentMarketData(ws, symbols);
  }
  // Handle configure stream (kline configuration)
  private async handleConfigureStream(ws: WebSocket, message: WebSocketMessage, clientId: string): Promise<void> {
    const { dataType, symbols, interval, exchangeId } = message;
    
    if (!dataType || !symbols || !Array.isArray(symbols) || !interval) {
      console.error('[MESSAGE HANDLER] Configure stream missing required parameters');
      return;
    }

    const targetExchangeId = exchangeId || this.DEFAULT_EXCHANGE_ID;
    console.log(`[UNIFIED WS SERVER] Configure stream request: dataType=${dataType}, symbols=[${symbols.join(', ')}], interval=${interval}, exchangeId=${targetExchangeId}`);

    if (dataType === 'kline') {
      // For kline streams, we typically handle one symbol at a time
      const symbol = symbols[0]; // Take the first symbol
      
      // Setup kline client
      await this.klineStreamManager.setupKlineClient(ws, clientId, symbol, interval, targetExchangeId);      // Send initial data
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
    }
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
