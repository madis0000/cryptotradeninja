import { getGlobalWebSocketService } from './server/websocket/websocket-service.js';
import { storage } from './server/storage.js';

console.log('🧪 BOT BROADCASTING TEST');
console.log('=======================');

async function testBotBroadcasting() {
  const wsService = getGlobalWebSocketService();
  if (!wsService) {
    console.log('❌ WebSocket service not available');
    return;
  }

  console.log('✅ WebSocket service found');

  try {
    // Get existing bots
    const bots = await storage.getBotsByUserId(1);
    console.log(`📊 Found ${bots.length} bots`);

    if (bots.length === 0) {
      console.log('⚠️  No bots found to test with');
      return;
    }

    const testBot = bots[0];
    console.log(`🤖 Testing with bot: ${testBot.name} (ID: ${testBot.id})`);

    // Test 1: Bot Status Update
    console.log('\n🧪 Test 1: Broadcasting bot status update...');
    wsService.broadcastBotStatusUpdate({
      id: testBot.id,
      status: testBot.isActive ? 'active' : 'inactive',
      name: testBot.name,
      tradingPair: testBot.tradingPair,
      strategy: testBot.strategy,
      direction: testBot.direction
    });

    // Test 2: Bot Data Update
    console.log('🧪 Test 2: Broadcasting bot data update...');
    wsService.broadcastBotDataUpdate({
      type: 'bot_update',
      data: {
        bot: testBot,
        action: 'update'
      }
    });

    // Test 3: Mock Order Fill Notification
    console.log('🧪 Test 3: Broadcasting mock order fill notification...');
    wsService.broadcastOrderFillNotification({
      id: 999,
      exchangeOrderId: 'TEST_ORDER_123',
      botId: testBot.id,
      orderType: 'base_order',
      symbol: testBot.tradingPair,
      side: 'BUY',
      quantity: '0.01',
      price: '50.00',
      status: 'filled'
    });

    // Test 4: Mock Cycle Update
    console.log('🧪 Test 4: Broadcasting mock cycle update...');
    wsService.broadcastBotCycleUpdate({
      botId: testBot.id,
      id: 999,
      cycleNumber: 1,
      status: 'active',
      baseOrderFilled: true,
      currentPrice: 50.5,
      averagePrice: 50.0,
      totalQuantity: 0.01,
      totalCost: 50.0,
      unrealizedPnL: 0.5
    });

    // Test 5: Order Status Update
    console.log('🧪 Test 5: Broadcasting order status update...');
    wsService.broadcastOrderStatusUpdate({
      orderId: 'TEST_ORDER_123',
      symbol: testBot.tradingPair,
      side: 'BUY',
      type: 'LIMIT',
      quantity: '0.01',
      price: '50.00',
      status: 'FILLED',
      exchangeId: testBot.exchangeId
    });

    console.log('\n✅ All broadcasting tests completed!');
    console.log('📡 Check your frontend pages (my-bots, bot-details) for updates');
    console.log('🔍 Check browser console for "[BOT UPDATES]" log messages');

  } catch (error) {
    console.error('❌ Error during broadcasting test:', error);
  }
}

// Wait a moment for server to be ready, then run test
setTimeout(testBotBroadcasting, 2000);
