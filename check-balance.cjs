// Check account balance for troubleshooting
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { exchanges } = require('./shared/schema.ts');
const { decryptApiCredentials } = require('./server/encryption');
const crypto = require('crypto');

const connectionString = 'postgresql://postgres:Dek.09041976@localhost:5432/cryptotradeninja';

async function checkBalance() {
    console.log('💰 Checking Account Balance...\n');
    
    try {
        const sql = postgres(connectionString);
        const db = drizzle(sql);
        
        // Get active exchanges
        const activeExchanges = await db.select().from(exchanges).where(eq(exchanges.isActive, true));
        
        if (activeExchanges.length === 0) {
            console.log('❌ No active exchanges found');
            return;
        }
        
        for (const exchange of activeExchanges) {
            console.log(`\n🔗 Checking balance for exchange: ${exchange.name} (ID: ${exchange.id})`);
            console.log(`   Type: ${exchange.exchangeType || 'Unknown'}`);
            console.log(`   Testnet: ${exchange.isTestnet || false}`);
            console.log(`   Endpoint: ${exchange.restApiEndpoint}`);
            
            try {
                // Decrypt API credentials
                const { apiKey, apiSecret } = decryptApiCredentials(
                    exchange.apiKey,
                    exchange.apiSecret,
                    exchange.encryptionIv
                );
                
                console.log(`   API Key (first 8 chars): ${apiKey.substring(0, 8)}...`);
                
                // Get balance
                const baseUrl = exchange.restApiEndpoint || (exchange.isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');
                const timestamp = Date.now();
                
                const params = new URLSearchParams({
                    timestamp: timestamp.toString()
                });
                
                const signature = crypto
                    .createHmac('sha256', apiSecret)
                    .update(params.toString())
                    .digest('hex');
                
                params.append('signature', signature);
                
                console.log(`   Making request to: ${baseUrl}/api/v3/account`);
                
                const response = await fetch(`${baseUrl}/api/v3/account?${params.toString()}`, {
                    method: 'GET',
                    headers: {
                        'X-MBX-APIKEY': apiKey,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`   ❌ API request failed: ${response.status} ${response.statusText}`);
                    console.error(`   Error: ${errorText}`);
                    continue;
                }
                
                const accountData = await response.json();
                
                // Show key balances
                const usdtBalance = accountData.balances?.find(b => b.asset === 'USDT');
                const btcBalance = accountData.balances?.find(b => b.asset === 'BTC');
                const icpBalance = accountData.balances?.find(b => b.asset === 'ICP');
                
                console.log(`   ✅ Balance retrieved successfully`);
                console.log(`   💰 USDT: ${usdtBalance ? parseFloat(usdtBalance.free).toFixed(2) : '0.00'} (Available: ${usdtBalance ? parseFloat(usdtBalance.free).toFixed(2) : '0.00'})`);
                console.log(`   💰 BTC: ${btcBalance ? parseFloat(btcBalance.free).toFixed(8) : '0.00000000'} (Available: ${btcBalance ? parseFloat(btcBalance.free).toFixed(8) : '0.00000000'})`);
                console.log(`   💰 ICP: ${icpBalance ? parseFloat(icpBalance.free).toFixed(4) : '0.0000'} (Available: ${icpBalance ? parseFloat(icpBalance.free).toFixed(4) : '0.0000'})`);
                
                // Show total number of non-zero balances
                const nonZeroBalances = accountData.balances?.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0) || [];
                console.log(`   📊 Total assets with balance: ${nonZeroBalances.length}`);
                
                if (nonZeroBalances.length > 0) {
                    console.log(`   📋 Non-zero balances:`);
                    nonZeroBalances.forEach(balance => {
                        const free = parseFloat(balance.free);
                        const locked = parseFloat(balance.locked);
                        if (free > 0 || locked > 0) {
                            console.log(`      ${balance.asset}: Free=${free.toFixed(8)}, Locked=${locked.toFixed(8)}`);
                        }
                    });
                }
                
            } catch (error) {
                console.error(`   ❌ Error checking balance: ${error.message}`);
            }
        }
        
        await sql.end();
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Import missing functions
const { eq } = require('drizzle-orm');

if (require.main === module) {
    checkBalance();
}

module.exports = { checkBalance };
