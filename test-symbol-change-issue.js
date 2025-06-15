import WebSocket from 'ws';

// Test to demonstrate the issue: server should stop receiving old symbol data
async function testSymbolChangeUnsubscription() {
  console.log('Testing symbol change unsubscription from Binance...\n');

  const client = new WebSocket('ws://localhost:3001/api/ws');
  
  client.on('open', () => {
    console.log('Connected to server');
    
    // Subscribe to BTCUSDT first
    console.log('1. Subscribing to BTCUSDT...');
    client.send(JSON.stringify({
      type: 'change_subscription',
      symbol: 'BTCUSDT',
      interval: '4h'
    }));
    
    // After 3 seconds, change to ICPUSDT
    setTimeout(() => {
      console.log('2. Changing to ICPUSDT...');
      client.send(JSON.stringify({
        type: 'change_subscription',
        symbol: 'ICPUSDT',
        interval: '4h'
      }));
      
      // After another 3 seconds, disconnect
      setTimeout(() => {
        console.log('3. Disconnecting...');
        client.close();
      }, 3000);
    }, 3000);
  });

  client.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type === 'kline_update') {
      console.log(`Received kline for: ${message.data.symbol} at ${message.data.close}`);
    }
  });

  client.on('close', () => {
    console.log('Disconnected from server');
    console.log('\nCheck server logs:');
    console.log('- Should see "Unsubscribing from: btcusdt@kline_4h" when changing to ICPUSDT');
    console.log('- Should see "Unsubscribing from: icpusdt@kline_4h" when disconnecting');
    console.log('- Should stop receiving BTCUSDT klines after changing to ICPUSDT');
  });
}

testSymbolChangeUnsubscription().catch(console.error);
