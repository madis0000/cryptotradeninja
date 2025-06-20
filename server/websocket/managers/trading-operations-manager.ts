import { getBinanceSymbolFilters, adjustQuantity, adjustPrice, ensureFilterCompliance } from '../../binance-filters';
import { storage } from '../../storage';
import { decryptApiCredentials } from '../../encryption';
import { BotLoggerManager } from '../../bot-logger';
import { getGlobalWebSocketService } from '../websocket-service';
import * as crypto from 'crypto';
import WebSocket from 'ws';

// Order interfaces
interface OrderRequest {
  symbol: string;
  side: string;
  type: string;
  quantity: string;
  price?: string;
  timeInForce?: string;
}

interface OrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  workingTime: number;
  selfTradePreventionMode: string;
}

export class TradingOperationsManager {
  private pendingOrderRequests = new Map<string, { resolve: Function, reject: Function, timestamp: number }>();
  
  // Cycle management optimization for concurrent operations
  private cycleOperationLocks = new Map<number, Promise<void>>();
  private pendingCycleStarts = new Map<number, NodeJS.Timeout>();

  // Helper method to get Binance server time
  private async getBinanceServerTime(baseUrl: string): Promise<number> {
    try {
      const timeResponse = await fetch(`${baseUrl}/api/v3/time`);
      if (timeResponse.ok) {
        const timeData = await timeResponse.json();
        console.log(`[TIMESTAMP] Using Binance server time: ${timeData.serverTime}`);
        return timeData.serverTime;
      } else {
        console.log(`[TIMESTAMP] Failed to get server time, using local time`);
        return Date.now();
      }
    } catch (timeError) {
      console.log(`[TIMESTAMP] Error getting server time, using local time:`, timeError);
      return Date.now();
    }
  }

  constructor() {
    console.log('[UNIFIED WS] [TRADING OPERATIONS MANAGER] Initialized');
  }
  // Place order with enhanced logging for manual trading
  async placeOrder(exchangeId: number, orderRequest: OrderRequest): Promise<OrderResponse | null> {
    const startTime = Date.now();
    
    console.log(`[MANUAL TRADING] ===== STARTING ORDER EXECUTION =====`);
    console.log(`[MANUAL TRADING] 📊 ORDER REQUEST:`);
    console.log(`[MANUAL TRADING]    Exchange ID: ${exchangeId}`);
    console.log(`[MANUAL TRADING]    Symbol: ${orderRequest.symbol}`);
    console.log(`[MANUAL TRADING]    Side: ${orderRequest.side}`);
    console.log(`[MANUAL TRADING]    Type: ${orderRequest.type}`);
    console.log(`[MANUAL TRADING]    Quantity: ${orderRequest.quantity}`);
    console.log(`[MANUAL TRADING]    Price: ${orderRequest.price || 'MARKET'}`);
    console.log(`[MANUAL TRADING]    Time in Force: ${orderRequest.timeInForce || 'GTC'}`);
      try {
      // Get exchange information and decrypt credentials
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }
      
      console.log(`[MANUAL TRADING] ✓ Exchange: ${exchange.name} (${exchange.exchangeType || 'unknown'})`);
      console.log(`[MANUAL TRADING]    Testnet: ${exchange.isTestnet ? 'Yes' : 'No'}`);
      console.log(`[MANUAL TRADING]    Active: ${exchange.isActive ? 'Yes' : 'No'}`);
      
      // Calculate estimated order value for logging
      if (orderRequest.price && orderRequest.quantity) {
        const estimatedValue = (parseFloat(orderRequest.price) * parseFloat(orderRequest.quantity)).toFixed(2);
        console.log(`[MANUAL TRADING] 💰 Estimated Order Value: $${estimatedValue}`);
      }
      
      console.log(`[MANUAL TRADING] 🚀 Processing order on exchange...`);
        const decryptedCredentials = decryptApiCredentials(exchange.apiKey, exchange.apiSecret, exchange.encryptionIv);
      const { apiKey, apiSecret } = decryptedCredentials;
        // Get exchange filters for the symbol
      const restEndpoint = exchange.restApiEndpoint || 'https://testnet.binance.vision';
      const filters = await getBinanceSymbolFilters(orderRequest.symbol, restEndpoint);
      console.log(`[MANUAL TRADING] 📊 Exchange filters for ${orderRequest.symbol}:`, filters);
      
      // Apply filter compliance for LIMIT orders
      let adjustedQuantity = orderRequest.quantity;
      let adjustedPrice = orderRequest.price;
      
      if (orderRequest.type === 'LIMIT' && orderRequest.price) {
        const compliance = ensureFilterCompliance(
          parseFloat(orderRequest.quantity),
          parseFloat(orderRequest.price),
          filters
        );
        
        if (!compliance.isValid) {
          console.log(`[MANUAL TRADING] ❌ Filter compliance failed: ${compliance.error}`);
          throw new Error(`Filter compliance failed: ${compliance.error}`);
        }
        
        adjustedQuantity = compliance.quantity.toString();
        adjustedPrice = compliance.price.toString();
        
        console.log(`[MANUAL TRADING] ✓ Filter compliance passed:`);
        console.log(`[MANUAL TRADING]    Original Qty: ${orderRequest.quantity} → Adjusted: ${adjustedQuantity}`);
        console.log(`[MANUAL TRADING]    Original Price: ${orderRequest.price} → Adjusted: ${adjustedPrice}`);
      } else if (orderRequest.type === 'MARKET') {
        // For market orders, only adjust quantity
        const adjustedQty = adjustQuantity(
          parseFloat(orderRequest.quantity),
          filters.stepSize,
          filters.minQty,
          filters.qtyDecimals
        );
        adjustedQuantity = adjustedQty.toString();
        
        console.log(`[MANUAL TRADING] ✓ Market order quantity adjusted:`);
        console.log(`[MANUAL TRADING]    Original: ${orderRequest.quantity} → Adjusted: ${adjustedQuantity}`);
      }
      
      // Prepare order parameters for Binance API
      const orderParams = new URLSearchParams({
        symbol: orderRequest.symbol,
        side: orderRequest.side,
        type: orderRequest.type,
        quantity: adjustedQuantity,
        timestamp: Date.now().toString()
      });

      // Add price for LIMIT orders
      if (orderRequest.type === 'LIMIT' && adjustedPrice) {
        orderParams.append('price', adjustedPrice);
        orderParams.append('timeInForce', orderRequest.timeInForce || 'GTC');
      }

      // Create signature for Binance API
      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderParams.toString())
        .digest('hex');
      
      orderParams.append('signature', signature);

      console.log(`[MANUAL TRADING] 📤 Placing real order on ${exchange.name}...`);
      
