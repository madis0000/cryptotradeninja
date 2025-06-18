import { storage } from './storage';
import { decryptApiCredentials } from './encryption';
import { getBinanceSymbolFilters, ensureFilterCompliance } from './binance-filters';
import * as crypto from 'crypto';

export class ExchangeService {
  async placeOrder(exchangeId: number, orderParams: any): Promise<any> {
    const exchange = await storage.getExchange(exchangeId);
    
    if (!exchange) {
      throw new Error('Exchange not found');
    }
    
    // Decrypt API credentials
    const decryptedCredentials = decryptApiCredentials(
      exchange.apiKey, 
      exchange.apiSecret, 
      exchange.encryptionIv
    );
    const { apiKey, apiSecret } = decryptedCredentials;
    
    // Get exchange filters for the symbol
    const restEndpoint = exchange.restApiEndpoint || 'https://testnet.binance.vision';
    const filters = await getBinanceSymbolFilters(orderParams.symbol, restEndpoint);
    
    // Special handling for market orders
    if (orderParams.type === 'MARKET') {
      // Ensure we're using the correct parameter for market orders
      if (orderParams.quoteOrderQty && orderParams.quantity) {
        // Remove quantity if quoteOrderQty is specified
        delete orderParams.quantity;
      } else if (!orderParams.quoteOrderQty && !orderParams.quantity) {
        throw new Error('Market order must specify either quantity or quoteOrderQty');
      }
      
      // Log the order parameters for debugging
      console.log('[EXCHANGE SERVICE] Placing MARKET order:', {
        symbol: orderParams.symbol,
        side: orderParams.side,
        quoteOrderQty: orderParams.quoteOrderQty,
        quantity: orderParams.quantity
      });
    } else if (orderParams.type === 'LIMIT' && orderParams.price && orderParams.quantity) {
      // Apply filter compliance for LIMIT orders
      const compliance = ensureFilterCompliance(
        parseFloat(orderParams.quantity),
        parseFloat(orderParams.price),
        filters
      );
      
      if (!compliance.isValid) {
        throw new Error(`Filter compliance failed: ${compliance.error}`);
      }
      
      orderParams.quantity = compliance.quantity.toString();
      orderParams.price = compliance.price.toString();
    }
    
    // Prepare order parameters for Binance API
    const apiParams = new URLSearchParams({
      symbol: orderParams.symbol,
      side: orderParams.side,
      type: orderParams.type,
      timestamp: Date.now().toString()
    });

    // Add quantity or quoteOrderQty based on order type
    if (orderParams.quantity) {
      apiParams.append('quantity', orderParams.quantity);
    }
    if (orderParams.quoteOrderQty) {
      apiParams.append('quoteOrderQty', orderParams.quoteOrderQty);
    }

    // Add price for LIMIT orders
    if (orderParams.type === 'LIMIT' && orderParams.price) {
      apiParams.append('price', orderParams.price);
      apiParams.append('timeInForce', orderParams.timeInForce || 'GTC');
    }

    // Create signature for Binance API
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(apiParams.toString())
      .digest('hex');
    
    apiParams.append('signature', signature);
    
    try {
      // Make API call to place order
      const orderResponse = await fetch(`${restEndpoint}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: apiParams
      });

      const orderResult = await orderResponse.json();
      
      if (!orderResponse.ok) {
        console.error('[EXCHANGE SERVICE] Order placement failed:', orderResult);
        throw new Error(`Order failed: ${orderResult.msg || orderResult.message || 'Unknown error'}`);
      }

      return this.normalizeOrderResponse(orderResult);
    } catch (error) {
      console.error('[EXCHANGE SERVICE] Order placement failed:', error);
      throw error;
    }
  }
    private normalizeOrderResponse(response: any): any {
    // Normalize the Binance API response to a consistent format
    return {
      orderId: response.orderId,
      clientOrderId: response.clientOrderId,
      symbol: response.symbol,
      side: response.side,
      type: response.type,
      status: response.status,
      price: response.price || '0',
      averagePrice: response.price || '0',
      executedQty: response.executedQty,
      origQty: response.origQty,
      cummulativeQuoteQty: response.cummulativeQuoteQty,
      timeInForce: response.timeInForce,
      transactTime: response.transactTime,
      workingTime: response.workingTime || response.transactTime,
      selfTradePreventionMode: response.selfTradePreventionMode || 'NONE'
    };
  }
}
