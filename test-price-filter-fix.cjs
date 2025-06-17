// Test script to verify price filter compliance fixes
const { adjustPrice, adjustQuantity, ensureFilterCompliance } = require('./server/binance-filters');

function testPriceAdjustment() {
    console.log('🧪 Testing Price Filter Compliance Fixes...\n');
    
    // Test case that was failing: 5.616 with tickSize 0.001
    console.log('Test Case 1: ICPUSDT Price Filter');
    console.log('Input: price=5.616, tickSize=0.001, decimals=3');
    
    const price1 = 5.616;
    const tickSize1 = 0.001;
    const decimals1 = 3;
    
    const adjusted1 = adjustPrice(price1, tickSize1, decimals1);
    console.log(`Adjusted price: ${adjusted1}`);
    console.log(`Validation: ${adjusted1} % ${tickSize1} = ${adjusted1 % tickSize1}`);
    console.log(`Is valid: ${Math.abs(adjusted1 % tickSize1) < 0.0000001}`);
    
    // Test with ensureFilterCompliance
    const filters1 = {
        tickSize: 0.001,
        stepSize: 0.01,
        minQty: 0.1,
        priceDecimals: 3,
        qtyDecimals: 2
    };
    
    const result1 = ensureFilterCompliance(10.0, 5.616, filters1);
    console.log('Filter compliance result:', result1);
    console.log('');
    
    // Test case 2: Different precision
    console.log('Test Case 2: Different precision');
    console.log('Input: price=12.3456, tickSize=0.01, decimals=2');
    
    const price2 = 12.3456;
    const tickSize2 = 0.01;
    const decimals2 = 2;
    
    const adjusted2 = adjustPrice(price2, tickSize2, decimals2);
    console.log(`Adjusted price: ${adjusted2}`);
    console.log(`Validation: ${adjusted2} % ${tickSize2} = ${adjusted2 % tickSize2}`);
    
    const filters2 = {
        tickSize: 0.01,
        stepSize: 0.001,
        minQty: 0.01,
        priceDecimals: 2,
        qtyDecimals: 3
    };
    
    const result2 = ensureFilterCompliance(5.0, 12.3456, filters2);
    console.log('Filter compliance result:', result2);
    console.log('');
    
    // Test case 3: Edge case with very small tickSize
    console.log('Test Case 3: Small tickSize');
    console.log('Input: price=0.00012345, tickSize=0.00000001, decimals=8');
    
    const price3 = 0.00012345;
    const tickSize3 = 0.00000001;
    const decimals3 = 8;
    
    const adjusted3 = adjustPrice(price3, tickSize3, decimals3);
    console.log(`Adjusted price: ${adjusted3}`);
    
    const filters3 = {
        tickSize: 0.00000001,
        stepSize: 0.001,
        minQty: 1,
        priceDecimals: 8,
        qtyDecimals: 3
    };
    
    const result3 = ensureFilterCompliance(1000.0, 0.00012345, filters3);
    console.log('Filter compliance result:', result3);
    
    console.log('\n✅ Price filter compliance tests completed!');
}

if (require.main === module) {
    testPriceAdjustment();
}

module.exports = { testPriceAdjustment };
