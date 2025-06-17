// Test script to start user data stream for a specific exchange
// This will help us verify the integration is working

const { storage } = require('./server/storage');
const { WebSocketService } = require('./server/websocket/websocket-service');

async function testUserDataStream() {
  try {
    console.log('🧪 Testing User Data Stream Integration...');
    
    // Get the first active exchange from the database
    console.log('📊 Looking for active exchanges...');
    
    // Since we don't have getAllExchanges, let's use getExchangesByUserId for testing
    // First, let's get a user
    const users = await storage.getAllUsers();
    if (users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }
    
    const user = users[0];
    console.log(`👤 Found user: ${user.username} (ID: ${user.id})`);
    
    const exchanges = await storage.getExchangesByUserId(user.id);
    if (exchanges.length === 0) {
      console.log('❌ No exchanges found for user');
      return;
    }
    
    const activeExchange = exchanges.find(e => e.isActive);
    if (!activeExchange) {
      console.log('❌ No active exchanges found');
      console.log('Available exchanges:', exchanges.map(e => `${e.name} (ID: ${e.id}, Active: ${e.isActive})`));
      return;
    }
    
    console.log(`🔗 Found active exchange: ${activeExchange.name} (ID: ${activeExchange.id})`);
    
    // Create WebSocket service instance
    const wsService = new WebSocketService();
    
    // Test starting user data stream
    console.log('🚀 Starting user data stream...');
    await wsService.startUserDataStreamForExchange(activeExchange.id);
    
    console.log('✅ User data stream started successfully!');
    console.log('🎧 Listening for order fills...');
    
    // Keep the process running for a bit to test
    setTimeout(() => {
      console.log('🔄 Test completed. To test order fills, place a test order on your exchange.');
      process.exit(0);
    }, 5000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Check if storage has getAllUsers method, if not provide alternative
async function getAllUsersWrapper() {
  try {
    // Try to get users - this might not exist, so we'll handle the error
    if (typeof storage.getAllUsers === 'function') {
      return await storage.getAllUsers();
    } else {
      console.log('📝 getAllUsers method not available, using alternative approach...');
      // Alternative: get user by ID 1 (common test user)
      const user = await storage.getUser(1);
      return user ? [user] : [];
    }
  } catch (error) {
    console.log('📝 Using alternative user lookup...');
    try {
      const user = await storage.getUser(1);
      return user ? [user] : [];
    } catch (err) {
      console.log('❌ Could not find any users');
      return [];
    }
  }
}

// Override the getAllUsers method for testing
storage.getAllUsers = getAllUsersWrapper;

// Run the test
if (require.main === module) {
  testUserDataStream();
}

module.exports = { testUserDataStream };
