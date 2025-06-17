const crypto = require('crypto');

// Test Binance API credentials
async function testBinanceCredentials() {
  try {
    // You'll need to replace these with your actual credentials
    const API_KEY = 'your_binance_api_key_here';
    const SECRET_KEY = 'your_binance_secret_key_here';
    
    if (API_KEY === 'your_binance_api_key_here') {
      console.log('❌ Please update the API_KEY and SECRET_KEY in this script with your actual Binance credentials');
      return;
    }
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    // Create signature
    const signature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(queryString)
      .digest('hex');
    
    const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`;
    
    console.log('🔍 Testing Binance API credentials...');
    console.log('📡 Making request to:', url.replace(/signature=[^&]*/, 'signature=***'));
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ API request failed:');
      console.log('   Status:', response.status, response.statusText);
      console.log('   Error:', errorText);
      
      const errorData = JSON.parse(errorText);
      
      if (errorData.code === -2015) {
        console.log('\n🔧 SOLUTION SUGGESTIONS:');
        console.log('1. ✅ Verify your API key and secret are correct');
        console.log('2. ✅ Check if your IP address is whitelisted in Binance API settings');
        console.log('3. ✅ Ensure API has trading permissions enabled');
        console.log('4. ✅ Make sure you\'re using the correct API endpoint (live vs testnet)');
      }
      
      return;
    }
    
    const accountData = await response.json();
    console.log('✅ API credentials are working!');
    console.log('📊 Account data received:', {
      balances: accountData.balances?.length || 0,
      canTrade: accountData.canTrade,
      canWithdraw: accountData.canWithdraw,
      canDeposit: accountData.canDeposit
    });
    
    // Show USDT balance if available
    const usdtBalance = accountData.balances?.find(b => b.asset === 'USDT');
    if (usdtBalance) {
      console.log('💰 USDT Balance:', {
        free: usdtBalance.free,
        locked: usdtBalance.locked
      });
    }
    
  } catch (error) {
    console.error('❌ Error testing credentials:', error.message);
  }
}

// For Node.js environments that don't have fetch
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

testBinanceCredentials();
