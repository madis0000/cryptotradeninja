/**
 * Enhanced Bot Deletion Test Script
 * Tests the comprehensive bot deletion with proper order cancellation
 */

console.log('🔧 Enhanced Bot Deletion Test Script');
console.log('====================================');

// Test function to verify bot deletion works properly
async function testBotDeletionProcess(botId) {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('❌ No authentication token found');
        return;
    }

    console.log(`\n🧪 Testing bot deletion process for bot ${botId}`);
    console.log('=' .repeat(60));

    // Step 1: Check bot and orders BEFORE deletion
    console.log('\n📊 STEP 1: Pre-deletion state check');
    console.log('-'.repeat(40));
    
    try {
        // Get bot info
        const botResponse = await fetch(`/api/bots/${botId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!botResponse.ok) {
            console.log(`❌ Bot ${botId} not found or error: ${botResponse.status}`);
            return;
        }
        
        const bot = await botResponse.json();
        console.log(`✅ Bot found: ${bot.name} (${bot.tradingPair}) - Status: ${bot.status}, Active: ${bot.isActive}`);
        
        // Get orders
        const ordersResponse = await fetch('/api/orders/history?limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (ordersResponse.ok) {
            const allOrders = await ordersResponse.json();
            const botOrders = allOrders.filter(order => order.botId === botId);
            console.log(`📋 Found ${botOrders.length} orders in database for bot ${botId}`);
            
            if (botOrders.length > 0) {
                console.log('   Orders by status:');
                const statusCounts = {};
                botOrders.forEach(order => {
                    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
                });
                Object.entries(statusCounts).forEach(([status, count]) => {
                    console.log(`   - ${status}: ${count} orders`);
                });
            }
        }
        
    } catch (error) {
        console.log('❌ Error in pre-deletion check:', error.message);
        return;
    }

    // Step 2: Delete the bot
    console.log('\n🗑️ STEP 2: Deleting bot');
    console.log('-'.repeat(40));
    
    try {
        const deleteResponse = await fetch(`/api/bots/${botId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json();
            console.log(`❌ Delete failed: ${deleteResponse.status} - ${errorData.error}`);
            return;
        }
        
        const deleteResult = await deleteResponse.json();
        console.log('✅ Bot deletion completed:');
        console.log(`   - Cancelled orders: ${deleteResult.cancelledOrders}`);
        console.log(`   - Position liquidated: ${deleteResult.liquidated}`);
        console.log(`   - Deleted data: ${JSON.stringify(deleteResult.deletedData)}`);
        
    } catch (error) {
        console.log('❌ Error during deletion:', error.message);
        return;
    }

    // Step 3: Verify deletion (wait a moment for cleanup)
    console.log('\n✅ STEP 3: Post-deletion verification');
    console.log('-'.repeat(40));
    
    setTimeout(async () => {
        try {
            // Check if bot still exists
            const botCheckResponse = await fetch(`/api/bots/${botId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (botCheckResponse.status === 404) {
                console.log('✅ Bot properly deleted from database');
            } else if (botCheckResponse.ok) {
                console.log('❌ ISSUE: Bot still exists in database!');
                const stillExistingBot = await botCheckResponse.json();
                console.log(`   Bot status: ${stillExistingBot.status}, Active: ${stillExistingBot.isActive}`);
            }
            
            // Check remaining orders
            const ordersCheckResponse = await fetch('/api/orders/history?limit=1000', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (ordersCheckResponse.ok) {
                const allOrdersAfter = await ordersCheckResponse.json();
                const remainingBotOrders = allOrdersAfter.filter(order => order.botId === botId);
                
                if (remainingBotOrders.length === 0) {
                    console.log('✅ All orders properly deleted from database');
                } else {
                    console.log(`❌ ISSUE: ${remainingBotOrders.length} orders still exist in database!`);
                    remainingBotOrders.forEach(order => {
                        console.log(`   - Order ${order.exchangeOrderId}: ${order.status} (${order.side} ${order.amount})`);
                    });
                }
            }
            
            // Check cycles
            const cyclesCheckResponse = await fetch(`/api/bot-cycles/${botId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (cyclesCheckResponse.status === 404) {
                console.log('✅ All cycles properly deleted');
            } else if (cyclesCheckResponse.ok) {
                const remainingCycles = await cyclesCheckResponse.json();
                console.log(`❌ ISSUE: ${remainingCycles.length} cycles still exist!`);
            }
            
            console.log('\n🎯 FINAL RESULT:');
            console.log('================');
            console.log('If you see all ✅ messages above, the bot deletion worked correctly.');
            console.log('If you see any ❌ ISSUE messages, there are still problems to fix.');
            
        } catch (error) {
            console.log('❌ Error in post-deletion verification:', error.message);
        }
    }, 2000); // Wait 2 seconds for cleanup to complete
}

// Instructions
console.log('\n📋 HOW TO USE:');
console.log('==============');
console.log('1. Open browser console (F12) on your trading app');
console.log('2. Copy and paste this script');
console.log('3. Run: testBotDeletionProcess(YOUR_BOT_ID)');
console.log('4. Wait for all steps to complete');
console.log('5. Check the final result');
console.log('');
console.log('Example: testBotDeletionProcess(22)');

// Make function available globally
window.testBotDeletionProcess = testBotDeletionProcess;
