import WebSocket from 'ws';

// Test configuration - Enhanced for performance testing
const WS_URL = 'ws://localhost:3001/api/ws'; // Correct WebSocket URL
const TEST_DURATION = 60000; // 60 seconds for comprehensive testing
const MONITORING_EVENTS = [
  'order_fill_notification',
  'bot_status_update',
  'bot_data_update',
  'bot_cycle_update',
  'order_status_update',
  'order_update',
  'open_orders_update',
  'market_update',
  'ticker_update'
];

// Performance thresholds for different event types
const PERFORMANCE_THRESHOLDS = {
  'order_fill_notification': 10, // ms - Critical for martingale
  'bot_status_update': 50,       // ms - Important for monitoring
  'bot_cycle_update': 50,        // ms - Important for martingale
  'order_status_update': 25,     // ms - Important for trading
  'order_update': 25,            // ms - Important for trading
  'open_orders_update': 100,     // ms - Normal priority
  'market_update': 100,          // ms - Normal priority
  'ticker_update': 100           // ms - Normal priority
};

console.log('🚀 ENHANCED REAL-TIME BROADCASTING PERFORMANCE TEST');
console.log('==================================================');
console.log(`Duration: ${TEST_DURATION / 1000}s`);
console.log(`WebSocket URL: ${WS_URL}`);
console.log(`Monitoring events: ${MONITORING_EVENTS.join(', ')}`);
console.log('');
console.log('Performance Thresholds:');
Object.entries(PERFORMANCE_THRESHOLDS).forEach(([event, threshold]) => {
  console.log(`  ${event}: <${threshold}ms`);
});
console.log('');

// Event tracking
const eventStats = new Map();
const eventTimestamps = new Map();
let totalEvents = 0;
let connectionStartTime = 0;

// Initialize event tracking
MONITORING_EVENTS.forEach(event => {
  eventStats.set(event, { count: 0, avgLatency: 0, maxLatency: 0, minLatency: Infinity });
  eventTimestamps.set(event, []);
});

// WebSocket client setup
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  connectionStartTime = Date.now();
  console.log('✅ Connected to WebSocket server');
  console.log('🎯 Starting real-time event monitoring...');
  console.log('');
  
  // Subscribe to all relevant streams
  ws.send(JSON.stringify({
    type: 'subscribe',
    streams: ['ticker_updates', 'market_updates', 'order_notifications', 'bot_updates']
  }));
});

