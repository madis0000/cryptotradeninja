import WebSocket from 'ws';

// Test to simulate proper frontend behavior - single client changing symbols
async function testSingleClientSymbolChange() {
  console.log('Testing single client symbol change (frontend behavior)...\n');

  let client = new WebSocket('ws://localhost:3001/api/ws');
  
  client.on('open', () => {
    console.log('Client: Connected');
    
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

  let btcCount = 0;
  let icpCount = 0;

  client.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type === 'kline_update') {
      if (message.data.symbol === 'BTCUSDT') {
        btcCount++;
        console.log(`❌ Still receiving BTCUSDT kline #${btcCount}: ${message.data.close}`);
      } else if (message.data.symbol === 'ICPUSDT') {
        icpCount++;
        console.log(`✅ Received ICPUSDT kline #${icpCount}: ${message.data.close}`);
      }
    }
  });

  client.on('close', () => {
    console.log('Client: Disconnected');
    console.log(`\nResults:`);
    console.log(`- BTCUSDT klines received: ${btcCount}`);
    console.log(`- ICPUSDT klines received: ${icpCount}`);
    console.log(`\nExpected: Should stop receiving BTCUSDT klines after changing to ICPUSDT`);
    console.log(`If you see BTCUSDT klines after step 2, there's a subscription issue.`);
  });
}

testSingleClientSymbolChange().catch(console.error);
