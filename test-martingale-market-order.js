const WebSocket = require('ws');

async function testMartingaleMarketOrder() {
  console.log('🧪 Testing Martingale Market Order Placement...\n');
  
  const ws = new WebSocket('ws://localhost:3001/api/ws');
  
  ws.on('open', () => {
    console.log('✅ Connected to WebSocket server');
    
    // Test market order with quoteOrderQty
    const testOrder = {
      type: 'place_order',
      data: {
        exchangeId: 1,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quoteOrderQty: '100', // Spend exactly 100 USDT
        // Note: Not sending quantity parameter for market orders
      }
    };
    
    console.log('📤 Sending test market order:', testOrder);
    ws.send(JSON.stringify(testOrder));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📥 Received:', message);
    
    if (message.type === 'order_update') {
      if (message.data.status === 'FILLED') {
        console.log('✅ Market order filled successfully!');
        console.log('   Executed Qty:', message.data.executedQty);
        console.log('   Avg Price:', message.data.averagePrice);
        console.log('   Total Cost:', message.data.cummulativeQuoteQty);
      } else if (message.data.status === 'EXPIRED') {
        console.error('❌ Market order expired - insufficient liquidity');
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
}

testMartingaleMarketOrder().catch(console.error);