ws.on('message', (data) => {
  const timestamp = Date.now();
  
  try {
    const message = JSON.parse(data.toString());
    const eventType = message.type;
    
    if (MONITORING_EVENTS.includes(eventType)) {
      totalEvents++;
      
      // Calculate latency (if timestamp is provided in the message)
      let latency = 0;
      if (message.timestamp || message.data?.timestamp) {
        const messageTimestamp = new Date(message.timestamp || message.data.timestamp).getTime();
        latency = timestamp - messageTimestamp;
      }
      
      // Update statistics
      const stats = eventStats.get(eventType);
      stats.count++;
      if (latency > 0) {
        stats.maxLatency = Math.max(stats.maxLatency, latency);
        stats.minLatency = Math.min(stats.minLatency, latency);
        stats.avgLatency = ((stats.avgLatency * (stats.count - 1)) + latency) / stats.count;
      }
      
      // Store timestamp for frequency analysis
      eventTimestamps.get(eventType).push(timestamp);
        // Real-time logging with performance assessment
      const isHighLatency = latency > PERFORMANCE_THRESHOLDS[eventType];
      const latencyStatus = isHighLatency ? '🔴' : latency > (PERFORMANCE_THRESHOLDS[eventType] / 2) ? '🟡' : '🟢';
      
      console.log(`📡 ${latencyStatus} [${eventType}] ${latency > 0 ? `(${latency}ms)` : ''} ${message.data?.symbol || message.data?.botId || 'N/A'}`);
      
      // Special handling for critical events
      if (eventType === 'order_fill_notification') {
        console.log(`  🎯 Order Fill: ${message.data.symbol} ${message.data.side} ${message.data.quantity} @ ${message.data.price}`);
        console.log(`  🤖 Bot ID: ${message.data.botId}, Order Type: ${message.data.orderType}`);
        if (isHighLatency) {
          console.log(`  ⚠️  CRITICAL LATENCY ALERT: ${latency}ms > ${PERFORMANCE_THRESHOLDS[eventType]}ms threshold`);
        }
      } else if (eventType === 'bot_status_update') {
        console.log(`  🤖 Bot Status: ${message.data.name} → ${message.data.status}`);
        if (isHighLatency) {
          console.log(`  ⚠️  HIGH LATENCY: ${latency}ms for bot status update`);
        }
      } else if (eventType === 'bot_cycle_update') {
        console.log(`  🔄 Cycle Update: Bot ${message.data.botId} Cycle ${message.data.cycleNumber}`);
        if (isHighLatency) {
          console.log(`  ⚠️  HIGH LATENCY: ${latency}ms for cycle update`);
        }
      } else if (eventType === 'ticker_update') {
        console.log(`  📈 Ticker: ${message.data.symbol} ${message.data.price}`);
      }
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

// Test timeout and results
setTimeout(() => {
  console.log('');
  console.log('📊 REAL-TIME BROADCASTING TEST RESULTS');
  console.log('======================================');
  
  const testDuration = Date.now() - connectionStartTime;
  console.log(`Test Duration: ${testDuration}ms`);
  console.log(`Total Events Received: ${totalEvents}`);
  console.log(`Events per second: ${(totalEvents / (testDuration / 1000)).toFixed(2)}`);
  console.log('');
  
  // Event-specific statistics
  console.log('Event Statistics:');
  console.log('-----------------');
  
  MONITORING_EVENTS.forEach(eventType => {
    const stats = eventStats.get(eventType);
    const timestamps = eventTimestamps.get(eventType);
    
    if (stats.count > 0) {
      console.log(`${eventType}:`);
      console.log(`  Count: ${stats.count}`);
      console.log(`  Frequency: ${(stats.count / (testDuration / 1000)).toFixed(2)}/s`);
      
      if (stats.avgLatency > 0) {
        console.log(`  Avg Latency: ${stats.avgLatency.toFixed(2)}ms`);
        console.log(`  Max Latency: ${stats.maxLatency}ms`);
        console.log(`  Min Latency: ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency + 'ms'}`);
        
        // Latency assessment
        if (stats.avgLatency > 500) {
          console.log(`  🔴 HIGH AVERAGE LATENCY WARNING`);
        } else if (stats.avgLatency > 100) {
          console.log(`  🟡 MODERATE LATENCY`);
        } else {
          console.log(`  🟢 LOW LATENCY`);
        }
      }
      
      console.log('');
    } else {
      console.log(`${eventType}: NO EVENTS RECEIVED ❌`);
    }
  });
    // Critical analysis with enhanced performance assessment
  console.log('Critical Performance Analysis:');
  console.log('------------------------------');
  
  let criticalIssues = 0;
  let warnings = 0;
  
  MONITORING_EVENTS.forEach(eventType => {
    const stats = eventStats.get(eventType);
    const threshold = PERFORMANCE_THRESHOLDS[eventType];
    
    if (stats.count > 0) {
      if (stats.avgLatency > threshold) {
        criticalIssues++;
        console.log(`🔴 CRITICAL: ${eventType} avg latency ${stats.avgLatency.toFixed(2)}ms > ${threshold}ms threshold`);
      } else if (stats.avgLatency > threshold / 2) {
        warnings++;
        console.log(`🟡 WARNING: ${eventType} avg latency ${stats.avgLatency.toFixed(2)}ms approaching ${threshold}ms threshold`);
      } else {
        console.log(`🟢 EXCELLENT: ${eventType} avg latency ${stats.avgLatency.toFixed(2)}ms well below ${threshold}ms threshold`);
      }
      
      // Check for consistency
      if (stats.maxLatency > threshold * 2) {
        console.log(`  📊 CONSISTENCY WARNING: Max latency ${stats.maxLatency}ms is very high`);
      }
    } else {
      console.log(`❌ NO DATA: ${eventType} - No events received during test`);
    }
  });
  
  console.log('');
  console.log(`Performance Summary: ${criticalIssues} critical issues, ${warnings} warnings`);
  
  const orderFillStats = eventStats.get('order_fill_notification');
  const botUpdateStats = eventStats.get('bot_status_update');
  const tickerUpdateStats = eventStats.get('ticker_update');
  const cycleUpdateStats = eventStats.get('bot_cycle_update');
  
  if (orderFillStats.count === 0) {
    console.log('⚠️  NO ORDER FILLS DETECTED - Consider:');
    console.log('   - Testing with active trading bots');
    console.log('   - Triggering manual test orders');
    console.log('   - Verifying order fill broadcasting implementation');
  } else if (orderFillStats.avgLatency > PERFORMANCE_THRESHOLDS['order_fill_notification']) {
    console.log('🔴 ORDER FILL LATENCY TOO HIGH - Martingale strategy performance will be impacted');
    console.log('   - Consider using ultra-fast broadcasting for order fills');
    console.log('   - Review database update performance');
    console.log('   - Check WebSocket send parallelization');
  }
  
  if (cycleUpdateStats.count > 0 && cycleUpdateStats.avgLatency > PERFORMANCE_THRESHOLDS['bot_cycle_update']) {
    console.log('⚠️  CYCLE UPDATE LATENCY HIGH - Bot monitoring may be delayed');
  }
  
  if (tickerUpdateStats.count === 0) {
    console.log('⚠️  NO TICKER UPDATES - Market data streaming may not be working');
  } else if (tickerUpdateStats.avgLatency > PERFORMANCE_THRESHOLDS['ticker_update']) {
    console.log('🟡 TICKER UPDATE LATENCY HIGH - Consider batching optimizations');
  }
    // Enhanced recommendations based on performance results
  console.log('');
  console.log('Performance Optimization Recommendations:');
  console.log('-----------------------------------------');
  
  const highLatencyEvents = Array.from(eventStats.entries())
    .filter(([eventType, stats]) => stats.avgLatency > PERFORMANCE_THRESHOLDS[eventType] && stats.count > 0)
    .map(([eventType, _]) => eventType);
  
  if (highLatencyEvents.length > 0) {
    console.log(`🔧 IMMEDIATE OPTIMIZATIONS NEEDED FOR: ${highLatencyEvents.join(', ')}`);
    
    if (highLatencyEvents.includes('order_fill_notification')) {
      console.log('   🚨 CRITICAL: Implement ultra-fast broadcasting for order fills');
      console.log('   🚨 CRITICAL: Use immediate send bypassing all queues');
      console.log('   🚨 CRITICAL: Optimize database update timing');
    }
    
    if (highLatencyEvents.includes('bot_status_update') || highLatencyEvents.includes('bot_cycle_update')) {
      console.log('   ⚡ HIGH PRIORITY: Use immediate send for bot status/cycle updates');
      console.log('   ⚡ HIGH PRIORITY: Reduce queue processing interval to 1-2ms');
    }
    
    console.log('   📊 GENERAL: Use Promise.all() for parallel WebSocket sends');
    console.log('   📊 GENERAL: Implement connection pooling by message priority');
  } else {
    console.log('🎉 EXCELLENT PERFORMANCE: All events meet latency thresholds!');
  }
  
  const missingEvents = Array.from(eventStats.entries())
    .filter(([_, stats]) => stats.count === 0)
    .map(([eventType, _]) => eventType);
  
  if (missingEvents.length > 0) {
    console.log(`🔧 MISSING EVENTS TO INVESTIGATE: ${missingEvents.join(', ')}`);
    console.log('   📋 Verify event broadcasting is implemented for all event types');
    console.log('   📋 Check if events are being triggered during normal operations');
    console.log('   📋 Review frontend subscription and hook implementations');
  }
  
  // Martingale-specific recommendations
  if (orderFillStats.count > 0) {
    console.log('');
    console.log('🎯 MARTINGALE STRATEGY SPECIFIC RECOMMENDATIONS:');
    if (orderFillStats.avgLatency <= 5) {
      console.log('   ✅ EXCELLENT: Order fill latency optimal for high-frequency martingale');
    } else if (orderFillStats.avgLatency <= 10) {
      console.log('   ✅ GOOD: Order fill latency acceptable for martingale strategies');
    } else {
      console.log('   ⚠️  SUBOPTIMAL: Consider implementing dedicated martingale event stream');
      console.log('   ⚠️  SUBOPTIMAL: Order fill delays may impact safety order timing');
    }
  }
  
  console.log('');
  console.log('🔬 NEXT STEPS:');
  console.log('   1. Run this test during active trading periods');
  console.log('   2. Monitor performance under high bot activity');
  console.log('   3. Test with multiple concurrent WebSocket connections');
  console.log('   4. Implement real-time performance monitoring dashboard');
  
  ws.close();
  process.exit(0);
}, TEST_DURATION);

// Simulate some test scenarios if needed
setTimeout(() => {
  console.log('');
  console.log('🧪 Running test scenarios...');
  
  // You could add test order placements or bot status changes here
  // For now, we'll just monitor existing activity
  
}, 5000);
