import { Router } from 'express';
import { getGlobalWebSocketService } from '../websocket/websocket-service';
import { storage } from '../storage';

const router = Router();

// Test endpoint to trigger broadcasting events
router.post('/test-broadcasting', async (req, res) => {
  try {
    const wsService = getGlobalWebSocketService();
    if (!wsService) {
      return res.status(500).json({ error: 'WebSocket service not available' });
    }

    console.log('🧪 [TEST] Manual broadcasting test triggered');    // Get existing bots for testing
    const bots = await storage.getTradingBotsByUserId(1);
    
    if (bots.length === 0) {
      return res.status(404).json({ error: 'No bots found for testing' });
    }

    const testBot = bots[0];
    console.log(`🤖 [TEST] Using bot: ${testBot.name} (ID: ${testBot.id})`);

    // Test 1: Bot Status Update
    console.log('🧪 [TEST] Broadcasting bot status update...');
    wsService.broadcastBotStatusUpdate({
      id: testBot.id,
      status: testBot.isActive ? 'active' : 'inactive',
      name: testBot.name,
      tradingPair: testBot.tradingPair,
      strategy: testBot.strategy,
      direction: testBot.direction
    });

    // Test 2: Bot Data Update
    console.log('🧪 [TEST] Broadcasting bot data update...');
    wsService.broadcastBotDataUpdate({
      type: 'bot_update',
      data: {
        bot: testBot,
        action: 'update'
      }
    });

    // Test 3: Mock Order Fill Notification
    console.log('🧪 [TEST] Broadcasting order fill notification...');
    wsService.broadcastOrderFillNotification({
      id: 999,
      exchangeOrderId: 'TEST_ORDER_' + Date.now(),
      botId: testBot.id,
      orderType: 'base_order',
      symbol: testBot.tradingPair,
      side: 'BUY',
      quantity: '0.01',
      price: '50.00',
      status: 'filled'
    });

    // Test 4: Mock Cycle Update
    console.log('🧪 [TEST] Broadcasting cycle update...');
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
    console.log('🧪 [TEST] Broadcasting order status update...');
    wsService.broadcastOrderStatusUpdate({
      orderId: 'TEST_ORDER_' + Date.now(),
      symbol: testBot.tradingPair,
      side: 'BUY',
      type: 'LIMIT',
      quantity: '0.01',
      price: '50.00',
      status: 'FILLED',
      exchangeId: testBot.exchangeId
    });

    // Test 6: Order Update
    console.log('🧪 [TEST] Broadcasting order update...');
    wsService.broadcastOrderUpdate({
      type: 'execution_report',
      exchangeId: testBot.exchangeId,
      orderId: 'TEST_ORDER_' + Date.now(),
      symbol: testBot.tradingPair,
      side: 'BUY',
      orderType: 'LIMIT',
      quantity: '0.01',
      price: '50.00',
      executedQty: '0.01',
      status: 'FILLED',
      updateTime: Date.now(),
      isRealTimeUpdate: true
    });

    console.log('✅ [TEST] All broadcasting tests completed!');

    res.json({
      success: true,
      message: 'Broadcasting tests completed',
      testBot: {
        id: testBot.id,
        name: testBot.name,
        tradingPair: testBot.tradingPair
      },
      eventsTriggered: [
        'bot_status_update',
        'bot_data_update', 
        'order_fill_notification',
        'bot_cycle_update',
        'order_status_update',
        'order_update'
      ]
    });
  } catch (error) {
    console.error('❌ [TEST] Error during broadcasting test:', error);
    res.status(500).json({ 
      error: 'Broadcasting test failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
