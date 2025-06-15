import WebSocket from 'ws';

// Test to verify complete unsubscription when no clients need a symbol
async function testCompleteUnsubscription() {
  console.log('Testing complete unsubscription when no clients need a symbol...\n');

  // Client 1: Subscribe to BTCUSDT
  const client1 = new WebSocket('ws://localhost:3001/api/ws');
  
  client1.on('open', () => {
    console.log('Client 1: Connected');
    client1.send(JSON.stringify({
      type: 'change_subscription',
      symbol: 'BTCUSDT',
      interval: '4h'
    }));
  });

  client1.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type === 'market_update' && message.data.symbol === 'BTCUSDT') {
      console.log(`Client 1: Received BTCUSDT price: ${message.data.price}`);
    }
  });

  // Wait for first client to be established
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Client 2: Subscribe to BTCUSDT as well
  const client2 = new WebSocket('ws://localhost:3001/api/ws');
  
  client2.on('open', () => {
    console.log('Client 2: Connected');
    client2.send(JSON.stringify({
      type: 'change_subscription',
      symbol: 'BTCUSDT',
      interval: '4h'
    }));
  });

  client2.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type === 'market_update' && message.data.symbol === 'BTCUSDT') {
      console.log(`Client 2: Received BTCUSDT price: ${message.data.price}`);
    }
  });

  // Wait for both clients to receive data
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n--- Disconnecting Client 1 (BTCUSDT should still be active) ---');
  client1.close();

  // Wait and see if BTCUSDT data continues (it should, because client2 is still connected)
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n--- Disconnecting Client 2 (BTCUSDT should be unsubscribed completely) ---');
  client2.close();

  // Wait to see if BTCUSDT data stops completely
  console.log('Waiting 5 seconds to verify no more BTCUSDT data is received...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Test completed. Check server logs to verify BTCUSDT was unsubscribed from Binance.');
}

testCompleteUnsubscription().catch(console.error);
