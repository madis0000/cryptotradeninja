/**
 * Test script to verify Binance REST API account balance fetching
 * Based on official Binance API documentation:
 * https://developers.binance.com/docs/binance-spot-api-docs/testnet/rest-api/account-endpoints
 */

const crypto = require('crypto');

// Test credentials (these would need to be real testnet credentials)
const TEST_CREDENTIALS = {
  apiKey: 'YOUR_TESTNET_API_KEY',    // Replace with real testnet API key
  apiSecret: 'YOUR_TESTNET_API_SECRET', // Replace with real testnet API secret
  baseURL: 'https://testnet.binance.vision'
};

function generateSignature(queryString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

async function testBinanceAccountEndpoint() {
  console.log('🔍 Testing Binance Account API Endpoint');
  console.log('📖 Based on: https://developers.binance.com/docs/binance-spot-api-docs/testnet/rest-api/account-endpoints');
  console.log('');
  
  // Check if we have real credentials
  if (TEST_CREDENTIALS.apiKey === 'YOUR_TESTNET_API_KEY' || 
      TEST_CREDENTIALS.apiSecret === 'YOUR_TESTNET_API_SECRET') {
    console.log('⚠️  WARNING: Using placeholder credentials');
    console.log('📝 To test with real data, you need to:');
    console.log('   1. Get Binance Testnet API credentials from: https://testnet.binance.vision/');
    console.log('   2. Replace YOUR_TESTNET_API_KEY and YOUR_TESTNET_API_SECRET in this script');
    console.log('   3. Add these credentials to your exchange configuration in the database');
    console.log('');
    console.log('🎭 Proceeding with mock example to show expected behavior...');
    console.log('');
  }

  try {
    // Build request parameters according to Binance documentation
    const timestamp = Date.now();
    const recvWindow = 60000; // 60 seconds
    
    const params = {
      timestamp: timestamp.toString(),
      recvWindow: recvWindow.toString(),
      omitZeroBalances: 'true' // Optional: only show non-zero balances
    };

    // Build query string with alphabetically sorted parameters (required for signature)
    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');

    // Generate signature
    const signature = generateSignature(queryString, TEST_CREDENTIALS.apiSecret);

    // Build final request URL
    const requestUrl = `${TEST_CREDENTIALS.baseURL}/api/v3/account?${queryString}&signature=${signature}`;

    console.log('📊 Request Details:');
    console.log(`   Base URL: ${TEST_CREDENTIALS.baseURL}`);
    console.log(`   Endpoint: /api/v3/account`);
    console.log(`   Method: GET`);
    console.log(`   Timestamp: ${timestamp}`);
    console.log(`   Recv Window: ${recvWindow}ms`);
    console.log(`   API Key: ${TEST_CREDENTIALS.apiKey.substring(0, 8)}...${TEST_CREDENTIALS.apiKey.slice(-4)}`);
    console.log(`   Signature: ${signature.substring(0, 16)}...${signature.slice(-8)}`);
    console.log('');

    // Make the request
    console.log('🚀 Making request to Binance API...');
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': TEST_CREDENTIALS.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const responseData = await response.json();

    if (response.ok) {
      console.log('✅ SUCCESS: Retrieved account data');
      console.log('📈 Account Info:');
      console.log(`   Can Trade: ${responseData.canTrade}`);
      console.log(`   Can Withdraw: ${responseData.canWithdraw}`);
      console.log(`   Can Deposit: ${responseData.canDeposit}`);
      console.log(`   Account Type: ${responseData.accountType}`);
      console.log(`   Update Time: ${new Date(responseData.updateTime)}`);
      console.log('');
      
      console.log('💰 Account Balances:');
      if (responseData.balances && responseData.balances.length > 0) {
        responseData.balances.forEach(balance => {
          const free = parseFloat(balance.free);
          const locked = parseFloat(balance.locked);
          const total = free + locked;
          
          if (total > 0) {
            console.log(`   ${balance.asset}: ${balance.free} (free) + ${balance.locked} (locked) = ${total.toFixed(8)} (total)`);
          }
        });
      } else {
        console.log('   No balances found (all zero)');
      }
      
      console.log('');
      console.log('🎉 Real balance data retrieved successfully!');
      
    } else {
      console.log('❌ ERROR: API request failed');
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Error Code: ${responseData.code}`);
      console.log(`   Error Message: ${responseData.msg}`);
      console.log('');
      
      if (responseData.code === -1022) {
        console.log('🔐 Signature Error Details:');
        console.log('   This usually means:');
        console.log('   • Invalid API secret');
        console.log('   • Incorrect timestamp (too old/new)');
        console.log('   • Wrong parameter order in signature');
        console.log('   • Invalid API key');
        console.log('');
      }
      
      console.log('🎭 Falling back to mock data (as the system would do)...');
      
      // Show what mock data would look like
      const mockData = {
        canTrade: true,
        canWithdraw: true,
        canDeposit: true,
        accountType: 'SPOT',
        balances: [
          { asset: 'USDT', free: '127247.18000000', locked: '0.00000000' },
          { asset: 'BTC', free: '0.05000000', locked: '0.00000000' },
          { asset: 'ETH', free: '2.50000000', locked: '0.00000000' },
          { asset: 'BNB', free: '10.00000000', locked: '0.00000000' }
        ]
      };
      
      console.log('📊 Mock Balance Data:');
      mockData.balances.forEach(balance => {
        console.log(`   ${balance.asset}: ${balance.free} (free) + ${balance.locked} (locked)`);
      });
    }

  } catch (error) {
    console.error('💥 Network/Connection Error:', error.message);
    console.log('');
    console.log('🎭 This would trigger fallback to mock data in the system');
  }
}

// Show the documentation requirements
function showDocumentationSummary() {
  console.log('📚 Binance Account API Requirements Summary:');
  console.log('');
  console.log('🔗 Endpoint: GET /api/v3/account');
  console.log('🔒 Security: USER_DATA (requires API key + signature)');
  console.log('⚖️  Weight: 20');
  console.log('');
  console.log('📝 Required Parameters:');
  console.log('   • timestamp (LONG, YES) - Current timestamp in milliseconds');
  console.log('');
  console.log('📝 Optional Parameters:');
  console.log('   • omitZeroBalances (BOOLEAN, NO) - When true, only shows non-zero balances');
  console.log('   • recvWindow (LONG, NO) - Request validity window (max 60000ms)');
  console.log('');
  console.log('🔐 Authentication:');
  console.log('   • X-MBX-APIKEY header with your API key');
  console.log('   • signature parameter with HMAC SHA256 signature');
  console.log('');
  console.log('💡 Response includes:');
  console.log('   • Account permissions (canTrade, canWithdraw, canDeposit)');
  console.log('   • Commission rates (maker, taker, buyer, seller)');
  console.log('   • Account type (SPOT, MARGIN, etc.)');
  console.log('   • Full balance array with asset, free, and locked amounts');
  console.log('');
  console.log('=' * 60);
  console.log('');
}

// Run the test
async function main() {
  showDocumentationSummary();
  await testBinanceAccountEndpoint();
}

main().catch(console.error);
