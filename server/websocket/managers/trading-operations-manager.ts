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
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Filled Price: $${currentPrice.toFixed(filters.priceDecimals)}`);          logger.logStrategyAction('BASE_ORDER_FILLED', {
            orderId: orderResult.orderId,
            quantity: quantity.toFixed(filters.qtyDecimals),
            price: currentPrice.toFixed(filters.priceDecimals),
            amount: baseOrderAmount
          });

          // Place take profit order
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🎯 Starting take profit order placement...`);
          await this.placeTakeProfitOrder(botId, cycleId, currentPrice, quantity);
          
          // Check if first safety order should be placed based on current price
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⚡ Checking if safety order should be placed...`);
          await this.evaluateAndPlaceSafetyOrder(botId, cycleId, currentPrice);
          
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
        }

        if (orderResult && orderResult.orderId) {
          // Update the order with exchange order ID
          await storage.updateCycleOrder(takeProfitOrder.id, {
            exchangeOrderId: orderResult.orderId.toString(),
            status: 'active' // Take profit orders are active (waiting for fill)
          });

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

      // Apply LOT_SIZE filter
      const quantity = adjustQuantity(rawQuantity, filters.stepSize, filters.minQty, filters.qtyDecimals);

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 SAFETY ORDER ${safetyOrderNumber} CALCULATION:`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Current Price: $${currentPrice.toFixed(6)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Base Deviation: ${priceDeviation}%`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Deviation Multiplier: ${deviationMultiplier}x`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted Deviation: ${adjustedDeviation.toFixed(2)}%`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Raw SO Price: $${safetyOrderPrice.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted SO Price: $${adjustedSafetyOrderPrice.toFixed(filters.priceDecimals)} (PRICE_FILTER compliant)`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Base Amount: $${safetyOrderAmount}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Size Multiplier: ${safetyOrderSizeMultiplier}x`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted Amount: $${scaledAmount.toFixed(2)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Raw Quantity: ${rawQuantity.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Final Quantity: ${quantity.toFixed(filters.qtyDecimals)} (LOT_SIZE compliant)`);

      // Create safety order record
      const safetyOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'safety_order',
        side: bot.direction === 'long' ? 'BUY' : 'SELL',
        orderCategory: 'LIMIT', // Safety orders can be LIMIT orders at specific price levels
        symbol: bot.tradingPair,
        quantity: quantity.toFixed(filters.qtyDecimals),
        price: adjustedSafetyOrderPrice.toFixed(filters.priceDecimals),
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
          quantity: quantity.toString(),
          price: adjustedSafetyOrderPrice.toFixed(filters.priceDecimals),
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

          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ SAFETY ORDER ${safetyOrderNumber} SUCCESSFULLY PLACED!`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);

          logger.logStrategyAction('SAFETY_ORDER_PLACED', {
            safetyOrderNumber,
            orderId: orderResult.orderId,
            quantity: quantity.toFixed(filters.qtyDecimals),
            price: adjustedSafetyOrderPrice.toFixed(filters.priceDecimals),
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
      // For now, this is a placeholder for future real-time fill monitoring
      
      const orderType = orderFillData.orderType;
      
      switch (orderType) {
        case 'take_profit':
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🎉 TAKE PROFIT ORDER FILLED - CYCLE COMPLETED!`);
          // TODO: Mark cycle as completed, calculate profit, start new cycle if bot is active
          break;
          
        case 'safety_order':
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⚡ SAFETY_ORDER FILLED`);
          // TODO: Update average entry price, cancel and replace take profit order
          break;
          
        default:
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📝 Order fill event: ${orderType}`);
      }
      
    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Order fill event processing failed:`, error); 
      throw error;
    }
  }
}
