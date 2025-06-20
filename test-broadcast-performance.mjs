#!/usr/bin/env node

import WebSocket from 'ws';
import { performance } from 'perf_hooks';

const WS_URL = 'ws://localhost:3001/api/ws';
const NUM_CLIENTS = 50; // Simulate 50 concurrent clients
const TEST_DURATION = 30000; // 30 seconds

console.log('🚀 BROADCAST PERFORMANCE TEST - HEAVY LOAD SIMULATION');
console.log('====================================================');
console.log(`Simulating ${NUM_CLIENTS} concurrent clients`);
console.log(`Test duration: ${TEST_DURATION / 1000} seconds`);
console.log('');

const clients = [];
const messageStats = new Map();
const latencyStats = new Map();

// Create multiple WebSocket clients
async function createClients() {
  console.log('📡 Creating WebSocket clients...');
  
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const clientId = `test_client_${i}`;
    const client = {
      id: clientId,
      ws: null,
      messageCount: 0,
      connected: false,
      subscriptionType: i % 3 === 0 ? 'ticker' : i % 3 === 1 ? 'kline' : 'mixed'
    };
    
    messageStats.set(clientId, { ticker: 0, kline: 0, other: 0 });
    latencyStats.set(clientId, []);
    
    client.ws = new WebSocket(WS_URL);
    
    client.ws.on('open', () => {
      client.connected = true;
      console.log(`✅ Client ${i + 1}/${NUM_CLIENTS} connected (${client.subscriptionType})`);
      
      // Subscribe based on client type
      if (client.subscriptionType === 'ticker') {
        // Subscribe to ticker updates
        client.ws.send(JSON.stringify({
          type: 'subscribe_ticker',
          symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
          exchangeId: 1
        }));
      } else if (client.subscriptionType === 'kline') {
        // Subscribe to kline updates
        client.ws.send(JSON.stringify({
          type: 'change_subscription',
          symbol: 'BTCUSDT',
          interval: '1m',
          exchangeId: 1
        }));
      } else {
        // Mixed subscription
        client.ws.send(JSON.stringify({
          type: 'subscribe_ticker',
          symbols: ['BTCUSDT'],
          exchangeId: 1
        }));
        
        setTimeout(() => {
          client.ws.send(JSON.stringify({
            type: 'change_subscription',
            symbol: 'ETHUSDT',
            interval: '5m',
            exchangeId: 1
          }));
        }, 100);
      }
    });
    
    client.ws.on('message', (data) => {
      const receiveTime = performance.now();
      client.messageCount++;
      
      try {
        const message = JSON.parse(data.toString());
        const stats = messageStats.get(clientId);
        
        if (message.type === 'market_update' || message.type === 'ticker_update') {
          stats.ticker++;
        } else if (message.type === 'kline_update') {
          stats.kline++;
        } else {
          stats.other++;
        }
        
        // Calculate latency if timestamp is available
        if (message.timestamp) {
          const sendTime = new Date(message.timestamp).getTime();
          const latency = Date.now() - sendTime;
          latencyStats.get(clientId).push(latency);
        }
      } catch (error) {
        // Ignore parse errors
      }
    });
    
    client.ws.on('error', (error) => {
      console.error(`❌ Client ${clientId} error:`, error.message);
    });
    
    client.ws.on('close', () => {
      client.connected = false;
    });
    
    clients.push(client);
    
    // Stagger client connections
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

// Analyze results
function analyzeResults() {
  console.log('\n📊 PERFORMANCE TEST RESULTS');
  console.log('===========================');
  
  let totalMessages = 0;
  let totalTickerMessages = 0;
  let totalKlineMessages = 0;
  let connectedClients = 0;
  const allLatencies = [];
  
  clients.forEach(client => {
    if (client.connected) connectedClients++;
    totalMessages += client.messageCount;
    
    const stats = messageStats.get(client.id);
    totalTickerMessages += stats.ticker;
    totalKlineMessages += stats.kline;
    
    const latencies = latencyStats.get(client.id);
    allLatencies.push(...latencies);
  });
  
  console.log(`\n📡 Connection Stats:`);
  console.log(`   Connected clients: ${connectedClients}/${NUM_CLIENTS}`);
  console.log(`   Failed connections: ${NUM_CLIENTS - connectedClients}`);
  
  console.log(`\n📨 Message Stats:`);
  console.log(`   Total messages received: ${totalMessages}`);
  console.log(`   Ticker updates: ${totalTickerMessages}`);
  console.log(`   Kline updates: ${totalKlineMessages}`);
  console.log(`   Messages per second: ${(totalMessages / (TEST_DURATION / 1000)).toFixed(2)}`);
  console.log(`   Average messages per client: ${(totalMessages / NUM_CLIENTS).toFixed(2)}`);
  
  if (allLatencies.length > 0) {
    allLatencies.sort((a, b) => a - b);
    const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
    const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)];
    const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)];
    const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)];
    
    console.log(`\n⚡ Latency Stats (ms):`);
    console.log(`   Average: ${avgLatency.toFixed(2)}`);
    console.log(`   P50: ${p50}`);
    console.log(`   P95: ${p95}`);
    console.log(`   P99: ${p99}`);
    console.log(`   Min: ${Math.min(...allLatencies)}`);
    console.log(`   Max: ${Math.max(...allLatencies)}`);
  }
  
  // Check for message distribution fairness
  console.log(`\n📊 Distribution Analysis:`);
  const messageCounts = clients.map(c => c.messageCount).sort((a, b) => b - a);
  console.log(`   Most messages received by a client: ${messageCounts[0]}`);
  console.log(`   Least messages received by a client: ${messageCounts[messageCounts.length - 1]}`);
  console.log(`   Distribution variance: ${(messageCounts[0] - messageCounts[messageCounts.length - 1])}`);
  
  // Performance rating
  console.log(`\n🎯 Performance Rating:`);
  if (avgLatency < 10 && connectedClients === NUM_CLIENTS) {
    console.log('   ⭐⭐⭐⭐⭐ EXCELLENT - Production ready!');
  } else if (avgLatency < 50 && connectedClients >= NUM_CLIENTS * 0.95) {
    console.log('   ⭐⭐⭐⭐ VERY GOOD - Minor optimizations needed');
  } else if (avgLatency < 100 && connectedClients >= NUM_CLIENTS * 0.9) {
    console.log('   ⭐⭐⭐ GOOD - Some optimizations recommended');
  } else {
    console.log('   ⭐⭐ NEEDS IMPROVEMENT - Significant optimizations required');
  }
}

// Cleanup
function cleanup() {
  console.log('\n🧹 Cleaning up...');
  clients.forEach(client => {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.close();
    }
  });
}

// Run test
async function runTest() {
  try {
    await createClients();
    
    console.log(`\n⏱️  Running test for ${TEST_DURATION / 1000} seconds...`);
    console.log('   Monitoring message flow and latency...\n');
    
    // Show progress
    const progressInterval = setInterval(() => {
      const connected = clients.filter(c => c.connected).length;
      const totalMsg = clients.reduce((sum, c) => sum + c.messageCount, 0);
      process.stdout.write(`\r   Active: ${connected} | Messages: ${totalMsg} | Rate: ${(totalMsg / ((Date.now() - startTime) / 1000)).toFixed(1)} msg/s`);
    }, 1000);
    
    const startTime = Date.now();
    
    await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
    
    clearInterval(progressInterval);
    console.log('\n');
    
    analyzeResults();
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    cleanup();
  }
}

// Execute test
console.log('🚀 Starting broadcast performance test...\n');
runTest().then(() => {
  console.log('\n✅ Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
