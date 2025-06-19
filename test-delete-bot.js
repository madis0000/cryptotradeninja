const fs = require('fs');

console.log('🧪 Testing Bot Deletion API Endpoint');
console.log('====================================');

// Read the token from storage (simulating frontend)
const testBotId = 1; // You can change this to an actual bot ID
const token = 'your-jwt-token-here'; // You'll need to get this from browser localStorage

async function testDeleteBot() {
  console.log(`\n🔍 Testing DELETE /api/bots/${testBotId}`);
  
  try {
    const response = await fetch(`http://localhost:5000/api/bots/${testBotId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`📡 Response status: ${response.status}`);
    console.log(`📡 Response ok: ${response.ok}`);
    
    const responseText = await response.text();
    console.log(`📡 Response body: ${responseText}`);
    
    if (response.ok) {
      console.log('✅ Request successful!');
    } else {
      console.log('❌ Request failed!');
    }
    
  } catch (error) {
    console.error('💥 Network error:', error.message);
  }
}

console.log('\n⚠️  INSTRUCTIONS:');
console.log('1. Replace testBotId with an actual bot ID from your database');
console.log('2. Replace token with a real JWT token from your browser localStorage');
console.log('3. Make sure the server is running on localhost:5000');
console.log('4. Run with: node test-delete-bot.js');
console.log('\n💡 To get your token:');
console.log('   - Open browser dev tools (F12)');
console.log('   - Go to Console tab');
console.log('   - Type: localStorage.getItem("token")');
console.log('   - Copy the result (without quotes)');

// Uncomment the line below and add real values to test
// testDeleteBot();
