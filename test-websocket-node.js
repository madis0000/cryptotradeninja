import WebSocket from 'ws';

console.log('Testing WebSocket connection to ws://localhost:3001/api/ws');

const ws = new WebSocket('ws://localhost:3001/api/ws');

ws.on('open', function open() {
  console.log('✅ WebSocket connected successfully!');
  
  // Send test message
  const testMessage = { type: 'test', message: 'connection_test' };
  console.log('Sending test message:', testMessage);
  ws.send(JSON.stringify(testMessage));
  
  // Send subscription message
  const subscribeMessage = { type: 'subscribe', symbols: ['BTCUSDT'] };
  console.log('Sending subscription message:', subscribeMessage);
  ws.send(JSON.stringify(subscribeMessage));
});

ws.on('message', function message(data) {
  console.log('📨 Received message:', data.toString());
  try {
    const parsed = JSON.parse(data.toString());
    console.log('📋 Parsed message:', parsed);
  } catch (e) {
    console.log('❌ Failed to parse message as JSON');
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err);
});

ws.on('close', function close(code, reason) {
  console.log(`🔌 WebSocket closed with code ${code}, reason: ${reason}`);
  process.exit(0);
});

// Close after 10 seconds
setTimeout(() => {
  console.log('🔴 Closing connection after test');
  ws.close();
}, 10000);
