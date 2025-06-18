const WebSocket = require('ws');

async function testMartingaleOrderPlacement() {
  console.log('🧪 Testing Martingale Order Placement Fixes...\n');
  
  const ws = new WebSocket('ws://localhost:3001/api/ws');
  
  ws.on('open', () => {
    console.log('✅ Connected to WebSocket server');
    
    // Test creating a Martingale bot with proper filter compliance
    const testBot = {
      type: 'create_bot',
      data: {
        name: 'Test Martingale Bot - DOGEUSDT',
        strategy: 'martingale',
        exchangeId: 4, // Binance testnet
        tradingPair: 'DOGEUSDT',
        direction: 'long',
        status: 'active',
        
        // Order Settings (smaller amounts for testing)
        baseOrderAmount: '10', // $10 USDT
        safetyOrderAmount: '5', // $5 USDT  
        maxSafetyOrders: 2,
        safetyOrderSizeMultiplier: '1.2',
        priceDeviation: '0.5', // 0.5%
        priceDeviationMultiplier: '1.1',
        takeProfitPercentage: '1.0', // 1%
        
        // Risk management
        maxActiveSafetyOrders: 2,
        activeSafetyOrdersEnabled: true,
        activeSafetyOrders: '2'
      }
    };
    
    console.log('📤 Creating test Martingale bot with filter-compliant settings...');
    console.log('   Base Order: $10 USDT');
    console.log('   Safety Orders: $5 USDT each (max 2)');  
    console.log('   Price Deviation: 0.5%');
    console.log('   Take Profit: 1.0%');
    
    ws.send(JSON.stringify(testBot));
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📥 Received message type:', message.type);
      
      if (message.type === 'bot_created') {
        console.log('✅ Bot created successfully!');
        console.log('   Bot ID:', message.data.id);
        console.log('   Symbol:', message.data.tradingPair);
        console.log('   Direction:', message.data.direction);
      } else if (message.type === 'order_update') {
        console.log('📊 Order Update:');
        console.log('   Order ID:', message.data.orderId);
        console.log('   Symbol:', message.data.symbol);
        console.log('   Side:', message.data.side);
        console.log('   Status:', message.data.status);
        console.log('   Quantity:', message.data.quantity);
        console.log('   Price:', message.data.price);
        
        if (message.data.status === 'FILLED') {
          console.log('✅ Order filled successfully!');
        } else if (message.data.status === 'EXPIRED') {
          console.log('❌ Order expired - checking filter compliance');
        }
      } else if (message.type === 'error') {
        console.log('❌ Error:', message.data);
        
        if (message.data.includes('LOT_SIZE')) {
          console.log('🔍 LOT_SIZE filter error detected - checking quantity adjustment');
        } else if (message.data.includes('PRICE_FILTER')) {
          console.log('🔍 PRICE_FILTER error detected - checking price adjustment');
        }
      } else if (message.type === 'cycle_update') {
        console.log('🔄 Cycle Update:');
        console.log('   Cycle ID:', message.data.id);
        console.log('   Status:', message.data.status);
        console.log('   Average Entry Price:', message.data.averageEntryPrice);
      }
    } catch (error) {
      console.log('📥 Raw message:', data.toString());
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
  });
  
  // Auto-close after 30 seconds
  setTimeout(() => {
    console.log('⏰ Test timeout - closing connection');
    ws.close();
  }, 30000);
}

testMartingaleOrderPlacement().catch(console.error);
