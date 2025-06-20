import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3001/api/ws';
const TEST_DURATION = 15000; // 15 seconds

console.log('🚀 QUICK BROADCASTING TEST');
console.log('==========================');
console.log(`WebSocket URL: ${WS_URL}`);
console.log(`Duration: ${TEST_DURATION / 1000}s`);
console.log('');

const ws = new WebSocket(WS_URL);
let eventCount = 0;

ws.on('open', () => {
  console.log('✅ Connected to WebSocket server');
  
  // Subscribe to ticker updates for active symbols
  ws.send(JSON.stringify({
    type: 'subscribe_ticker',
    symbols: ['BTCUSDT', 'ETHUSDT', 'ICPUSDT'],
    exchangeId: 4 // Use the testnet exchange
  }));
  
  console.log('🎯 Subscribed to ticker updates');
  console.log('📡 Monitoring all broadcast events...');
  console.log('');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    eventCount++;
    
    const timestamp = new Date().toISOString().substr(11, 12);
    console.log(`[${timestamp}] 📡 ${message.type} - ${JSON.stringify(message.data || message.message || 'N/A').substr(0, 100)}...`);
    
    // Special handling for important events
    if (message.type === 'order_fill_notification') {
      console.log('  🎯 ORDER FILL DETECTED!');
    } else if (message.type === 'bot_status_update') {
      console.log('  🤖 BOT STATUS CHANGE!');
    } else if (message.type === 'bot_cycle_update') {
      console.log('  🔄 BOT CYCLE UPDATE!');
    }
    
  } catch (error) {
    console.error('❌ Error parsing message:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('🔌 Connection closed');
});

setTimeout(() => {
  console.log('');
  console.log('📊 TEST RESULTS:');
  console.log(`Total events received: ${eventCount}`);
  console.log(`Events per second: ${(eventCount / (TEST_DURATION / 1000)).toFixed(2)}`);
  
  if (eventCount > 0) {
    console.log('✅ Broadcasting system is working!');
  } else {
    console.log('⚠️  No events received - check if streams are active');
  }
  
  ws.close();
  process.exit(0);
}, TEST_DURATION);
