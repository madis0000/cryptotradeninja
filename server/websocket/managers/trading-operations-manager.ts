import WebSocket from 'ws';
import crypto from 'crypto';
import { OrderRequest, OrderResponse } from '../types';
import { db } from '../../db';
import { storage } from '../../storage';
import { decryptApiCredentials } from '../../encryption';
import { getBinanceSymbolFilters, adjustQuantity, adjustPrice } from '../../binance-filters';
import { BotLoggerManager } from '../../bot-logger';
import config from '../../config';
import { BotCycle, CycleOrder, tradingBots } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class TradingOperationsManager {
  private pendingOrderRequests = new Map<string, { resolve: Function, reject: Function, timestamp: number }>();
  
  // Cycle management optimization for concurrent operations
  private cycleOperationLocks = new Map<number, Promise<void>>();
  private pendingCycleStarts = new Map<number, NodeJS.Timeout>();
  constructor() {
    console.log('[UNIFIED WS] [TRADING OPERATIONS MANAGER] Initialized');
  }

  // Place order
  async placeOrder(exchangeId: number, orderRequest: OrderRequest): Promise<OrderResponse | null> {
    try {
      console.log(`[TRADING] Placing order:`, orderRequest);
      
      // Mock implementation - in production this would make actual API calls
      return {
        symbol: orderRequest.symbol,
        orderId: Math.floor(Math.random() * 1000000),
        orderListId: -1,
        clientOrderId: crypto.randomBytes(16).toString('hex'),
        transactTime: Date.now(),
        price: orderRequest.price || '0',
        origQty: orderRequest.quantity,
        executedQty: '0',
        cummulativeQuoteQty: '0',
        status: 'NEW',
        timeInForce: orderRequest.timeInForce || 'GTC',
        type: orderRequest.type,
        side: orderRequest.side,
        workingTime: Date.now(),
        selfTradePreventionMode: 'NONE'
      };
    } catch (error) {
      console.error(`[TRADING] Error placing order:`, error);
      return null;
    }  }

  // Cancel order
  async cancelOrder(botId: number, orderId: string): Promise<void> {
    console.log(`[UNIFIED WS] [TRADING] Cancelling order ${orderId} for bot ${botId}`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      // Get API credentials
      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      // Cancel order on exchange
      const cancelParams = new URLSearchParams({
        symbol: bot.tradingPair,
        orderId: orderId,
        timestamp: Date.now().toString()
      });

      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(cancelParams.toString())
        .digest('hex');
      
      cancelParams.append('signature', signature);

      const cancelResponse = await fetch(`${exchange.restApiEndpoint}/api/v3/order?${cancelParams.toString()}`, {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });

      const cancelResult = await cancelResponse.json();
      
      if (!cancelResponse.ok) {
        throw new Error(`Order cancellation failed: ${cancelResult.msg || 'Unknown error'}`);
      }

      console.log(`[UNIFIED WS] [TRADING] Order ${orderId} cancelled successfully`);
      
      // Log the cancellation
      const logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      logger.logStrategyAction('ORDER_CANCELLED', { orderId, symbol: bot.tradingPair });
      
    } catch (error) {
      console.error(`[UNIFIED WS] [TRADING] Error cancelling order ${orderId}:`, error);
      throw error;
    }
  }
  // Get pending requests count
  getPendingRequestsCount(): number {
    return this.pendingOrderRequests.size;
  }

  // Missing methods from legacy websocket service
  async validateMartingaleOrderPlacement(botData: any): Promise<void> {
    console.log('[MARTINGALE] Validating order placement for bot:', botData.name);
    
    try {
      // Get exchange credentials
      const exchange = await storage.getExchange(botData.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      // Get symbol filters for validation
      const filters = await getBinanceSymbolFilters(botData.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');
      
      // Validate base order size
      const baseOrderQty = parseFloat(botData.baseOrderSize);
      if (baseOrderQty < filters.minQty) {
        throw new Error(`Base order size ${baseOrderQty} is below minimum ${filters.minQty} for ${botData.tradingPair}`);
      }

      // Validate safety order size
      const safetyOrderQty = parseFloat(botData.safetyOrderSize);
      if (safetyOrderQty < filters.minQty) {
        throw new Error(`Safety order size ${safetyOrderQty} is below minimum ${filters.minQty} for ${botData.tradingPair}`);
      }

      console.log('[MARTINGALE] Order placement validation passed');
    } catch (error) {
      console.error('[MARTINGALE] Validation failed:', error);
      throw error;
    }
  }
  async placeInitialBaseOrder(botId: number, cycleId: number): Promise<void> {
    console.log(`\n[UNIFIED WS] [MARTINGALE STRATEGY] ===== STARTING BASE ORDER EXECUTION =====`);
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] Bot ID: ${botId}, Cycle ID: ${cycleId}`);
    
    let logger: any = null;
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Bot ${botId} not found`);
        return;
      }

      // Initialize logger
      logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      logger.logStrategyAction('BASE_ORDER_START', {
        botId,
        cycleId,
        strategy: bot.strategy,
        tradingPair: bot.tradingPair
      });

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✓ Bot loaded: ${bot.name} (${bot.tradingPair}, ${bot.direction})`);

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ No exchange found for bot ${botId}`);
        throw new Error('Exchange not found');
      }

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✓ Exchange loaded: ${exchange.name}`);

      // Get current market price
      const symbol = bot.tradingPair;
      const tickerResponse = await fetch(`${exchange.restApiEndpoint || 'https://testnet.binance.vision'}/api/v3/ticker/price?symbol=${symbol}`);
      const tickerData = await tickerResponse.json();
      const currentPrice = parseFloat(tickerData.price);
      
      if (!currentPrice || currentPrice <= 0) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Unable to fetch market price for ${symbol}`);
        throw new Error(`Unable to fetch market price for ${symbol}`);
      }
      
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✓ Market price for ${symbol}: $${currentPrice.toFixed(6)}`);

      // Calculate base order quantity
      const baseOrderAmount = parseFloat(bot.baseOrderAmount);
      const rawQuantity = baseOrderAmount / currentPrice;

      // Fetch dynamic symbol filters from Binance exchange
      const filters = await getBinanceSymbolFilters(symbol, exchange.restApiEndpoint || 'https://testnet.binance.vision');
      
      // Apply Binance LOT_SIZE filter using correct step size
      const quantity = adjustQuantity(rawQuantity, filters.stepSize, filters.minQty, filters.qtyDecimals);

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 BASE ORDER CALCULATION:`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Investment Amount: $${baseOrderAmount}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Current Price: $${currentPrice.toFixed(6)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Raw Quantity: ${rawQuantity.toFixed(8)} ${symbol.replace('USDT', '')}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted Quantity: ${quantity.toFixed(filters.qtyDecimals)} ${symbol.replace('USDT', '')} (LOT_SIZE compliant)`);

      // Create the base order record
      const baseOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'base_order',
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        orderCategory: 'MARKET',
        symbol: symbol,
        quantity: quantity.toFixed(filters.qtyDecimals),
        price: currentPrice.toFixed(filters.priceDecimals),
        status: 'pending'
      });

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✓ Created base order record in database (ID: ${baseOrder.id})`);

      // Place order on exchange via API
      try {
        const { apiKey, apiSecret } = decryptApiCredentials(
          exchange.apiKey,
          exchange.apiSecret,
          exchange.encryptionIv
        );

        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚀 Placing order on ${exchange.name}...`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Order Type: MARKET ${bot.direction === 'long' ? 'BUY' : 'SELL'}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Symbol: ${symbol}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Quantity: ${quantity.toFixed(filters.qtyDecimals)}`);
        
        // Place market order for base order
        const orderParams = new URLSearchParams({
          symbol: bot.tradingPair,
          side: bot.direction === 'long' ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: quantity.toString(),
          timestamp: Date.now().toString()
        });

        const signature = crypto
          .createHmac('sha256', apiSecret)
          .update(orderParams.toString())
          .digest('hex');
        
        orderParams.append('signature', signature);

        const orderResponse = await fetch(`${exchange.restApiEndpoint}/api/v3/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: orderParams
        });

        const orderResult = await orderResponse.json();
        
        if (!orderResponse.ok) {
          throw new Error(`Order placement failed: ${orderResult.msg || 'Unknown error'}`);
        }

        if (orderResult && orderResult.orderId) {          // Update the order with exchange order ID
          await storage.updateCycleOrder(baseOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'filled',
            filledQuantity: quantity.toFixed(filters.qtyDecimals),
            filledPrice: currentPrice.toFixed(filters.priceDecimals)
          });

          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Base order filled successfully!`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Filled Quantity: ${quantity.toFixed(filters.qtyDecimals)}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Filled Price: $${currentPrice.toFixed(filters.priceDecimals)}`);

          logger.logStrategyAction('BASE_ORDER_FILLED', {
            orderId: orderResult.orderId,
            quantity: quantity.toFixed(filters.qtyDecimals),
            price: currentPrice.toFixed(filters.priceDecimals),
            amount: baseOrderAmount
          });

          // TODO: Place take profit order
          // TODO: Place first safety order if configured
          
        } else {
          console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Order result missing orderId:`, orderResult);
          throw new Error('Order result missing orderId');
        }
        
      } catch (orderError) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Order placement failed:`, orderError);
          // Update order status to failed
        await storage.updateCycleOrder(baseOrder.id, {
          status: 'failed'
        });
        
        logger.logError('BASE_ORDER_FAILED', { error: (orderError as Error).message });
        throw orderError;
      }
      
    } catch (error) {
      console.error('[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Base order execution failed:', error);
      if (logger) {
        logger.logError('BASE_ORDER_ERROR', { error: (error as Error).message });
      }
      throw error;
    }
  }

  async updateMarketSubscriptions(symbols: string[]): Promise<void> {
    console.log('[TRADING OPS] Updating market subscriptions for symbols:', symbols);
    // This method would coordinate with stream managers
    // Implementation pending - requires integration with stream managers
  }

  async placeLiquidationOrder(botId: number, cycleId: number): Promise<void> {
    console.log(`[TRADING OPS] Placing liquidation order for bot ${botId}, cycle ${cycleId}`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      // Implementation pending - would handle position liquidation
      console.log('[TRADING OPS] Liquidation order placement - implementation pending');
      
    } catch (error) {
      console.error('[TRADING OPS] Liquidation order failed:', error);
      throw error;
    }
  }

  async generateListenKey(exchangeId: number): Promise<string> {
    console.log(`[TRADING OPS] Generating listen key for exchange ${exchangeId}`);
    
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      // Implementation pending - would generate Binance listen key
      const mockListenKey = crypto.randomBytes(32).toString('hex');
      console.log('[TRADING OPS] Listen key generation - implementation pending');
      
      return mockListenKey;
      
    } catch (error) {
      console.error('[TRADING OPS] Listen key generation failed:', error);
      throw error;
    }
  }
  async getAccountBalance(exchangeId: number, asset: string): Promise<any> {
    console.log(`[UNIFIED WS BALANCE FETCHING] Getting account balance for exchange ${exchangeId}, asset ${asset}`);
    
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      // For testnet, use mock balance data
      if (exchange.isTestnet) {
        console.log(`[UNIFIED WS BALANCE FETCHING] Using testnet mock balance for exchange ${exchangeId}`);
        const mockBalances: Record<string, string> = {
          'USDT': '127247.18000000',
          'BTC': '0.05000000',
          'ETH': '2.50000000',
          'BNB': '10.00000000'
        };
        
        const availableBalance = mockBalances[asset] || '0.00000000';
        
        return {
          asset,
          free: availableBalance,
          locked: '0.00000000',
          timestamp: Date.now()
        };
      }

      // For production exchanges, would fetch actual balance from exchange API
      console.log(`[UNIFIED WS BALANCE FETCHING] Production balance fetch not implemented for exchange ${exchangeId}`);
      
      return {
        asset,
        free: '0.0',
        locked: '0.0',
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error(`[UNIFIED WS BALANCE FETCHING] Account balance fetch failed for exchange ${exchangeId}, asset ${asset}:`, error);
      throw error;
    }
  }
}
