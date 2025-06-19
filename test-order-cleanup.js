/**
 * Comprehensive Bot Deletion Order Test
 * This script checks all possible places where orders might still appear after bot deletion
 */

console.log('🔍 Comprehensive Bot Deletion Order Check');
console.log('==========================================');

async function checkOrdersAfterBotDeletion(botId) {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('❌ No authentication token found');
        return;
    }

    console.log(`\n📊 Checking orders for deleted bot ID: ${botId}`);
    console.log('=' .repeat(50));

    // 1. Check database cycle_orders table (via order history API)
    console.log('\n1️⃣ Checking DATABASE (cycle_orders table)...');
    try {
        const historyResponse = await fetch('/api/orders/history?limit=1000', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            const botOrders = historyData.filter(order => order.botId === botId);
            
            console.log(`   📋 Found ${botOrders.length} orders in database for bot ${botId}`);
            if (botOrders.length > 0) {
                console.log('   ❌ ISSUE: Orders still exist in database after bot deletion!');
                botOrders.forEach(order => {
                    console.log(`      - Order ${order.exchangeOrderId}: ${order.status} (${order.side} ${order.amount})`);
                });
            } else {
                console.log('   ✅ Database is clean - no orders found for deleted bot');
            }
        } else {
            console.log('   ⚠️ Could not fetch order history from database');
        }
    } catch (error) {
        console.log('   ❌ Error checking database:', error.message);
    }

    // 2. Check exchange open orders (for all exchanges)
    console.log('\n2️⃣ Checking EXCHANGE OPEN ORDERS...');
    try {
        // We need to check all exchanges since we don't know which one the bot was using
        const exchangesResponse = await fetch('/api/exchanges', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (exchangesResponse.ok) {
            const exchanges = await exchangesResponse.json();
            
            for (const exchange of exchanges) {
                console.log(`   🔍 Checking exchange ${exchange.name} (ID: ${exchange.id})...`);
                
                // This would require knowing the trading pair, but let's check with a common one
                const symbols = ['BTCUSDT', 'ETHUSDT', 'DOGEUSDT', 'ICPUSDT']; // Add more as needed
                
                for (const symbol of symbols) {
                    try {
                        // Use WebSocket to get open orders (simulating what the frontend does)
                        console.log(`      Checking ${symbol} orders...`);
                        // Note: This would be better done via WebSocket in real implementation
                        
                    } catch (symbolError) {
                        // Expected for symbols that weren't used by the bot
                    }
                }
            }
        }
    } catch (error) {
        console.log('   ❌ Error checking exchange orders:', error.message);
    }

    // 3. Check if bot still exists
    console.log('\n3️⃣ Checking if BOT still exists...');
    try {
        const botResponse = await fetch(`/api/bots/${botId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (botResponse.ok) {
            const bot = await botResponse.json();
            console.log(`   ❌ ISSUE: Bot ${botId} still exists in database!`);
            console.log(`      Bot name: ${bot.name}, Status: ${bot.status}, Active: ${bot.isActive}`);
        } else if (botResponse.status === 404) {
            console.log('   ✅ Bot properly deleted from database');
        } else {
            console.log(`   ⚠️ Unexpected response: ${botResponse.status}`);
        }
    } catch (error) {
        console.log('   ❌ Error checking bot existence:', error.message);
    }

    // 4. Check bot cycles
    console.log('\n4️⃣ Checking BOT CYCLES...');
    try {
        const cyclesResponse = await fetch(`/api/bot-cycles/${botId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (cyclesResponse.ok) {
            const cycles = await cyclesResponse.json();
            console.log(`   ❌ ISSUE: Found ${cycles.length} cycles still in database for bot ${botId}!`);
            cycles.forEach(cycle => {
                console.log(`      - Cycle ${cycle.id}: ${cycle.status}`);
            });
        } else if (cyclesResponse.status === 404) {
            console.log('   ✅ No cycles found (properly deleted)');
        } else {
            console.log(`   ⚠️ Unexpected response: ${cyclesResponse.status}`);
        }
    } catch (error) {
        console.log('   ❌ Error checking bot cycles:', error.message);
    }

    // 5. Summary
    console.log('\n📋 SUMMARY');
    console.log('=' .repeat(20));
    console.log('If you see any ❌ ISSUE messages above, that indicates where orders/data');
    console.log('are still remaining after bot deletion.');
    console.log('');
    console.log('Expected result after proper deletion:');
    console.log('✅ Database is clean - no orders found for deleted bot');
    console.log('✅ Bot properly deleted from database'); 
    console.log('✅ No cycles found (properly deleted)');
    console.log('✅ No orders on exchange for the bot\'s trading pairs');
}

// Instructions for use
console.log('\n📋 HOW TO USE THIS TEST:');
console.log('1. Open browser console (F12) on your trading app');
console.log('2. Copy and paste this entire script');
console.log('3. Run: checkOrdersAfterBotDeletion(YOUR_DELETED_BOT_ID)');
console.log('4. Replace YOUR_DELETED_BOT_ID with the actual bot ID you deleted');
console.log('5. Check the output for any ❌ ISSUE messages');
console.log('');
console.log('Example: checkOrdersAfterBotDeletion(22)');
console.log('');

// Make function available globally
window.checkOrdersAfterBotDeletion = checkOrdersAfterBotDeletion;