      // Make API call to place order
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
        console.log(`[MANUAL TRADING] ❌ Order failed:`, orderResult);
        throw new Error(`Order failed: ${orderResult.msg || orderResult.message || 'Unknown error'}`);
      }

      if (!orderResult || !orderResult.orderId) {
        console.log(`[MANUAL TRADING] ❌ Invalid order response:`, orderResult);
        throw new Error('Invalid order response from exchange');
      }
      
      // Convert exchange response to our OrderResponse format
      const result: OrderResponse = {
        symbol: orderResult.symbol,
        orderId: orderResult.orderId,
        orderListId: orderResult.orderListId || -1,
        clientOrderId: orderResult.clientOrderId,
        transactTime: orderResult.transactTime,
        price: orderResult.price || orderRequest.price || '0',
        origQty: orderResult.origQty,
        executedQty: orderResult.executedQty,
        cummulativeQuoteQty: orderResult.cummulativeQuoteQty,
        status: orderResult.status,
        timeInForce: orderResult.timeInForce,
        type: orderResult.type,
        side: orderResult.side,
        workingTime: orderResult.workingTime || orderResult.transactTime,
        selfTradePreventionMode: orderResult.selfTradePreventionMode || 'NONE'
      };
        const responseTime = Date.now() - startTime;
      console.log(`[MANUAL TRADING] ⏱️ Order Processing Time: ${responseTime}ms`);
      console.log(`[MANUAL TRADING] ✅ ORDER PLACED SUCCESSFULLY!`);
      console.log(`[MANUAL TRADING]    Exchange Order ID: ${result.orderId}`);
      console.log(`[MANUAL TRADING]    Client Order ID: ${result.clientOrderId}`);
      console.log(`[MANUAL TRADING]    Status: ${result.status}`);
      console.log(`[MANUAL TRADING]    Executed Qty: ${result.executedQty}`);
      console.log(`[MANUAL TRADING]    Transaction Time: ${new Date(result.transactTime).toISOString()}`);
      
      if (result.status === 'FILLED') {
        console.log(`[MANUAL TRADING] 🎯 Order filled immediately (${orderRequest.type} order)`);
        console.log(`[MANUAL TRADING]    Fill Price: ${result.price || 'Market'}`);
        console.log(`[MANUAL TRADING]    Fill Quantity: ${result.executedQty}`);
        console.log(`[MANUAL TRADING]    Quote Volume: ${result.cummulativeQuoteQty}`);
      } else {
        console.log(`[MANUAL TRADING] ⏳ Order placed and waiting for fill (${orderRequest.type} order)`);
      }
      
      console.log(`[MANUAL TRADING] ===== ORDER EXECUTION COMPLETE =====`);
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.log(`[MANUAL TRADING] ❌ ORDER EXECUTION FAILED:`);
      console.log(`[MANUAL TRADING]    Processing Time: ${responseTime}ms`);
      console.log(`[MANUAL TRADING]    Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`[MANUAL TRADING]    Stack:`, error);
      console.log(`[MANUAL TRADING] ===== ORDER EXECUTION FAILED =====`);
      return null;
    }
  }

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
    }  }

  // Cancel order for manual trading (by exchange ID and order ID)
  async cancelManualOrder(exchangeId: number, orderId: string, symbol: string): Promise<void> {
    console.log(`[MANUAL TRADING] [CANCEL] 🚫 ===== STARTING MANUAL ORDER CANCELLATION =====`);
    console.log(`[MANUAL TRADING] [CANCEL] 🚫 Exchange ID: ${exchangeId}, Order ID: ${orderId}, Symbol: ${symbol}`);
    
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        console.error(`[MANUAL TRADING] [CANCEL] ❌ Exchange ${exchangeId} not found`);
        throw new Error('Exchange not found');
      }
        console.log(`[MANUAL TRADING] [CANCEL] ✅ Exchange found: ${exchange.name} (${exchange.exchangeType})`);
      console.log(`[MANUAL TRADING] [CANCEL] 📡 REST API Endpoint: ${exchange.restApiEndpoint}`);

      // Get API credentials
      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );
      
      console.log(`[MANUAL TRADING] [CANCEL] � API credentials decrypted successfully`);
      console.log(`[MANUAL TRADING] [CANCEL] �📡 Sending cancel request to ${exchange.name}...`);

      // Cancel order on exchange using REST API
      const cancelParams = new URLSearchParams({
        symbol: symbol,
        orderId: orderId,
        timestamp: Date.now().toString()
      });

      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(cancelParams.toString())
        .digest('hex');
      
      cancelParams.append('signature', signature);
      
      const requestUrl = `${exchange.restApiEndpoint}/api/v3/order?${cancelParams.toString()}`;
      console.log(`[MANUAL TRADING] [CANCEL] 🌐 Request URL: ${exchange.restApiEndpoint}/api/v3/order`);
      console.log(`[MANUAL TRADING] [CANCEL] 📋 Request params: ${JSON.stringify(Object.fromEntries(cancelParams))}`);

      const cancelResponse = await fetch(requestUrl, {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });

      const cancelResult = await cancelResponse.json();
      
      console.log(`[MANUAL TRADING] [CANCEL] 📊 Exchange response status: ${cancelResponse.status} ${cancelResponse.statusText}`);
      console.log(`[MANUAL TRADING] [CANCEL] 📊 Exchange response:`, cancelResult);
      
      if (!cancelResponse.ok) {
        console.log(`[MANUAL TRADING] [CANCEL] ❌ Cancel failed with status ${cancelResponse.status}:`, cancelResult);
        throw new Error(`Order cancellation failed: ${cancelResult.msg || cancelResult.message || 'Unknown error'}`);
      }

      console.log(`[MANUAL TRADING] [CANCEL] ✅ ===== ORDER CANCELLATION COMPLETED =====`);
      console.log(`[MANUAL TRADING] [CANCEL] ✅ Order ${orderId} cancelled successfully on ${symbol}!`);
      console.log(`[MANUAL TRADING] [CANCEL] 📊 Final result:`, cancelResult);
      
    } catch (error) {
      console.error(`[MANUAL TRADING] [CANCEL] ❌ ===== ORDER CANCELLATION FAILED =====`);
      console.error(`[MANUAL TRADING] [CANCEL] ❌ Error cancelling order ${orderId} on ${symbol}:`, error);
      console.error(`[MANUAL TRADING] [CANCEL] ❌ Error details:`, {
        exchangeId,
        orderId,
        symbol,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      console.error(`[MANUAL TRADING] [CANCEL] ❌ ===== ERROR END =====`);
      throw error;
    }
  }

  // Cancel all pending orders for a bot
  async cancelAllBotOrders(botId: number): Promise<{ cancelledOrders: number; errors: string[] }> {
    console.log(`[UNIFIED WS] [TRADING] Cancelling all pending orders for bot ${botId}`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }      // Use the more comprehensive method to get all cancellable orders
      const cancellableOrders = await storage.getCancellableOrdersByBotId(botId);
      let cancelledOrders = 0;
      const errors: string[] = [];
      
      console.log(`[UNIFIED WS] [TRADING] Found ${cancellableOrders.length} cancellable orders for bot ${botId}`);
      
      for (const order of cancellableOrders) {
        if (order.exchangeOrderId) {
          try {
            console.log(`[UNIFIED WS] [TRADING] 🚫 Cancelling order ${order.exchangeOrderId} (status: ${order.status})`);
            
            // Cancel order on exchange
            await this.cancelOrder(botId, order.exchangeOrderId);
            
            // Update order status in database
            await storage.updateCycleOrder(order.id, { 
              status: 'cancelled',
              filledAt: new Date()
            });
            
            cancelledOrders++;
            console.log(`[UNIFIED WS] [TRADING] ✅ Cancelled order ${order.exchangeOrderId}`);
          } catch (cancelError) {
            const errorMsg = `Failed to cancel order ${order.exchangeOrderId}: ${cancelError instanceof Error ? cancelError.message : 'Unknown error'}`;
            console.error(`[UNIFIED WS] [TRADING] ❌ ${errorMsg}`);
            errors.push(errorMsg);
          }
        } else {
          console.log(`[UNIFIED WS] [TRADING] ⚠️ Skipping order ${order.id} - no exchangeOrderId`);
        }
      }
      
      console.log(`[UNIFIED WS] [TRADING] Order cancellation summary for bot ${botId}: ${cancelledOrders} cancelled, ${errors.length} errors`);
      
      return { cancelledOrders, errors };
      
    } catch (error) {
      console.error(`[UNIFIED WS] [TRADING] Error cancelling bot orders for bot ${botId}:`, error);
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
      let quantity = adjustQuantity(rawQuantity, filters.stepSize, filters.minQty, filters.qtyDecimals);

      // Validate filter compliance before proceeding
      const compliance = ensureFilterCompliance(quantity, currentPrice, filters);
      if (!compliance.isValid) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Filter compliance failed: ${compliance.error}`);
        throw new Error(`Filter compliance failed: ${compliance.error}`);
      }
      
      // Use the validated values
      quantity = compliance.quantity;
      const validatedPrice = compliance.price;

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 BASE ORDER CALCULATION:`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Investment Amount: $${baseOrderAmount}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Current Price: $${currentPrice.toFixed(6)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Raw Quantity: ${rawQuantity.toFixed(8)} ${symbol.replace('USDT', '')}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted Quantity: ${quantity.toFixed(filters.qtyDecimals)} ${symbol.replace('USDT', '')} (LOT_SIZE compliant)`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Filter Validation: ✅ PASSED`);

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
        );        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚀 Placing order on ${exchange.name}...`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Order Type: MARKET ${bot.direction === 'long' ? 'BUY' : 'SELL'}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Symbol: ${symbol}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Investment: $${baseOrderAmount} (using quoteOrderQty)`);
        
        // Use quoteOrderQty for market orders to avoid LOT_SIZE issues
        // This ensures we spend exactly the desired amount in USDT
        const orderParams = new URLSearchParams({
          symbol: bot.tradingPair,
          side: bot.direction === 'long' ? 'BUY' : 'SELL',
          type: 'MARKET',
          quoteOrderQty: baseOrderAmount.toFixed(2), // Use quote asset amount instead of base asset quantity
          timestamp: Date.now().toString()
        });

        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📤 Using quoteOrderQty for market order: $${baseOrderAmount.toFixed(2)} USDT`);

        // Create signature for Binance API
        const signature = crypto
          .createHmac('sha256', apiSecret)
          .update(orderParams.toString())
          .digest('hex');
        
        orderParams.append('signature', signature);

        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📤 Placing real order on exchange...`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Exchange: ${exchange.name} (${exchange.isTestnet ? 'Testnet' : 'Live'})`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Symbol: ${bot.tradingPair}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Side: ${bot.direction === 'long' ? 'BUY' : 'SELL'}`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Type: MARKET`);
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Quantity: ${quantity.toFixed(filters.qtyDecimals)}`);

        // Make API call to place order
        const orderResponse = await fetch(`${exchange.restApiEndpoint || 'https://testnet.binance.vision'}/api/v3/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: orderParams
        });        const orderResult = await orderResponse.json();
        
        // Debug: Log the complete order response
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📋 Full order response:`, JSON.stringify(orderResult, null, 2));
        
        if (!orderResponse.ok) {
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Order failed:`, orderResult);
          throw new Error(`Order failed: ${JSON.stringify(orderResult)}`);
        }

        if (!orderResult || !orderResult.orderId) {
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Invalid order response:`, orderResult);
          throw new Error('Invalid order response from exchange');
        }        // Calculate actual average price for market orders
        let actualFilledPrice: number;
        let actualFilledQuantity: number;
        
        if (orderResult.executedQty && orderResult.cummulativeQuoteQty) {
          // For market orders, calculate average price from total spent / quantity filled
          actualFilledQuantity = parseFloat(orderResult.executedQty);
          const totalSpent = parseFloat(orderResult.cummulativeQuoteQty);
          actualFilledPrice = totalSpent / actualFilledQuantity;
          
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ BASE ORDER SUCCESSFULLY PLACED!`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Filled Quantity: ${actualFilledQuantity.toFixed(filters.qtyDecimals)}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Total Spent: $${totalSpent.toFixed(2)}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Average Filled Price: $${actualFilledPrice.toFixed(filters.priceDecimals)}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Expected Investment: $${baseOrderAmount}`);
        } else {
          // Fallback to current price if execution data is missing
          console.warn(`[UNIFIED WS] [MARTINGALE STRATEGY] ⚠️ Missing execution data in order response:`);
          console.warn(`[UNIFIED WS] [MARTINGALE STRATEGY]    executedQty: ${orderResult.executedQty || 'MISSING'}`);
          console.warn(`[UNIFIED WS] [MARTINGALE STRATEGY]    cummulativeQuoteQty: ${orderResult.cummulativeQuoteQty || 'MISSING'}`);
          console.warn(`[UNIFIED WS] [MARTINGALE STRATEGY]    price: ${orderResult.price || 'MISSING'}`);
          console.warn(`[UNIFIED WS] [MARTINGALE STRATEGY]    Using current market price as fallback: $${currentPrice.toFixed(filters.priceDecimals)}`);
          
          actualFilledPrice = currentPrice;
          actualFilledQuantity = quantity;
          
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ BASE ORDER PLACED (using fallback data)!`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Exchange Order ID: ${orderResult.orderId}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Estimated Filled Price: $${actualFilledPrice.toFixed(filters.priceDecimals)}`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Estimated Filled Quantity: ${actualFilledQuantity.toFixed(filters.qtyDecimals)}`);
        }

        // Update order record with fill information
        await storage.updateCycleOrder(baseOrder.id, {
          status: 'filled',
          exchangeOrderId: orderResult.orderId.toString(),
          filledPrice: actualFilledPrice.toString(),
          filledQuantity: actualFilledQuantity.toString(),
          filledAt: new Date()
        });        // Place take profit order after successful base order
        await this.placeTakeProfitOrder(
          botId, 
          cycleId, 
          actualFilledPrice, 
          actualFilledQuantity
        );

        // Place safety orders based on bot configuration
        if (bot.maxSafetyOrders && bot.maxSafetyOrders > 0) {
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ===== PLACING SAFETY ORDERS =====`);
          
          // Check if we should place safety orders immediately (activeSafetyOrdersEnabled = false)
          // or place them gradually (activeSafetyOrdersEnabled = true)
          const shouldPlaceAllSafetyOrders = !bot.activeSafetyOrdersEnabled;
          const safetyOrdersToPlace = shouldPlaceAllSafetyOrders 
            ? bot.maxSafetyOrders 
            : Math.min(bot.activeSafetyOrders || 1, bot.maxSafetyOrders);
          
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🔄 Placing ${safetyOrdersToPlace} of ${bot.maxSafetyOrders} safety orders...`);
          
          for (let i = 1; i <= safetyOrdersToPlace; i++) {
            try {
              await this.placeSafetyOrder(botId, cycleId, i, currentPrice);
            } catch (safetyOrderError) {
              console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Error placing safety order ${i}:`, safetyOrderError);
              // Continue with other safety orders even if one fails
            }
          }
          
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ===== SAFETY ORDER PLACEMENT COMPLETE =====`);
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
    console.log(`[LIQUIDATION] 🔴 Starting liquidation order for bot ${botId}, cycle ${cycleId}`);
    
    let logger: any = null;
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      // Initialize logger
      logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      logger.logStrategyAction('LIQUIDATION_START', { botId, cycleId });

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }      // Calculate total position from filled buy orders
      const filledBuyOrders = await storage.getCycleOrdersByBotId(botId);
      const buyOrders = filledBuyOrders.filter(order => 
        order.side === 'BUY' && 
        order.status === 'filled' && 
        order.cycleId === cycleId
      );

      if (buyOrders.length === 0) {
        console.log(`[LIQUIDATION] ℹ️ No filled buy orders found for cycle ${cycleId}, skipping liquidation`);
        logger.logStrategyAction('LIQUIDATION_SKIP', { reason: 'No position to liquidate' });
        return;
      }

      // Calculate total quantity to liquidate
      let totalQuantity = 0;
      let totalSpent = 0;
      
      for (const order of buyOrders) {
        const qty = parseFloat(order.filledQuantity || order.quantity || '0');
        const price = parseFloat(order.filledPrice || order.price || '0');
        totalQuantity += qty;
        totalSpent += (qty * price);
      }

      if (totalQuantity <= 0) {
        console.log(`[LIQUIDATION] ℹ️ No quantity to liquidate for cycle ${cycleId}`);
        logger.logStrategyAction('LIQUIDATION_SKIP', { reason: 'Zero quantity' });
        return;
      }

      const averagePrice = totalSpent / totalQuantity;

      console.log(`[LIQUIDATION] 📊 LIQUIDATION DETAILS:`);
      console.log(`[LIQUIDATION]    Total Quantity: ${totalQuantity.toFixed(6)} ${bot.tradingPair?.replace('USDT', '')}`);
      console.log(`[LIQUIDATION]    Average Entry Price: $${averagePrice.toFixed(6)}`);
      console.log(`[LIQUIDATION]    Total Investment: $${totalSpent.toFixed(2)}`);

      // Get exchange filters for the symbol
      const filters = await getBinanceSymbolFilters(bot.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');
      
      // Apply LOT_SIZE filter to ensure quantity compliance
      const adjustedQuantity = adjustQuantity(totalQuantity, filters.stepSize, filters.minQty, filters.qtyDecimals);

      console.log(`[LIQUIDATION] ⚙️ Adjusted quantity: ${adjustedQuantity.toFixed(filters.qtyDecimals)} (LOT_SIZE compliant)`);

      // Create liquidation order record
      const liquidationOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'liquidation',
        side: 'SELL', // Always sell to liquidate position
        orderCategory: 'MARKET',
        symbol: bot.tradingPair,
        quantity: adjustedQuantity.toFixed(filters.qtyDecimals),
        price: '0', // Market orders don't have a fixed price
        status: 'pending'
      });

      console.log(`[LIQUIDATION] ✓ Created liquidation order record (ID: ${liquidationOrder.id})`);

      // Get API credentials
      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      console.log(`[LIQUIDATION] 🚀 Placing market sell order on ${exchange.name}...`);
      console.log(`[LIQUIDATION]    Order Type: MARKET SELL`);
      console.log(`[LIQUIDATION]    Symbol: ${bot.tradingPair}`);
      console.log(`[LIQUIDATION]    Quantity: ${adjustedQuantity.toFixed(filters.qtyDecimals)}`);

      // Place market sell order for liquidation
      const orderParams = new URLSearchParams({
        symbol: bot.tradingPair,
        side: 'SELL',
        type: 'MARKET',
        quantity: adjustedQuantity.toFixed(filters.qtyDecimals),
        timestamp: Date.now().toString()
      });

      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderParams.toString())
        .digest('hex');
      
      orderParams.append('signature', signature);

      const orderResponse = await fetch(`${exchange.restApiEndpoint || 'https://testnet.binance.vision'}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: orderParams
      });

      const orderResult = await orderResponse.json();
      
      if (!orderResponse.ok) {
        console.log(`[LIQUIDATION] ❌ Liquidation order failed:`, orderResult);
        throw new Error(`Liquidation order failed: ${orderResult.msg || 'Unknown error'}`);
      }

      if (orderResult && orderResult.orderId) {
        // Calculate liquidation price
        let liquidationPrice = 0;
        let actualQuantity = adjustedQuantity;
        
        if (orderResult.executedQty && orderResult.cummulativeQuoteQty) {
          actualQuantity = parseFloat(orderResult.executedQty);
          const totalReceived = parseFloat(orderResult.cummulativeQuoteQty);
          liquidationPrice = totalReceived / actualQuantity;
        }

        // Update liquidation order record
        await storage.updateCycleOrder(liquidationOrder.id, {
          status: 'filled',
          exchangeOrderId: orderResult.orderId.toString(),
          filledPrice: liquidationPrice.toString(),
          filledQuantity: actualQuantity.toString(),
          filledAt: new Date()
        });

        const totalReceived = liquidationPrice * actualQuantity;
        const profitLoss = totalReceived - totalSpent;
        const profitPercentage = (profitLoss / totalSpent) * 100;

        console.log(`[LIQUIDATION] ✅ LIQUIDATION ORDER EXECUTED SUCCESSFULLY!`);
        console.log(`[LIQUIDATION]    Exchange Order ID: ${orderResult.orderId}`);
        console.log(`[LIQUIDATION]    Liquidation Price: $${liquidationPrice.toFixed(filters.priceDecimals)}`);
        console.log(`[LIQUIDATION]    Quantity Sold: ${actualQuantity.toFixed(filters.qtyDecimals)}`);
        console.log(`[LIQUIDATION]    Total Received: $${totalReceived.toFixed(2)}`);
        console.log(`[LIQUIDATION]    Profit/Loss: $${profitLoss.toFixed(2)} (${profitPercentage.toFixed(2)}%)`);

        // Log the liquidation details
        logger.logStrategyAction('LIQUIDATION_COMPLETED', {
          orderId: orderResult.orderId,
          quantity: actualQuantity.toFixed(filters.qtyDecimals),
          price: liquidationPrice.toFixed(filters.priceDecimals),
          totalReceived: totalReceived.toFixed(2),
          profitLoss: profitLoss.toFixed(2),
          profitPercentage: profitPercentage.toFixed(2)
        });

        // Broadcast liquidation notification
        const wsService = getGlobalWebSocketService();
        if (wsService) {
          wsService.broadcastOrderFillNotification({
            id: liquidationOrder.id,
            exchangeOrderId: orderResult.orderId.toString(),
            botId: botId,
            orderType: 'liquidation',
            symbol: bot.tradingPair,
            side: 'SELL',
            quantity: actualQuantity.toFixed(filters.qtyDecimals),
            price: liquidationPrice.toFixed(filters.priceDecimals),
            status: 'filled'
          });
        }

      } else {
        console.error(`[LIQUIDATION] ❌ Liquidation order result missing orderId:`, orderResult);
        throw new Error('Liquidation order result missing orderId');
      }
      
    } catch (error) {
      console.error('[LIQUIDATION] ❌ Liquidation order execution failed:', error);
      if (logger) {
        logger.logError('LIQUIDATION_ERROR', { error: (error as Error).message });
      }
      throw error;
    }
    
    console.log(`[LIQUIDATION] ===== LIQUIDATION ORDER COMPLETE =====`);
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
        throw new Error(`Failed to decrypt API credentials: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`);
      }      // Fetch actual balance from exchange API (works for both testnet and live)
      // The REST API endpoint determines whether it's testnet or live
      const environmentType = exchange.isTestnet ? 'Testnet' : 'Live';
      console.log(`[UNIFIED WS BALANCE FETCHING] Fetching real ${environmentType} balance from ${exchange.name}`);
        const baseUrl = exchange.restApiEndpoint || (exchange.isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');
      
      // Get Binance server time to avoid timestamp issues
      const timestamp = await this.getBinanceServerTime(baseUrl);
      
      // Create query parameters with recvWindow to handle timestamp issues
      const params = new URLSearchParams({
        timestamp: timestamp.toString(),
        recvWindow: '60000'  // 60 second window to handle clock sync issues
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
      }

      const accountData = await response.json();
      console.log(`[UNIFIED WS BALANCE FETCHING] Successfully fetched real ${environmentType} balance from ${exchange.name}`);
      console.log(`[UNIFIED WS BALANCE FETCHING] Balance data contains ${accountData.balances?.length || 0} assets`);
      
      return {
        success: true,
        data: {
          balances: accountData.balances || []
        },
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error(`[UNIFIED WS BALANCE FETCHING] Account balance fetch failed for exchange ${exchangeId}, asset ${asset}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error fetching balance',
        data: null,
        timestamp: Date.now()
      };
    }
  }
  async placeTakeProfitOrder(botId: number, cycleId: number, baseOrderPrice: number, baseOrderQuantity: number): Promise<void> {
    console.log(`\n[UNIFIED WS] [MARTINGALE STRATEGY] ===== PLACING TAKE PROFIT ORDER =====`);
    
    // Validate inputs
    if (!baseOrderPrice || baseOrderPrice <= 0) {
      const errorMsg = `Invalid base order price: ${baseOrderPrice}. Cannot calculate take profit.`;
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    if (!baseOrderQuantity || baseOrderQuantity <= 0) {
      const errorMsg = `Invalid base order quantity: ${baseOrderQuantity}. Cannot place take profit.`;
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
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
      let adjustedTakeProfitPrice = adjustPrice(takeProfitPrice, filters.tickSize, filters.priceDecimals);
      
      // Validate filter compliance for take profit order
      const compliance = ensureFilterCompliance(baseOrderQuantity, adjustedTakeProfitPrice, filters);
      if (!compliance.isValid) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Take profit filter compliance failed: ${compliance.error}`);
        // Try to fix the price by adjusting it again
        adjustedTakeProfitPrice = adjustPrice(adjustedTakeProfitPrice, filters.tickSize, filters.priceDecimals);
        
        // Validate again
        const retryCompliance = ensureFilterCompliance(baseOrderQuantity, adjustedTakeProfitPrice, filters);
        if (!retryCompliance.isValid) {
          throw new Error(`Take profit filter compliance failed: ${retryCompliance.error}`);
        }
        adjustedTakeProfitPrice = retryCompliance.price;
      } else {        adjustedTakeProfitPrice = compliance.price;
      }

      // Final validation of take profit price
      if (!adjustedTakeProfitPrice || adjustedTakeProfitPrice <= 0) {
        const errorMsg = `Invalid take profit price after adjustments: ${adjustedTakeProfitPrice}. Base price: ${baseOrderPrice}, Percentage: ${takeProfitPercentage}%`;
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 TAKE PROFIT CALCULATION:`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Base Price: $${baseOrderPrice.toFixed(6)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Take Profit %: ${takeProfitPercentage}%`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Raw TP Price: $${takeProfitPrice.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Adjusted TP Price: $${adjustedTakeProfitPrice.toFixed(filters.priceDecimals)} (PRICE_FILTER compliant)`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Quantity: ${baseOrderQuantity.toFixed(filters.qtyDecimals)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Filter Validation: ✅ PASSED`);

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
          await this.handleSafetyOrderFill(botId, cycleId, orderFillData);
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
   * Handle safety order fill event - core martingale strategy logic
   */
  async handleSafetyOrderFill(botId: number, cycleId: number, orderFillData: any): Promise<void> {
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ===== SAFETY ORDER FILLED =====`);
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] � SAFETY ORDER ANALYSIS:`);
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Bot ID: ${botId}, Cycle ID: ${cycleId}`);
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Fill Price: $${orderFillData.price}`);
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Fill Quantity: ${orderFillData.quantity}`);

    try {      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      const cycle = await storage.getActiveBotCycle(botId);
      if (!cycle) {
        throw new Error('Active cycle not found');
      }      // Get all filled orders for this cycle (base order + filled safety orders)
      const allOrders = await storage.getCycleOrders(cycleId);
      const filledOrders = allOrders.filter((order: any) => order.status === 'filled');
      const nonTakeProfitOrders = filledOrders.filter((order: any) => order.orderType !== 'take_profit');

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📋 Found ${nonTakeProfitOrders.length} filled orders for averaging:`);
      
      // 2. Calculate new average entry price
      let totalValue = 0;
      let totalQuantity = 0;
      
      for (const order of nonTakeProfitOrders) {
        const price = parseFloat(order.filledPrice || order.price || '0');
        const quantity = parseFloat(order.filledQuantity || order.quantity || '0');
        if (price > 0 && quantity > 0) {
          totalValue += price * quantity;
          totalQuantity += quantity;
          
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    - ${order.orderType}: ${quantity} @ $${price.toFixed(8)} = $${(price * quantity).toFixed(8)}`);
        }
      }

      const newAveragePrice = totalValue / totalQuantity;
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 NEW AVERAGE ENTRY PRICE: $${newAveragePrice.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Total Quantity: ${totalQuantity}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Total Value: $${totalValue.toFixed(8)}`);

      // 3. Cancel existing take profit order
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚫 Cancelling existing take profit order...`);
      const activeOrders = allOrders.filter((order: any) => order.status === 'active');
      const takeProfitOrder = activeOrders.find((order: any) => order.orderType === 'take_profit');
        if (takeProfitOrder && takeProfitOrder.exchangeOrderId) {
        try {
          await this.cancelOrder(botId, takeProfitOrder.exchangeOrderId);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Cancelled take profit order ${takeProfitOrder.exchangeOrderId}`);
        } catch (error) {
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⚠️ Take profit order might already be cancelled: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // 4. Place new take profit order at updated price
      await this.updateTakeProfitAfterSafetyOrder(botId, cycleId);

      // 5. Check if we should place the next safety order
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🔍 Checking if next safety order should be placed...`);
      const currentMarketPrice = parseFloat(orderFillData.price);
      await this.evaluateAndPlaceSafetyOrder(botId, cycleId, currentMarketPrice);

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ===== SAFETY ORDER PROCESSING COMPLETE =====`);

    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Safety order fill processing failed:`, error);
      throw error;
    }
  }
  /**
   * Update take profit order after safety order fill - recalculates based on new average price
   */
  async updateTakeProfitAfterSafetyOrder(botId: number, cycleId: number): Promise<void> {
    console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ===== UPDATING TAKE PROFIT AFTER SAFETY ORDER =====`);
    
    let logger: any = null;
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        throw new Error(`Bot ${botId} not found`);
      }

      // Initialize logger
      logger = BotLoggerManager.getLogger(botId, bot.tradingPair);
      logger.logStrategyAction('TAKE_PROFIT_UPDATE_START', {
        botId,
        cycleId,
        reason: 'safety_order_filled'
      });

      const exchange = await storage.getExchange(bot.exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }      // Get all filled orders for this cycle (base order + filled safety orders)
      const allOrders = await storage.getCycleOrders(cycleId);
      const filledOrders = allOrders.filter((order: any) => order.status === 'filled');
      const nonTakeProfitOrders = filledOrders.filter((order: any) => order.orderType !== 'take_profit');

      if (nonTakeProfitOrders.length === 0) {
        throw new Error('No filled orders found for average price calculation');
      }

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 Recalculating take profit from ${nonTakeProfitOrders.length} filled orders...`);
      
      // Calculate new average entry price
      let totalValue = 0;
      let totalQuantity = 0;
        for (const order of nonTakeProfitOrders) {
        const price = parseFloat(order.filledPrice || order.price || '0');
        const quantity = parseFloat(order.filledQuantity || order.quantity || '0');
        if (price > 0 && quantity > 0) {
          totalValue += price * quantity;
          totalQuantity += quantity;
          
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    - ${order.orderType}: ${quantity} @ $${price.toFixed(8)} = $${(price * quantity).toFixed(8)}`);
        }
      }

      const newAveragePrice = totalValue / totalQuantity;
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📈 NEW AVERAGE ENTRY PRICE: $${newAveragePrice.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Total Quantity: ${totalQuantity.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Total Value: $${totalValue.toFixed(8)}`);

      // Get symbol filters for price adjustment
      const filters = await getBinanceSymbolFilters(bot.tradingPair, exchange.restApiEndpoint || 'https://testnet.binance.vision');

      // Calculate new take profit price based on average entry price
      const takeProfitPercentage = parseFloat(bot.takeProfitPercentage);
      let newTakeProfitPrice: number;
      
      if (bot.direction === 'long') {
        newTakeProfitPrice = newAveragePrice * (1 + takeProfitPercentage / 100);
      } else {
        newTakeProfitPrice = newAveragePrice * (1 - takeProfitPercentage / 100);
      }

      // Apply PRICE_FILTER adjustment
      let adjustedTakeProfitPrice = adjustPrice(newTakeProfitPrice, filters.tickSize, filters.priceDecimals);
      
      // Validate filter compliance for new take profit order
      const compliance = ensureFilterCompliance(totalQuantity, adjustedTakeProfitPrice, filters);
      if (!compliance.isValid) {
        console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ New take profit filter compliance failed: ${compliance.error}`);
        adjustedTakeProfitPrice = adjustPrice(adjustedTakeProfitPrice, filters.tickSize, filters.priceDecimals);
      } else {
        adjustedTakeProfitPrice = compliance.price;
      }

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 📊 NEW TAKE PROFIT CALCULATION:`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    New Average Price: $${newAveragePrice.toFixed(8)}`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    Take Profit %: ${takeProfitPercentage}%`);
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY]    New TP Price: $${adjustedTakeProfitPrice.toFixed(filters.priceDecimals)}`);

      // Create new take profit order record
      const newTakeProfitOrder = await storage.createCycleOrder({
        cycleId: cycleId,
        botId: botId,
        userId: bot.userId,
        orderType: 'take_profit',
        side: bot.direction === 'long' ? 'SELL' : 'BUY',
        orderCategory: 'LIMIT',
        symbol: bot.tradingPair,
        quantity: totalQuantity.toFixed(filters.qtyDecimals),
        price: adjustedTakeProfitPrice.toFixed(filters.priceDecimals),
        status: 'pending'
      });

      // Place new take profit order on exchange
      const { apiKey, apiSecret } = decryptApiCredentials(
        exchange.apiKey,
        exchange.apiSecret,
        exchange.encryptionIv
      );

      const orderParams = new URLSearchParams({
        symbol: bot.tradingPair,
        side: bot.direction === 'long' ? 'SELL' : 'BUY',
        type: 'LIMIT',
        quantity: totalQuantity.toFixed(filters.qtyDecimals),
        price: adjustedTakeProfitPrice.toFixed(filters.priceDecimals),
        timeInForce: 'GTC',
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
        throw new Error(`Updated take profit order placement failed: ${orderResult.msg || 'Unknown error'}`);
      }

      if (orderResult && orderResult.orderId) {
        await storage.updateCycleOrder(newTakeProfitOrder.id, {
          exchangeOrderId: orderResult.orderId.toString(),
          status: 'active'
        });

        const wsService = getGlobalWebSocketService();
        if (wsService) {
          wsService.broadcastOrderFillNotification({
            id: newTakeProfitOrder.id,
            exchangeOrderId: orderResult.orderId.toString(),
            botId: botId,
            orderType: 'take_profit',
            symbol: bot.tradingPair,
            side: bot.direction === 'long' ? 'SELL' : 'BUY',
            quantity: totalQuantity.toFixed(filters.qtyDecimals),
            price: adjustedTakeProfitPrice.toFixed(filters.priceDecimals),
            status: 'active'
          });
        }

        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Updated take profit order placed! Order ID: ${orderResult.orderId}`);
        logger.logStrategyAction('TAKE_PROFIT_UPDATED', {
          orderId: orderResult.orderId,
          newAveragePrice: newAveragePrice.toFixed(8),
          newTakeProfitPrice: adjustedTakeProfitPrice.toFixed(filters.priceDecimals)
        });
      }    } catch (error) {
      console.error(`[UNIFIED WS] [MARTINGALE STRATEGY] ❌ Take profit update failed:`, error);
      if (logger) {
        logger.logStrategyAction('TAKE_PROFIT_UPDATE_FAILED', {
          botId,
          cycleId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
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

      // Cancel all pending safety orders before starting new cycle
      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] 🚫 CANCELLING PENDING SAFETY ORDERS...`);
      const allOrders = await storage.getCycleOrders(cycleId);
      const pendingSafetyOrders = allOrders.filter((order: any) => 
        order.orderType === 'safety_order' && 
        (order.status === 'pending' || order.status === 'active') &&
        order.exchangeOrderId
      );

      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] Found ${pendingSafetyOrders.length} pending safety orders to cancel`);
        for (const order of pendingSafetyOrders) {
        try {
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] Cancelling safety order ${order.id} (Exchange ID: ${order.exchangeOrderId})`);
          
          // Cancel order on exchange (with null check)
          if (order.exchangeOrderId) {
            await this.cancelOrder(botId, order.exchangeOrderId);
          }
          
          // Update order status in database
          await storage.updateCycleOrder(order.id, { 
            status: 'cancelled',
            filledAt: new Date()
          });
          
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Successfully cancelled safety order ${order.exchangeOrderId} on exchange`);
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Updated safety order ${order.id} status to cancelled`);
        } catch (cancelError) {
          console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⚠️ Safety order ${order.exchangeOrderId} might already be cancelled: ${cancelError instanceof Error ? cancelError.message : 'Unknown error'}`);
        }
      }
      
      if (pendingSafetyOrders.length === 0) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ No pending safety orders found for cycle ${cycleId}`);
      } else {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ All pending safety orders have been cancelled`);
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
      // });      // Check if bot is still active
      if (!bot.isActive) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏸️ Bot ${botId} is inactive, not starting new cycle`);
        
        // Broadcast bot status update
        const wsService = getGlobalWebSocketService();
        if (wsService) {
          wsService.broadcastBotStatusUpdate(bot);
        }
        
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
      }      // Check if bot is still active (might have been deactivated during cooldown)
      if (!bot.isActive) {
        console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ⏸️ Bot ${botId} is now inactive, cancelling new cycle`);
        
        // Broadcast bot status update
        const wsService = getGlobalWebSocketService();
        if (wsService) {
          wsService.broadcastBotStatusUpdate(bot);
        }
        
        return;
      }
      
      // Create new cycle
      const newCycle = await storage.createBotCycle({
        botId: botId,
        userId: bot.userId,
        maxSafetyOrders: bot.maxSafetyOrders,
        cycleNumber: 1, // This should be incremented based on previous cycles
        status: 'active'
      });      console.log(`[UNIFIED WS] [MARTINGALE STRATEGY] ✅ Created new cycle ${newCycle.id} for bot ${botId}`);      
      
      // Broadcast new cycle creation
      const wsService = getGlobalWebSocketService();
      if (wsService) {
        wsService.broadcastBotDataUpdate({
          type: 'bot_cycle_update',
          data: {
            action: 'created',
            cycle: newCycle
          }
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
  }  // Get open orders for a specific exchange and symbol
  async getOpenOrders(exchangeId: number, symbol?: string): Promise<any[]> {
    try {
      console.log(`[UNIFIED WS OPEN ORDERS] 🔍 Getting open orders for exchange ${exchangeId}, symbol: ${symbol || 'all'}`);
      
      // Get exchange details
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error(`Exchange ${exchangeId} not found`);
      }
      
      console.log(`[UNIFIED WS OPEN ORDERS] ✓ Using exchange: ${exchange.name} (${exchange.isTestnet ? 'Testnet' : 'Live'})`);
        // Decrypt API credentials
      const { apiKey, apiSecret } = decryptApiCredentials(exchange.apiKey, exchange.apiSecret, exchange.encryptionIv);
      
      console.log(`[UNIFIED WS OPEN ORDERS] 🔑 API Credentials:`);
      console.log(`[UNIFIED WS OPEN ORDERS]    API Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}`);
      console.log(`[UNIFIED WS OPEN ORDERS]    API Secret: ${apiSecret.substring(0, 8)}...${apiSecret.substring(apiSecret.length - 8)}`);
      console.log(`[UNIFIED WS OPEN ORDERS]    Encryption IV: ${exchange.encryptionIv}`);      // Prepare API request
      const timestamp = Date.now();
      const baseUrl = exchange.restApiEndpoint || (exchange.isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');
      
      console.log(`[UNIFIED WS OPEN ORDERS] 🌐 Using REST API endpoint: ${baseUrl}`);
      console.log(`[UNIFIED WS OPEN ORDERS] 🌐 Endpoint source: ${exchange.restApiEndpoint ? 'Database' : 'Fallback'}`);
        // Build query parameters
      const queryParams = new URLSearchParams({
        timestamp: timestamp.toString(),
        recvWindow: '60000'  // Increased to 60 seconds to handle clock sync issues
      });
        if (symbol) {
        queryParams.set('symbol', symbol);
        console.log(`[UNIFIED WS OPEN ORDERS] 🎯 Filtering by symbol: ${symbol}`);
      }
      
      // Create signature
      const queryString = queryParams.toString();
      const signature = crypto.createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');
      
      queryParams.set('signature', signature);
      
      console.log(`[UNIFIED WS OPEN ORDERS] 📡 Making API request to: ${baseUrl}/api/v3/openOrders`);
      
      // Make API request
      const response = await fetch(`${baseUrl}/api/v3/openOrders?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/json'
        }
      });
        if (!response.ok) {
        const errorText = await response.text();
        console.error(`[UNIFIED WS OPEN ORDERS] ❌ API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        
        // Try alternative method - use account endpoint which includes open orders
        console.log(`[UNIFIED WS OPEN ORDERS] 🔄 Trying alternative method using account endpoint...`);
        
        try {
          const accountParams = new URLSearchParams({
            timestamp: Date.now().toString(),
            recvWindow: '10000'
          });
          
          const accountQueryString = accountParams.toString();
          const accountSignature = crypto.createHmac('sha256', apiSecret)
            .update(accountQueryString)
            .digest('hex');
          
          accountParams.set('signature', accountSignature);
          
          const accountResponse = await fetch(`${baseUrl}/api/v3/account?${accountParams.toString()}`, {
            method: 'GET',
            headers: {
              'X-MBX-APIKEY': apiKey,
              'Content-Type': 'application/json'
            }
          });
          
          if (accountResponse.ok) {
            const accountData = await response.json();
            console.log(`[UNIFIED WS OPEN ORDERS] ⚠️ Account endpoint worked, but openOrders endpoint failed. Using empty array for now.`);
            console.log(`[UNIFIED WS OPEN ORDERS] 📋 Account data received - this confirms API key is valid`);
            
            // Return empty array since we can't get open orders directly
            // but we know the API key is valid
            return [];
          }
        } catch (accountError) {
          console.error(`[UNIFIED WS OPEN ORDERS] ❌ Account endpoint also failed:`, accountError);
        }
        
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const openOrders = await response.json();
      
      console.log(`[UNIFIED WS OPEN ORDERS] ✅ Retrieved ${openOrders.length} open orders for exchange ${exchangeId}`);
      
      // Log order details for debugging
      if (openOrders.length > 0) {        console.log(`[UNIFIED WS OPEN ORDERS] 📋 Open orders summary:`);
        openOrders.forEach((order: any, index: number) => {
          console.log(`[UNIFIED WS OPEN ORDERS]   ${index + 1}. ${order.symbol} ${order.side} ${order.type} - Price: ${order.price || 'MARKET'}, Qty: ${order.origQty}, Status: ${order.status}`);
        });
      } else {
        console.log(`[UNIFIED WS OPEN ORDERS] 📝 No open orders found`);
      }
      
      return openOrders;
      
    } catch (error) {
      console.error(`[UNIFIED WS OPEN ORDERS] ❌ Error getting open orders:`, error);
      throw error;
    }
  }
  // Enhanced order monitoring for all trading types
  async monitorAllOrders(exchangeId: number): Promise<void> {
    console.log(`[UNIFIED WS ORDER MONITOR] 🔍 Starting comprehensive order monitoring for exchange ${exchangeId}`);
    
    try {
      const exchange = await storage.getExchange(exchangeId);
      if (!exchange) {
        throw new Error('Exchange not found');
      }

      console.log(`[UNIFIED WS ORDER MONITOR] 📊 Monitoring orders on ${exchange.name} (${exchange.exchangeType || 'binance'})`);
      
      // Get all open orders and broadcast to clients
      const openOrders = await this.getOpenOrders(exchangeId);
      
      const wsService = getGlobalWebSocketService();
      if (wsService) {
        wsService.broadcastOpenOrdersUpdate(exchangeId, undefined, openOrders);
        
        // Also broadcast detailed order monitoring status
        wsService.broadcastOrderUpdate({
          type: 'order_monitoring_status',
          exchangeId: exchangeId,
          exchangeName: exchange.name,
          openOrdersCount: openOrders.length,
          monitoringActive: true,
          timestamp: Date.now()
        });        // Enhanced monitoring: categorize orders by type and strategy
        const orderStats = {
          total: openOrders.length,
          manual: 0,
          martingale: 0,
          limitOrders: 0,
          marketOrders: 0,
          buyOrders: 0,
          sellOrders: 0
        };
        
        // Basic order analysis
        openOrders.forEach(order => {
          if (order.side === 'BUY') orderStats.buyOrders++;
          if (order.side === 'SELL') orderStats.sellOrders++;
          if (order.type === 'LIMIT') orderStats.limitOrders++;
          if (order.type === 'MARKET') orderStats.marketOrders++;
          
          const clientId = order.clientOrderId || '';
          if (clientId.includes('bot_') || clientId.includes('martingale_')) {
            orderStats.martingale++;
          } else {
            orderStats.manual++;
          }
        });
        
        wsService.broadcastOrderUpdate({
          type: 'order_distribution_stats',
          exchangeId: exchangeId,
          stats: orderStats,
          timestamp: Date.now()
        });
      }
      
      console.log(`[UNIFIED WS ORDER MONITOR] ✅ Order monitoring active for exchange ${exchangeId} - ${openOrders.length} orders tracked`);
      
    } catch (error) {
      console.error(`[UNIFIED WS ORDER MONITOR] ❌ Failed to start order monitoring for exchange ${exchangeId}:`, error);
    }
  }

  // Enhanced method to track order lifecycle events
  async trackOrderLifecycle(orderData: any): Promise<void> {
    console.log(`[UNIFIED WS ORDER LIFECYCLE] 📈 Tracking order lifecycle for ${orderData.symbol} order ${orderData.orderId}`);
    
    const lifecycle = {
      orderId: orderData.orderId || orderData.exchangeOrderId,
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.type || orderData.orderType,
      quantity: orderData.quantity,
      price: orderData.price,
      status: orderData.status,
      exchangeId: orderData.exchangeId,      timestamp: Date.now(),
      lifecycle_event: 'status_change',
      // Additional tracking fields
      isManualTrade: orderData.isManualTrade || false,
      botId: orderData.botId,
      cycleId: orderData.cycleId,
      orderType: orderData.orderType // base_order, safety_order, take_profit, manual_trade
    };
    
    console.log(`[UNIFIED WS ORDER LIFECYCLE] 📊 Tracking order lifecycle:`, lifecycle);
      // Broadcast lifecycle event to all clients
    const wsService = getGlobalWebSocketService();
    if (wsService) {
      wsService.broadcastOrderUpdate({
        type: 'order_lifecycle_event',
        data: lifecycle
      });
    }
  }
}