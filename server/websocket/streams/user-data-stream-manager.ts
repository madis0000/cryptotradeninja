import WebSocket from 'ws';
import crypto from 'crypto';
import { TradingOperationsManager } from '../managers/trading-operations-manager';
import { getGlobalWebSocketService } from '../websocket-service';
import { storage } from '../../storage';
import { decryptApiCredentials } from '../../encryption';

export class UserDataStreamManager {
  private tradingOperationsManager: TradingOperationsManager;
  private userStreams = new Map<number, WebSocket>(); // exchangeId -> WebSocket
  private listenKeys = new Map<number, string>(); // exchangeId -> listenKey
  private reconnectTimeouts = new Map<number, NodeJS.Timeout>(); // exchangeId -> timeout
  private failureCount = new Map<number, number>(); // exchangeId -> failure count
  private maxFailures = 5; // Maximum consecutive failures before stopping reconnect attempts
  
  constructor(tradingOperationsManager: TradingOperationsManager) {
    this.tradingOperationsManager = tradingOperationsManager;
    console.log('[USER DATA STREAM] User Data Stream Manager initialized');
  }

  async startUserDataStream(exchangeId: number): Promise<void> {
    console.log(`[USER DATA STREAM] Starting user data stream for exchange ${exchangeId}`);
    
    try {
      // Stop existing stream if any
      await this.stopUserDataStream(exchangeId);
      
      // Generate listen key from Binance
      const listenKey = await this.generateListenKey(exchangeId);
      if (!listenKey) {
        throw new Error('Failed to generate listen key');
      }
      
      this.listenKeys.set(exchangeId, listenKey);
      
      // Connect to user data stream
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }        // Use database-stored WebSocket stream endpoint
      let streamUrl;
      
      // Check if wsStreamEndpoint is configured in database
      if (exchange.wsStreamEndpoint) {
        // For user data streams, we need to handle the URL construction properly
        // User data streams use /ws/<listenKey> format, not the combined stream format
        const baseEndpoint = exchange.wsStreamEndpoint;
          // Check if this is a testnet.binance.vision endpoint
        if (baseEndpoint.includes('testnet.binance.vision')) {
          // For testnet user data streams, use wss://stream.testnet.binance.vision/ws/<listenKey>
          streamUrl = `wss://stream.testnet.binance.vision/ws/${listenKey}`;
        } else if (baseEndpoint.includes('stream.binance.com')) {
          // For mainnet user data streams, use wss://stream.binance.com:9443/ws/<listenKey>
          streamUrl = `wss://stream.binance.com:9443/ws/${listenKey}`;
        } else {
          // Generic handling for other endpoints
          if (baseEndpoint.endsWith('/ws')) {
            // Database endpoint already includes /ws, just append listenKey
            streamUrl = `${baseEndpoint}/${listenKey}`;
          } else {
            // Database endpoint doesn't include /ws, add it
            streamUrl = `${baseEndpoint}/ws/${listenKey}`;
          }
        }
        console.log(`[USER DATA STREAM] Using corrected stream endpoint for user data: ${streamUrl.replace(listenKey, 'xxx...xxx')}`);
      } else {        // Fallback to default endpoints
        const isTestnet = exchange.isTestnet || exchange.name.toLowerCase().includes('testnet');
        streamUrl = isTestnet 
          ? `wss://stream.testnet.binance.vision/ws/${listenKey}`
          : `wss://stream.binance.com:9443/ws/${listenKey}`;
        console.log(`[USER DATA STREAM] Using fallback endpoint for ${isTestnet ? 'testnet' : 'mainnet'}`);
      }
      
      console.log(`[USER DATA STREAM] Connecting to user data stream: ${streamUrl}`);
      
      const ws = new WebSocket(streamUrl);
      this.userStreams.set(exchangeId, ws);        ws.on('open', () => {
        console.log(`[USER DATA STREAM] ✅ Connected to ${exchange.name} user data stream`);
        console.log(`[USER DATA STREAM] 🎧 Monitoring order status changes and fills for real-time updates`);
        // Reset failure count on successful connection
        this.failureCount.delete(exchangeId);
      });
      
      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleUserDataEvent(exchangeId, event);
        } catch (error) {
          console.error('[UNIFIED WS OPEN ORDERS] ❌ Failed to parse message:', error);
        }
      });      ws.on('error', (error) => {
        console.error(`[USER DATA STREAM] ❌ WebSocket error for exchange ${exchangeId}:`, error);
        console.error(`[USER DATA STREAM] ❌ Failed URL: ${streamUrl}`);
        console.error(`[USER DATA STREAM] ❌ Exchange details: ${exchange.name} (${exchange.isTestnet ? 'testnet' : 'live'})`);
        console.error(`[USER DATA STREAM] ❌ Listen key: ${listenKey ? listenKey.substring(0, 10) + '...' : 'null'}`);
        
        // Increment failure count
        const currentFailures = this.failureCount.get(exchangeId) || 0;
        this.failureCount.set(exchangeId, currentFailures + 1);
        
        // Only schedule reconnect if we haven't exceeded max failures
        if (currentFailures < this.maxFailures) {
          this.scheduleReconnect(exchangeId);
        } else {
          console.error(`[USER DATA STREAM] ❌ Max failures (${this.maxFailures}) reached for exchange ${exchangeId}. Stopping reconnect attempts.`);
          console.error(`[USER DATA STREAM] ❌ Please check your exchange configuration and WebSocket endpoints.`);
        }
      });
        ws.on('close', (code, reason) => {
        console.log(`[USER DATA STREAM] 🔌 Connection closed for exchange ${exchangeId} - Code: ${code}, Reason: ${reason}`);
        console.log(`[USER DATA STREAM] 🔌 URL was: ${streamUrl}`);
        this.userStreams.delete(exchangeId);
        this.scheduleReconnect(exchangeId);
      });
      
    } catch (error) {
      console.error(`[USER DATA STREAM] Failed to start user data stream for exchange ${exchangeId}:`, error);
      throw error;
    }
  }

  private async handleUserDataEvent(exchangeId: number, event: any): Promise<void> {
    try {
      if (event.e === 'executionReport') {
        await this.handleExecutionReport(exchangeId, event);
      } else if (event.e === 'balanceUpdate') {
        console.log(`[USER DATA STREAM] Balance update: ${event.a} ${event.d}`);
      } else if (event.e === 'listenKeyExpired') {
        console.log(`[USER DATA STREAM] Listen key expired for exchange ${exchangeId}, reconnecting...`);
        await this.startUserDataStream(exchangeId);
      } else {
        console.log(`[USER DATA STREAM] Unhandled event type: ${event.e}`);
      }
    } catch (error) {
      console.error('[USER DATA STREAM] Error handling user data event:', error);
    }
  }
  private async handleExecutionReport(exchangeId: number, data: any): Promise<void> {
    console.log(`[USER DATA STREAM] Order update: ${data.i} - ${data.X} (${data.s} ${data.S})`);
    
    // Enhanced order status logging for comprehensive monitoring
    const orderStatus = {
      orderId: data.i,
      symbol: data.s,
      side: data.S,
      type: data.o,
      quantity: data.q,
      price: data.p,
      stopPrice: data.P,
      executedQty: data.z,
      cummulativeQuoteQty: data.Z,
      status: data.X,
      timeInForce: data.f,
      clientOrderId: data.c,
      commission: data.n,
      commissionAsset: data.N,
      tradeTime: data.T,
      exchangeId: exchangeId
    };

    console.log(`[UNIFIED WS ORDER MONITORING] 📊 Order Status Update:`, orderStatus);

    // Broadcast comprehensive order status update to all clients
    const wsService = getGlobalWebSocketService();
    if (wsService) {
      // Broadcast detailed order status update
      wsService.broadcastOrderStatusUpdate(orderStatus);
      
      // Broadcast comprehensive order update for frontend consumption
      wsService.broadcastOrderUpdate({
        type: 'execution_report',
        exchangeId: exchangeId,
        orderId: data.i,
        symbol: data.s,
        side: data.S,
        orderType: data.o,
        quantity: data.q,
        price: data.p,
        executedQty: data.z,
        cummulativeQuoteQty: data.Z,
        status: data.X,
        timeInForce: data.f,
        clientOrderId: data.c,
        commission: data.n,
        commissionAsset: data.N,
        tradeTime: data.T,
        updateTime: Date.now(),
        isRealTimeUpdate: true
      });
    }
    
    if (data.X === 'FILLED') {
      console.log(`[USER DATA STREAM] ✅ Order ${data.i} filled via WebSocket - processing...`);
        try {
        // Find the bot and cycle associated with this order
        const order = await storage.getCycleOrderByExchangeId(data.i.toString());
        if (!order) {
          console.log(`[USER DATA STREAM] ⚠️  Order ${data.i} not found in database, might be a manual trade - broadcasting fill notification...`);
          
          // Broadcast fill notification for manual trades
          if (wsService) {
            wsService.broadcastOrderFillNotification({
              id: data.i,
              exchangeOrderId: data.i.toString(),
              symbol: data.s,
              side: data.S,
              quantity: data.z,
              price: data.p,
              status: 'filled',
              commission: data.n,
              commissionAsset: data.N,
              isManualTrade: true,
              exchangeId: exchangeId,
              orderType: 'manual_trade',
              tradeTime: data.T
            });
          }
          return;
        }
        
        const botId = order.botId;
        const cycleId = order.cycleId;
        
        // Update order status in database
        await storage.updateCycleOrder(order.id, {
          status: 'filled',
          filledQuantity: data.z,
          filledPrice: data.p
        });
        
        console.log(`[USER DATA STREAM] ✓ Updated order ${order.id} status to filled`);
        
        // Determine order type
        let orderType = 'unknown';
        if (order.orderType === 'base_order') {
          orderType = 'base_order';
        } else if (order.orderType === 'safety_order') {
          orderType = 'safety_order';
        } else if (order.orderType === 'take_profit') {
          orderType = 'take_profit';
        }
        
        // Broadcast order fill notification to all connected clients
        if (wsService) {
          wsService.broadcastOrderFillNotification({
            id: order.id,
            exchangeOrderId: data.i.toString(),
            botId: botId,
            orderType: orderType,
            symbol: data.s,
            side: data.S,
            quantity: data.z,
            price: data.p,
            status: 'filled',
            commission: data.n,
            commissionAsset: data.N,
            isManualTrade: false,
            exchangeId: exchangeId,
            tradeTime: data.T
          });
        }
        
        // Call the trading operations manager to handle the order fill
        await this.tradingOperationsManager.handleOrderFillEvent(botId, cycleId, {
          orderType: orderType,
          orderId: data.i,
          symbol: data.s,
          side: data.S,
          quantity: data.z,
          price: data.p,
          commission: data.n,
          commissionAsset: data.N
        });
        
      } catch (error) {
        console.error(`[USER DATA STREAM] Failed to process order fill for ${data.i}:`, error);
      }
    } else if (data.X === 'CANCELED') {
      console.log(`[USER DATA STREAM] Order ${data.i} cancelled via WebSocket`);
        try {
        const order = await storage.getCycleOrderByExchangeId(data.i.toString());
        if (order) {
          await storage.updateCycleOrder(order.id, {
            status: 'cancelled'
          });
          console.log(`[USER DATA STREAM] ✓ Updated order ${order.id} status to cancelled`);
        } else {
          console.log(`[USER DATA STREAM] ⚠️  Cancelled order ${data.i} not found in database, might be a manual trade`);
        }
      } catch (error) {
        console.error(`[USER DATA STREAM] Failed to update cancelled order ${data.i}:`, error);
      }
    } else if (data.X === 'NEW') {
      console.log(`[USER DATA STREAM] Order update: ${data.i} - NEW (${data.s} ${data.S})`);
    } else if (data.X === 'PARTIALLY_FILLED') {
      console.log(`[USER DATA STREAM] Order update: ${data.i} - PARTIALLY_FILLED (${data.s} ${data.S}) - ${data.z}/${data.q} filled`);
    } else if (data.X === 'EXPIRED') {
      console.log(`[USER DATA STREAM] Order update: ${data.i} - EXPIRED (${data.s} ${data.S})`);
    }    
    // Broadcast open orders update after order status change
    if (data.X === 'NEW' || data.X === 'CANCELED' || data.X === 'FILLED' || data.X === 'PARTIALLY_FILLED' || data.X === 'EXPIRED') {
      try {
        console.log(`[UNIFIED WS OPEN ORDERS] 🔄 Order status changed to ${data.X}, updating open orders for exchange ${exchangeId}`);
        
        // Get updated open orders for the exchange (all symbols)
        const openOrders = await this.tradingOperationsManager.getOpenOrders(exchangeId);
        
        console.log(`[UNIFIED WS OPEN ORDERS] 📡 Broadcasting updated open orders (${openOrders.length} orders) to all clients`);
        
        // Broadcast to all connected clients
        if (wsService) {
          wsService.broadcastOpenOrdersUpdate(exchangeId, undefined, openOrders);
        }
      } catch (error) {
        console.error('[UNIFIED WS OPEN ORDERS] ❌ Error broadcasting open orders update:', error);
      }
    }
  }

  private async generateListenKey(exchangeId: number): Promise<string | null> {
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );      // Use database-stored REST API endpoint or fallback
      let baseUrl;
      if (exchange.restApiEndpoint) {
        baseUrl = exchange.restApiEndpoint;
        console.log(`[USER DATA STREAM] Using database-stored REST endpoint: ${baseUrl}`);
      } else {
        const isTestnet = exchange.isTestnet || exchange.name.toLowerCase().includes('testnet');
        baseUrl = isTestnet 
          ? 'https://testnet.binance.vision'
          : 'https://api.binance.com';
        console.log(`[USER DATA STREAM] Using fallback REST endpoint: ${baseUrl}`);
      }
        console.log(`[USER DATA STREAM] Requesting listen key from: ${baseUrl}/api/v3/userDataStream`);
      
      const response = await fetch(`${baseUrl}/api/v3/userDataStream`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const data = await response.json();
      
      if (response.ok && data.listenKey) {
        console.log(`[USER DATA STREAM] ✓ Generated listen key for ${exchange.name}`);
        return data.listenKey;
      } else {
        console.error(`[USER DATA STREAM] Failed to generate listen key for ${exchange.name}:`, {
          status: response.status,
          statusText: response.statusText,
          data: data
        });
        return null;
      }
      
    } catch (error) {
      console.error('[USER DATA STREAM] Error generating listen key:', error);
      return null;
    }
  }
  private scheduleReconnect(exchangeId: number): void {
    // Clear existing timeout
    const existingTimeout = this.reconnectTimeouts.get(exchangeId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const currentFailures = this.failureCount.get(exchangeId) || 0;
    
    // Don't schedule reconnect if we've exceeded max failures
    if (currentFailures >= this.maxFailures) {
      console.log(`[USER DATA STREAM] ⚠️ Not scheduling reconnect for exchange ${exchangeId} - max failures reached`);
      return;
    }

    // Schedule reconnection with exponential backoff
    const backoffDelay = Math.min(5000 * Math.pow(2, currentFailures), 60000); // Max 60 seconds
    console.log(`[USER DATA STREAM] ⏰ Scheduling reconnect for exchange ${exchangeId} in ${backoffDelay}ms (attempt ${currentFailures + 1}/${this.maxFailures})`);
    
    const timeout = setTimeout(async () => {
      console.log(`[USER DATA STREAM] Attempting to reconnect to exchange ${exchangeId}...`);
      try {
        await this.startUserDataStream(exchangeId);
      } catch (error) {
        console.error(`[USER DATA STREAM] Reconnection failed for exchange ${exchangeId}:`, error);
        // Don't schedule another reconnect here - let the error handler do it
      }
    }, backoffDelay);
    
    this.reconnectTimeouts.set(exchangeId, timeout);
  }
  async stopUserDataStream(exchangeId: number): Promise<void> {
    console.log(`[USER DATA STREAM] Stopping user data stream for exchange ${exchangeId}`);
    
    // Clear reconnect timeout
    const timeout = this.reconnectTimeouts.get(exchangeId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(exchangeId);
    }
    
    // Clear failure count
    this.failureCount.delete(exchangeId);
    
    // Close WebSocket connection
    const ws = this.userStreams.get(exchangeId);
    if (ws) {
      ws.close();
      this.userStreams.delete(exchangeId);
    }
    
    // Clean up listen key
    this.listenKeys.delete(exchangeId);
  }

  async stopAllUserDataStreams(): Promise<void> {
    console.log('[USER DATA STREAM] Stopping all user data streams...');
    
    const exchangeIds = Array.from(this.userStreams.keys());
    for (const exchangeId of exchangeIds) {
      await this.stopUserDataStream(exchangeId);
    }
    
    console.log('[USER DATA STREAM] All user data streams stopped');
  }

  isConnected(exchangeId: number): boolean {
    const ws = this.userStreams.get(exchangeId);
    return ws?.readyState === WebSocket.OPEN;
  }

  getActiveStreams(): number[] {
    return Array.from(this.userStreams.keys()).filter(exchangeId => this.isConnected(exchangeId));
  }

  // Method to reset failure count for a specific exchange (useful for manual retry)
  resetFailureCount(exchangeId: number): void {
    this.failureCount.delete(exchangeId);
    console.log(`[USER DATA STREAM] Reset failure count for exchange ${exchangeId}`);
  }
}
