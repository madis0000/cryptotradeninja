import WebSocket from 'ws';

console.log('🔌 WEBSOCKET CONNECTIVITY TEST');
console.log('==============================');

// Test both possible WebSocket URLs
const WS_URLS = [
  'ws://localhost:3000/api/ws',  // Main server WebSocket
  'ws://localhost:3001',         // Dedicated WebSocket server
  'ws://localhost:3001/api/ws'   // Dedicated server with path
];

for (const url of WS_URLS) {
  console.log(`\nTesting connection to: ${url}`);
  
  const ws = new WebSocket(url);
  
  ws.on('open', () => {
    console.log(`✅ Connected to ${url}`);
    
    // Send test message
    ws.send(JSON.stringify({
      type: 'test',
      message: 'connectivity_test'
    }));
    
    setTimeout(() => {
      ws.close();
    }, 2000);
  });
  
  ws.on('message', (data) => {
    console.log(`📨 Received: ${data.toString()}`);
  });
  
  ws.on('error', (error) => {
    console.log(`❌ Connection failed: ${error.message}`);
  });
  
  ws.on('close', () => {
    console.log(`🔌 Connection closed`);
  });
  
  // Wait for this connection attempt to complete
  await new Promise(resolve => {
    setTimeout(resolve, 3000);
  });
}
