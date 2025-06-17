import WebSocket from 'ws';
import crypto from 'crypto';
import { OrderRequest, OrderResponse } from '../types';
import { db } from '../../db';
import { storage } from '../../storage';
import { decryptApiCredentials } from '../../encryption';
import { getBinanceSymbolFilters, adjustQuantity, adjustPrice, ensureFilterCompliance } from '../../binance-filters';
import { BotLoggerManager } from '../../bot-logger';
import config from '../../config';
import { BotCycle, CycleOrder, tradingBots } from '@shared/schema';
import { getGlobalWebSocketService } from '../websocket-service';
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

      // Check account balance before placing order
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🔍 Checking account balance before order placement...`);
      try {
        const balanceData = await this.getAccountBalance(bot.exchangeId, 'USDT');
        const usdtBalance = balanceData?.data?.balances?.find((b: any) => b.asset === 'USDT');
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.free) : 0;
        
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 💰 Available USDT Balance: $${availableUSDT.toFixed(2)}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 💰 Required for order: $${baseOrderAmount.toFixed(2)}`);
        
        if (availableUSDT < baseOrderAmount) {
          console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Insufficient balance: Available $${availableUSDT.toFixed(2)}, Required $${baseOrderAmount.toFixed(2)}`);
          throw new Error(`Insufficient USDT balance: Available $${availableUSDT.toFixed(2)}, Required $${baseOrderAmount.toFixed(2)}`);
        } else {
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Sufficient balance available`);
        }
      } catch (balanceError) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ⚠️  Balance check failed:`, balanceError);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🔄 Proceeding with order placement anyway...`);
      }

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

        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🔧 Exchange Details:`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Name: ${exchange.name}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Type: ${exchange.exchangeType || 'Unknown'}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Testnet: ${exchange.isTestnet || false}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Endpoint: ${exchange.restApiEndpoint}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    API Key (first 8 chars): ${apiKey.substring(0, 8)}...`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📋 Order Parameters:`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    ${orderParams.toString().replace('timestamp=', 'timestamp=***').replace(/&signature=.*/, '')}`);

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

          // Broadcast order fill notification
          const wsService = getGlobalWebSocketService();
          if (wsService) {
            wsService.broadcastOrderFillNotification({
              id: baseOrder.id,
              exchangeOrderId: orderResult.orderId.toString(),
              botId: botId,
              orderType: 'base_order',
              symbol: bot.tradingPair,
              side: bot.direction === 'long' ? 'BUY' : 'SELL',
              quantity: quantity.toFixed(filters.qtyDecimals),
              price: currentPrice.toFixed(filters.priceDecimals)
            });
          }

          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Base order filled successfully!`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Filled Quantity: ${quantity.toFixed(filters.qtyDecimals)}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Filled Price: $${currentPrice.toFixed(filters.priceDecimals)}`);          logger.logStrategyAction('BASE_ORDER_FILLED', {
            orderId: orderResult.orderId,
            quantity: quantity.toFixed(filters.qtyDecimals),
            price: currentPrice.toFixed(filters.priceDecimals),
            amount: baseOrderAmount
          });          // Place take profit order
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🎯 Starting take profit order placement...`);
          await this.placeTakeProfitOrder(botId, cycleId, currentPrice, quantity);            // Handle safety orders based on configuration
          if (bot.activeSafetyOrdersEnabled) {
            console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚀 Active Safety Orders enabled - placing ${bot.activeSafetyOrders} safety orders in advance...`);
            await this.placeMultipleSafetyOrders(botId, cycleId, currentPrice, bot.activeSafetyOrders);
          } else {
            // Place ALL safety orders immediately when toggle is disabled
            console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚀 Active Safety Orders disabled - placing ALL ${bot.maxSafetyOrders} safety orders immediately...`);
            await this.placeMultipleSafetyOrders(botId, cycleId, currentPrice, bot.maxSafetyOrders);
          }
          
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
  }  async getAccountBalance(exchangeId: number, asset: string): Promise<any> {
    console.log(`[UNIFIED WS BALANCE FETCHING] Getting account balance for exchange ${exchangeId}, asset ${asset}`);
    
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      console.log(`[UNIFIED WS BALANCE FETCHING] Found exchange: ${exchange.name} (${exchange.exchangeType})`);

      // Decrypt API credentials with better error handling
      let apiKey: string, apiSecret: string;
      try {
        const credentials = decryptApiCredentials(
          exchange.apiKey,
          exchange.apiSecret,
          exchange.encryptionIv
        );
        apiKey = credentials.apiKey;
        apiSecret = credentials.apiSecret;
        
        console.log(`[UNIFIED WS BALANCE FETCHING] Credentials decrypted successfully for exchange ${exchangeId}`);
        console.log(`[UNIFIED WS BALANCE FETCHING] API Key length: ${apiKey.length}, API Secret length: ${apiSecret.length}`);
      } catch (decryptError) {
        console.error(`[UNIFIED WS BALANCE FETCHING] Failed to decrypt credentials for exchange ${exchangeId}:`, decryptError);
        throw new Error(`Failed to decrypt API credentials: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`);      }

      // Fetch actual balance from exchange API (works for both testnet and live)
      // The REST API endpoint determines whether it's testnet or live
      const environmentType = exchange.isTestnet ? 'Testnet' : 'Live';
      try {
        console.log(`[UNIFIED WS BALANCE FETCHING] Fetching real ${environmentType} balance from ${exchange.name}`);
        
        const baseUrl = exchange.restApiEndpoint || (exchange.isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');
        const timestamp = Date.now();
        
        // Create query parameters
        const params = new URLSearchParams({
          timestamp: timestamp.toString()
        });

        // Create signature
        const signature = crypto
          .createHmac('sha256', apiSecret)
          .update(params.toString())
          .digest('hex');
        
        params.append('signature', signature);

        console.log(`[UNIFIED WS BALANCE FETCHING] Making API request to: ${baseUrl}/api/v3/account`);
        console.log(`[UNIFIED WS BALANCE FETCHING] Request params: ${params.toString().replace(/signature=[^&]+/, 'signature=***')}`);

        // Make API request
        const response = await fetch(`${baseUrl}/api/v3/account?${params.toString()}`, {
          method: 'GET',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[UNIFIED WS BALANCE FETCHING] API request failed: ${response.status} ${response.statusText}`);
          console.error(`[UNIFIED WS BALANCE FETCHING] Error response: ${errorText}`);
          throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }        const accountData = await response.json();
        
        console.log(`[UNIFIED WS BALANCE FETCHING] Successfully fetched real ${environmentType} balance from ${exchange.name}`);
        console.log(`[UNIFIED WS BALANCE FETCHING] Balance data contains ${accountData.balances?.length || 0} assets`);
        
        return {
          data: {
            balances: accountData.balances || []
          },
          timestamp: Date.now()
        };
        
      } catch (apiError) {
        console.error(`[UNIFIED WS BALANCE FETCHING] API request failed for exchange ${exchangeId}:`, apiError);
        throw new Error(`Failed to fetch balance from exchange: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
      }
      
    } catch (error) {
      console.error(`[UNIFIED WS BALANCE FETCHING] Account balance fetch failed for exchange ${exchangeId}, asset ${asset}:`, error);
      throw error;
    }
  }

  async placeTakeProfitOrder(botId: number, cycleId: number, baseOrderPrice: number, baseOrderQuantity: number): Promise<void> {
    console.log(`\n[UNIFIED WS] [MARTINGALE STRATEGY] ===== PLACING TAKE PROFIT ORDER =====`);
    
    let logger: any = null;
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Bot ${botId} not found`);
        return;
      }

      // Initialize logger
      logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      logger.logStrategyAction('TAKE_PROFIT_START', {
        botId,
        cycleId,
        baseOrderPrice,
        baseOrderQuantity
      });

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      // Get symbol filters for price adjustment
      const filters = await getBinanceSymbolFilters(bot.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');

      // Calculate take profit price
      const takeProfitPercentage = parseFloat(bot.takeProfitPercentage);
      let takeProfitPrice: number;
      
      if (bot.direction === 'long') {
        takeProfitPrice = baseOrderPrice * (1 + takeProfitPercentage / 100);
      } else {
        takeProfitPrice = baseOrderPrice * (1 - takeProfitPercentage / 100);
      }      // Apply PRICE_FILTER adjustment
      const adjustedTakeProfitPrice = adjustPrice(takeProfitPrice, filters.tickSize, filters.priceDecimals);

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 TAKE PROFIT CALCULATION:`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Base Price: $${baseOrderPrice.toFixed(6)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Take Profit %: ${takeProfitPercentage}%`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Raw TP Price: $${takeProfitPrice.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted TP Price: $${adjustedTakeProfitPrice.toFixed(filters.priceDecimals)} (PRICE_FILTER compliant)`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Quantity: ${baseOrderQuantity.toFixed(filters.qtyDecimals)}`);

      // Create take profit order record
      const takeProfitOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'take_profit',
        side: bot.direction === 'long' ? 'SELL' : 'BUY', // Opposite of base order
        orderCategory: 'LIMIT',
        symbol: bot.tradingPair,
        quantity: baseOrderQuantity.toFixed(filters.qtyDecimals),
        price: adjustedTakeProfitPrice.toFixed(filters.priceDecimals),
        status: 'pending'
      });

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✓ Created take profit order record (ID: ${takeProfitOrder.id})`);

      // Place take profit order on exchange
      try {
        const { apiKey, apiSecret } = decryptApiCredentials(
          exchange.apiKey,
          exchange.apiSecret,
          exchange.encryptionIv
        );

        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚀 Placing take profit order on ${exchange.name}...`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Order Type: LIMIT ${bot.direction === 'long' ? 'SELL' : 'BUY'}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Symbol: ${bot.tradingPair}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Quantity: ${baseOrderQuantity.toFixed(filters.qtyDecimals)}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Price: $${adjustedTakeProfitPrice.toFixed(filters.priceDecimals)}`);

        // Place limit order for take profit
        const orderParams = new URLSearchParams({
          symbol: bot.tradingPair,
          side: bot.direction === 'long' ? 'SELL' : 'BUY',
          type: 'LIMIT',
          quantity: baseOrderQuantity.toFixed(filters.qtyDecimals),
          price: adjustedTakeProfitPrice.toFixed(filters.priceDecimals),
          timeInForce: 'GTC', // FIX: Add missing timeInForce parameter
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
          throw new Error(`Take profit order placement failed: ${orderResult.msg || 'Unknown error'}`);
        }        if (orderResult && orderResult.orderId) {
          // Update the order with exchange order ID
          await storage.updateCycleOrder(takeProfitOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'active' // Take profit orders are active (waiting for fill)
          });

          // Broadcast order fill notification
          const wsService = getGlobalWebSocketService();
          if (wsService) {
            wsService.broadcastOrderFillNotification({
              id: takeProfitOrder.id,
              exchangeOrderId: orderResult.orderId.toString(),
              botId: botId,
              orderType: 'take_profit',
              symbol: bot.tradingPair,
              side: bot.direction === 'long' ? 'SELL' : 'BUY',
              quantity: baseOrderQuantity.toFixed(filters.qtyDecimals),
              price: adjustedTakeProfitPrice.toFixed(filters.priceDecimals),
              status: 'active'
            });
          }

          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Take profit order placed successfully!`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Order Status: ACTIVE (waiting for fill)`);

          logger.logStrategyAction('TAKE_PROFIT_PLACED', {
            orderId: orderResult.orderId,
            quantity: baseOrderQuantity.toFixed(filters.qtyDecimals),
            price: adjustedTakeProfitPrice.toFixed(filters.priceDecimals),
            takeProfitPercentage
          });

        } else {
          console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Take profit order result missing orderId:`, orderResult);
          throw new Error('Take profit order result missing orderId');
        }
        
      } catch (orderError) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Take profit order placement failed:`, orderError);
        // Update order status to failed
        await storage.updateCycleOrder(takeProfitOrder.id, {
          status: 'failed'
        });
        
        logger.logError('TAKE_PROFIT_FAILED', { error: (orderError as Error).message });
        throw orderError;
      }
      
    } catch (error) {
      console.error('[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Take profit order execution failed:', error);
      if (logger) {
        logger.logError('TAKE_PROFIT_ERROR', { error: (error as Error).message });
      }
      throw error;
    }
    
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ===== TAKE PROFIT ORDER COMPLETE =====`);
  }

  async placeSafetyOrder(botId: number, cycleId: number, safetyOrderNumber: number, currentPrice: number): Promise<void> {
    console.log(`\n[UNIFIED WS] [MARTINGALE STRATEGY] ===== PLACING NEXT SAFETY ORDER =====`);
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🔄 Placing safety order ${safetyOrderNumber}...`);
    
    let logger: any = null;
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Bot ${botId} not found`);
        return;
      }

      // Initialize logger
      logger = BotLoggerManager.getLogger(botId, bot.tradingPair);

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      // Get symbol filters
      const filters = await getBinanceSymbolFilters(bot.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');      // Get bot configuration
      const baseOrderAmount = parseFloat(bot.baseOrderAmount);
      const safetyOrderAmount = parseFloat(bot.safetyOrderAmount);
      const priceDeviation = parseFloat(bot.priceDeviation);
      const safetyOrderSizeMultiplier = parseFloat(bot.safetyOrderSizeMultiplier);
      const safetyOrderStepScale = parseFloat(bot.priceDeviationMultiplier || '1.0');

      // Calculate safety order trigger price
      const deviationMultiplier = Math.pow(safetyOrderStepScale, safetyOrderNumber - 1);
      const adjustedDeviation = priceDeviation * deviationMultiplier;
      
      let safetyOrderPrice: number;
      if (bot.direction === 'long') {
        safetyOrderPrice = currentPrice * (1 - adjustedDeviation / 100);
      } else {
        safetyOrderPrice = currentPrice * (1 + adjustedDeviation / 100);
      }      // Apply PRICE_FILTER adjustment  
      const adjustedSafetyOrderPrice = adjustPrice(safetyOrderPrice, filters.tickSize, filters.priceDecimals);

      // Calculate scaled safety order amount
      const scaledAmount = safetyOrderAmount * Math.pow(safetyOrderSizeMultiplier, safetyOrderNumber - 1);
      const rawQuantity = scaledAmount / adjustedSafetyOrderPrice;

      // Enhanced filter compliance with validation
      const { quantity: validatedQuantity, price: validatedPrice, isValid, error } = ensureFilterCompliance(
        rawQuantity,
        adjustedSafetyOrderPrice,
        filters
      );
      
      if (!isValid) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Filter compliance failed: ${error}`);
        throw new Error(`Order filter validation failed: ${error}`);
      }      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 SAFETY ORDER ${safetyOrderNumber} CALCULATION:`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Current Price: $${currentPrice.toFixed(6)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Base Deviation: ${priceDeviation}%`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Deviation Multiplier: ${deviationMultiplier}x`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted Deviation: ${adjustedDeviation.toFixed(2)}%`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Raw SO Price: $${safetyOrderPrice.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Validated SO Price: $${validatedPrice.toFixed(filters.priceDecimals)} (PRICE_FILTER compliant)`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Base Amount: $${safetyOrderAmount}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Size Multiplier: ${safetyOrderSizeMultiplier}x`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted Amount: $${scaledAmount.toFixed(2)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Raw Quantity: ${rawQuantity.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Validated Quantity: ${validatedQuantity.toFixed(filters.qtyDecimals)} (LOT_SIZE compliant)`);      // Create safety order record with validated values
      const safetyOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'safety_order',
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        orderCategory: 'LIMIT', // Safety orders can be LIMIT orders at specific price levels
        symbol: bot.tradingPair,
        quantity: validatedQuantity.toFixed(filters.qtyDecimals),
        price: validatedPrice.toFixed(filters.priceDecimals),
        status: 'pending'
      });

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✓ Created safety order record (ID: ${safetyOrder.id})`);

      // Place safety order on exchange
      try {
        const { apiKey, apiSecret } = decryptApiCredentials(
          exchange.apiKey,
          exchange.apiSecret,
          exchange.encryptionIv
        );

        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚀 Placing safety order on ${exchange.name}...`);

        // Place limit order for safety order
        const orderParams = new URLSearchParams({
          symbol: bot.tradingPair,
          side: bot.direction === 'long' ? 'BUY' : 'SELL',
          type: 'LIMIT',
          quantity: validatedQuantity.toString(),
          price: validatedPrice.toFixed(filters.priceDecimals),
          timeInForce: 'GTC', // FIX: Add missing timeInForce parameter
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
          throw new Error(`Safety order placement failed: ${orderResult.msg || 'Unknown error'}`);
        }

        if (orderResult && orderResult.orderId) {
          // Update the order with exchange order ID
          await storage.updateCycleOrder(safetyOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'active' // Safety orders are active (waiting for fill)
          });

          // Broadcast order fill notification
          const wsService = getGlobalWebSocketService();
          if (wsService) {
            wsService.broadcastOrderFillNotification({
              id: safetyOrder.id,
              exchangeOrderId: orderResult.orderId.toString(),
              botId: botId,
              orderType: 'safety_order',
              symbol: bot.tradingPair,
              side: bot.direction === 'long' ? 'BUY' : 'SELL',
              quantity: validatedQuantity.toFixed(filters.qtyDecimals),
              price: validatedPrice.toFixed(filters.priceDecimals),
              status: 'active'
            });
          }

          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ SAFETY ORDER ${safetyOrderNumber} SUCCESSFULLY PLACED!`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);

          logger.logStrategyAction('SAFETY_ORDER_PLACED', {
            safetyOrderNumber,
            orderId: orderResult.orderId,            quantity: validatedQuantity.toFixed(filters.qtyDecimals),
            price: validatedPrice.toFixed(filters.priceDecimals),
            scaledAmount: scaledAmount.toFixed(2)
          });

        } else {
          console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Safety order result missing orderId:`, orderResult);
          throw new Error('Safety order result missing orderId');
        }
        
      } catch (orderError) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Safety order placement failed:`, orderError);
        // Update order status to failed
        await storage.updateCycleOrder(safetyOrder.id, {
          status: 'failed'
        });
        
        logger.logError('SAFETY_ORDER_FAILED', { error: (orderError as Error).message, safetyOrderNumber });
        throw orderError;
      }
      
    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Safety order ${safetyOrderNumber} execution failed:`, error);
      if (logger) {
        logger.logError('SAFETY_ORDER_ERROR', { error: (error as Error).message, safetyOrderNumber });
      }
      throw error;
    }
    
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ===== SAFETY ORDER PLACEMENT COMPLETE =====`);
  }

  async evaluateAndPlaceSafetyOrder(botId: number, cycleId: number, currentPrice: number): Promise<void> {
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⚡ Evaluating safety order placement...`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Bot ${botId} not found`);
        return;
      }      // Get current safety orders count for this cycle
      const allOrders = await storage.getCycleOrders(cycleId);
      const existingSafetyOrders = allOrders.filter(order => order.orderType === 'safety_order');
      const safetyOrderCount = existingSafetyOrders.length;
      
      if (safetyOrderCount >= bot.maxSafetyOrders) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏳ Max safety orders (${bot.maxSafetyOrders}) reached. No more safety orders will be placed.`);
        return;
      }

      // Get base order to calculate trigger price
      const baseOrders = allOrders.filter(order => order.orderType === 'base_order');
      if (baseOrders.length === 0) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ No base order found for cycle ${cycleId}`);
        return;
      }

      const baseOrder = baseOrders[0];
      const basePrice = parseFloat(baseOrder.price || '0');
      const priceDeviation = parseFloat(bot.priceDeviation);
      const priceDeviationMultiplier = parseFloat(bot.priceDeviationMultiplier);
      
      // Calculate safety order trigger price
      const nextSafetyOrderNumber = safetyOrderCount + 1;
      const deviationMultiplier = Math.pow(priceDeviationMultiplier, nextSafetyOrderNumber - 1);
      const adjustedDeviation = priceDeviation * deviationMultiplier;
      
      let triggerPrice: number;
      let shouldPlaceSafetyOrder = false;
      
      if (bot.direction === 'long') {
        triggerPrice = basePrice * (1 - adjustedDeviation / 100);
        shouldPlaceSafetyOrder = currentPrice <= triggerPrice;
      } else {
        triggerPrice = basePrice * (1 + adjustedDeviation / 100);
        shouldPlaceSafetyOrder = currentPrice >= triggerPrice;
      }

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 SAFETY ORDER EVALUATION:`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Current Price: $${currentPrice.toFixed(6)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Base Price: $${basePrice.toFixed(6)}`);  
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Safety Order #${nextSafetyOrderNumber} Trigger: $${triggerPrice.toFixed(6)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Direction: ${bot.direction.toUpperCase()}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Should Place Safety Order: ${shouldPlaceSafetyOrder ? '✅ YES' : '❌ NO'}`);

      if (shouldPlaceSafetyOrder) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🎯 Safety order trigger conditions met! Placing safety order ${nextSafetyOrderNumber}...`);
        await this.placeSafetyOrder(botId, cycleId, nextSafetyOrderNumber, currentPrice);
      } else {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏳ Safety order trigger conditions not met, waiting...`);
      }
      
    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Safety order evaluation failed:`, error);
      throw error;
    }
  }
  // Method to handle order fill events (for future implementation)
  async handleOrderFillEvent(botId: number, cycleId: number, orderFillData: any): Promise<void> {
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📩 Processing order fill event for bot ${botId}, cycle ${cycleId}`);
    
    try {
      // This method would be called when we receive order fill events from WebSocket streams
      const orderType = orderFillData.orderType;
      const { orderId, symbol, side, quantity, price, commission, commissionAsset } = orderFillData;
      
      // Broadcast order fill notification to all connected clients
      const wsService = getGlobalWebSocketService();
      if (wsService) {
        wsService.broadcastOrderFillNotification({
          id: orderId,
          exchangeOrderId: orderId.toString(),
          botId: botId,
          orderType: orderType,
          symbol: symbol,
          side: side,
          quantity: quantity,
          price: price,
          status: 'filled',
          commission: commission,
          commissionAsset: commissionAsset
        });
      }
      
      switch (orderType) {
        case 'base_order':
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🎯 BASE ORDER FILLED - STARTING SAFETY ORDERS`);
          // Base order filled - safety orders should already be placed
          break;
          
        case 'take_profit':
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🎉 TAKE PROFIT ORDER FILLED - CYCLE COMPLETED!`);
          await this.completeCycleAndStartNew(botId, cycleId, orderFillData);
          break;
          
        case 'safety_order':
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⚡ SAFETY ORDER FILLED - UPDATING TAKE PROFIT`);
          // TODO: Update average entry price, cancel and replace take profit order
          // This would involve:
          // 1. Calculate new average entry price
          // 2. Cancel existing take profit order
          // 3. Place new take profit order at updated price
          // 4. Place next safety order if conditions are met
          break;
          
        default:
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📝 Order fill event: ${orderType}`);
      }
      
    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Order fill event processing failed:`, error);
      throw error;
    }
  }

  /**
   * Complete current cycle and start new one with cooldown support
   */  async completeCycleAndStartNew(botId: number, cycleId: number, orderFillData: any): Promise<void> {
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🏁 Completing cycle ${cycleId} and preparing new cycle...`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }
      
      // Mark current cycle as completed
      const completedCycle = await storage.updateBotCycle(cycleId, {
        status: 'completed',
        cycleProfit: '0' // Will be calculated based on order fills
      });

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Cycle ${cycleId} marked as completed`);
      
      // Broadcast cycle completion
      const wsService = getGlobalWebSocketService();
      if (wsService && completedCycle) {
        wsService.broadcastBotCycleUpdate({
          action: 'completed',
          cycle: completedCycle
        });
        console.log(`[WEBSOCKET] Broadcasted cycle completion for cycle ${cycleId}`);
      }

      // Update bot stats (will be implemented)
      // await storage.updateTradingBot(botId, {
      //   totalTrades: bot.totalTrades + 1,
      // });

      // Check if bot is still active
      if (!bot.isActive) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏸️ Bot ${botId} is inactive, not starting new cycle`);
        return;
      }

      // Handle cooldown if enabled
      if (bot.cooldownEnabled && bot.cooldownBetweenRounds > 0) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏱️ Cooldown enabled: ${bot.cooldownBetweenRounds}s`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 💤 Starting cooldown period before new cycle...`);
          // Schedule new cycle after cooldown
        const timeoutId = setTimeout(async () => {
          try {
            // Remove from pending timers when executing
            this.pendingCycleStarts.delete(botId);
            await this.startNewCycle(botId);
          } catch (error) {
            console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Failed to start new cycle after cooldown:`, error);
          }
        }, bot.cooldownBetweenRounds * 1000);
        
        // Store the timeout ID for cleanup purposes
        this.pendingCycleStarts.set(botId, timeoutId);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏰ Scheduled new cycle for bot ${botId} in ${bot.cooldownBetweenRounds}s`);
        
      } else {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚀 No cooldown - starting new cycle immediately`);
        await this.startNewCycle(botId);
      }

    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Cycle completion failed:`, error);
      throw error;
    }
  }
  /**
   * Start a new trading cycle for the bot
   */
  async startNewCycle(botId: number): Promise<void> {
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🔄 Starting new cycle for bot ${botId}...`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      // Check if bot is still active (might have been deactivated during cooldown)
      if (!bot.isActive) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏸️ Bot ${botId} is now inactive, cancelling new cycle`);
        return;
      }
      
      // Create new cycle
      const newCycle = await storage.createBotCycle({
        botId: botId,
        userId: bot.userId,
        maxSafetyOrders: bot.maxSafetyOrders,
        cycleNumber: 1, // This should be incremented based on previous cycles
        status: 'active'
      });

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Created new cycle ${newCycle.id} for bot ${botId}`);

      // Broadcast new cycle creation
      const wsService = getGlobalWebSocketService();
      if (wsService) {
        wsService.broadcastBotCycleUpdate({
          action: 'created',
          cycle: newCycle
        });
        console.log(`[WEBSOCKET] Broadcasted new cycle creation for cycle ${newCycle.id}`);
      }

      // Start base order execution for new cycle
      await this.placeInitialBaseOrder(botId, newCycle.id);

    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ New cycle creation failed:`, error);
      throw error;
    }
  }

  /**
   * Place multiple safety orders at once
   */
  async placeMultipleSafetyOrders(botId: number, cycleId: number, currentPrice: number, numberOfOrders: number): Promise<void> {
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚀 Placing ${numberOfOrders} safety orders...`);
    
    try {
      // Place the specified number of safety orders
      for (let i = 1; i <= numberOfOrders; i++) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🎯 Placing safety order ${i}/${numberOfOrders}...`);
        await this.placeSafetyOrder(botId, cycleId, i, currentPrice);
      }

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Successfully placed ${numberOfOrders} safety orders`);
      
    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Failed to place multiple safety orders:`, error);
      throw error;
    }
  }

  /**
   * Cancel any pending cycle start timers for a bot
   */
  cancelPendingCycleStart(botId: number): void {
    const timeoutId = this.pendingCycleStarts.get(botId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pendingCycleStarts.delete(botId);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏹️ Cancelled pending cycle start for bot ${botId}`);
    }
  }

  /**
   * Clean up all resources for a bot (call when bot is deleted)
   */
  cleanupBot(botId: number): void {
    console.log(`[UNIFIED WS] [TRADING OPERATIONS] 🧹 Cleaning up resources for bot ${botId}`);
    
    // Cancel any pending cycle start timers
    this.cancelPendingCycleStart(botId);
    
    // Remove any cycle operation locks
    this.cycleOperationLocks.delete(botId);
    
    // Clean up any pending order requests for this bot
    const requestsToRemove: string[] = [];
    this.pendingOrderRequests.forEach((request, key) => {
      // If the request key contains the bot ID, mark it for removal
      if (key.includes(`bot-${botId}-`)) {
        requestsToRemove.push(key);
      }
    });
    
    requestsToRemove.forEach(key => {
      this.pendingOrderRequests.delete(key);
    });
    
    console.log(`[UNIFIED WS] [TRADING OPERATIONS] ✅ Cleanup completed for bot ${botId}`);
  }
}
