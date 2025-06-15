import WebSocket from 'ws';

// Connect to the WebSocket server
const ws = new WebSocket('ws://localhost:3001/api/ws');

ws.on('open', function open() {
  console.log('Connected to WebSocket server');
  
  // First, subscribe to BTCUSDT
  console.log('1. Subscribing to BTCUSDT...');
  ws.send(JSON.stringify({
    type: 'change_subscription',
    symbol: 'BTCUSDT',
    interval: '4h'
  }));
  
  // Wait 5 seconds, then change to ETHUSDT
  setTimeout(() => {
    console.log('2. Changing subscription to ETHUSDT...');
    ws.send(JSON.stringify({
      type: 'change_subscription',
      symbol: 'ETHUSDT',
      interval: '4h'
    }));
    
    // Wait 10 more seconds then close
    setTimeout(() => {
      console.log('3. Closing connection...');
      ws.close();
    }, 10000);
  }, 5000);
});

ws.on('message', function message(data) {
  console.log('Received:', data.toString());
});

ws.on('close', function close() {
  console.log('Disconnected from WebSocket server');
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});
