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
      }
      
      // Use testnet endpoint for testnet exchanges
      const isTestnet = exchange.name.toLowerCase().includes('testnet');
      const streamUrl = isTestnet 
        ? `wss://testnet.binance.vision/ws/${listenKey}`
        : `wss://stream.binance.com:9443/ws/${listenKey}`;
      
      console.log(`[USER DATA STREAM] Connecting to ${isTestnet ? 'testnet' : 'mainnet'} user data stream...`);
      
      const ws = new WebSocket(streamUrl);
      this.userStreams.set(exchangeId, ws);
      
      ws.on('open', () => {
        console.log(`[USER DATA STREAM] ✅ Connected to ${exchange.name} user data stream`);
      });
      
      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleUserDataEvent(exchangeId, event);
        } catch (error) {
          console.error('[USER DATA STREAM] Failed to parse message:', error);
        }
      });
      
      ws.on('error', (error) => {
        console.error(`[USER DATA STREAM] WebSocket error for exchange ${exchangeId}:`, error);
        this.scheduleReconnect(exchangeId);
      });
      
      ws.on('close', (code, reason) => {
        console.log(`[USER DATA STREAM] Connection closed for exchange ${exchangeId} - Code: ${code}, Reason: ${reason}`);
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

  private async handleExecutionReport(exchangeId: number, event: any): Promise<void> {
    const { 
      i: orderId, 
      s: symbol, 
      S: side, 
      X: orderStatus,
      q: originalQuantity,
      z: executedQuantity,
      p: price,
      n: commission,
      N: commissionAsset
    } = event;
    
    console.log(`[USER DATA STREAM] Order update: ${orderId} - ${orderStatus} (${symbol} ${side})`);
    
    if (orderStatus === 'FILLED') {
      try {
        // Find the bot and cycle associated with this order
        const order = await storage.getCycleOrderByExchangeId(orderId.toString());
        if (!order) {
          console.log(`[USER DATA STREAM] ⚠️  Order ${orderId} not found in database, skipping...`);
          return;
        }
        
        const botId = order.botId;
        const cycleId = order.cycleId;
        
        // Update order status in database
        await storage.updateCycleOrder(order.id, {
          status: 'filled',
          filledQuantity: executedQuantity,
          filledPrice: price
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
        const notification = {
          botId: order.botId,
          orderId: order.id,
          exchangeOrderId: order.exchangeOrderId,
          orderType: order.orderType,
          orderSubType: order.orderSubType,
          symbol: event.s,
          side: event.S,
          quantity: event.q,
          price: event.p || event.L,
          status: 'filled',
          filledAt: new Date().toISOString(),
          timestamp: new Date().toISOString()
        };
        
        // Get WebSocketService instance to broadcast
        const wsService = (global as any).webSocketService;
        if (wsService) {
          wsService.broadcastOrderFillNotification(notification);
        }
        
        // Call the trading operations manager to handle the order fill
        await this.tradingOperationsManager.handleOrderFillEvent(botId, cycleId, {
          orderType: orderType,
          orderId: orderId,
          symbol: symbol,
          side: side,
          quantity: executedQuantity,
          price: price,
          commission: commission,
          commissionAsset: commissionAsset
        });
        
      } catch (error) {
        console.error(`[USER DATA STREAM] Failed to process order fill for ${orderId}:`, error);
      }
    } else if (orderStatus === 'CANCELED') {
      console.log(`[USER DATA STREAM] Order ${orderId} cancelled via WebSocket`);
        try {
        const order = await storage.getCycleOrderByExchangeId(orderId.toString());
        if (order) {
          await storage.updateCycleOrder(order.id, {
            status: 'cancelled'
          });
        }
      } catch (error) {
        console.error(`[USER DATA STREAM] Failed to update cancelled order ${orderId}:`, error);
      }
    } else if (orderStatus === 'NEW') {
      console.log(`[USER DATA STREAM] Order update: ${orderId} - NEW (${symbol} ${side})`);
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
      );

      // Use testnet endpoint for testnet exchanges
      const isTestnet = exchange.name.toLowerCase().includes('testnet');
      const baseUrl = isTestnet 
        ? 'https://testnet.binance.vision'
        : 'https://api.binance.com';
      
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
        console.error(`[USER DATA STREAM] Failed to generate listen key:`, data);
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

    // Schedule reconnection in 5 seconds
    const timeout = setTimeout(async () => {
      console.log(`[USER DATA STREAM] Attempting to reconnect to exchange ${exchangeId}...`);
      try {
        await this.startUserDataStream(exchangeId);
      } catch (error) {
        console.error(`[USER DATA STREAM] Reconnection failed for exchange ${exchangeId}:`, error);
        // Schedule another reconnect
        this.scheduleReconnect(exchangeId);
      }
    }, 5000);
    
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
}
