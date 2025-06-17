// Standalone test for price filter compliance logic
console.log('🧪 Testing Price Filter Compliance Logic...\n');

function adjustPrice(price, tickSize, decimals) {
    // Convert to avoid floating point precision issues
    const tickSizeStr = tickSize.toString();
    const tickDecimals = tickSizeStr.includes('.') ? tickSizeStr.split('.')[1].length : 0;
    const multiplier = Math.pow(10, Math.max(decimals, tickDecimals));
    
    const priceInt = Math.round(price * multiplier);
    const tickSizeInt = Math.round(tickSize * multiplier);
    
    const adjustedInt = Math.round(priceInt / tickSizeInt) * tickSizeInt;
    const adjusted = adjustedInt / multiplier;
    
    return Math.round(adjusted * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function validatePrice(price, tickSize) {
    // New validation logic
    const remainder = Math.abs(price / tickSize - Math.round(price / tickSize));
    return remainder < 0.0000001;
}

// Test the failing case
console.log('🔍 Testing the failing case: 5.616 with tickSize 0.001');
console.log('');

const originalPrice = 5.616;
const tickSize = 0.001;
const decimals = 3;

console.log(`Original price: ${originalPrice}`);
console.log(`Tick size: ${tickSize}`);
console.log(`Decimals: ${decimals}`);
console.log('');

const adjustedPrice = adjustPrice(originalPrice, tickSize, decimals);
console.log(`Adjusted price: ${adjustedPrice}`);
console.log('');

// Test old validation method (which was failing)
const oldValidation = (adjustedPrice % tickSize) < 0.0000001;
console.log(`Old validation (${adjustedPrice} % ${tickSize}): ${adjustedPrice % tickSize}`);
console.log(`Old validation result: ${oldValidation}`);
console.log('');

// Test new validation method
const newValidation = validatePrice(adjustedPrice, tickSize);
const remainder = Math.abs(adjustedPrice / tickSize - Math.round(adjustedPrice / tickSize));
console.log(`New validation (${adjustedPrice} / ${tickSize}): ${adjustedPrice / tickSize}`);
console.log(`Rounded: ${Math.round(adjustedPrice / tickSize)}`);
console.log(`Remainder: ${remainder}`);
console.log(`New validation result: ${newValidation}`);
console.log('');

// Test several more cases
console.log('🧪 Testing additional cases:');
console.log('');

const testCases = [
    { price: 5.616, tickSize: 0.001, decimals: 3, name: 'ICPUSDT case' },
    { price: 12.345, tickSize: 0.01, decimals: 2, name: 'Standard case' },
    { price: 0.0001234, tickSize: 0.0000001, decimals: 7, name: 'High precision case' },
    { price: 100.567, tickSize: 0.1, decimals: 1, name: 'Low precision case' }
];

testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`  Input: ${testCase.price}, tickSize: ${testCase.tickSize}`);
    
    const adj = adjustPrice(testCase.price, testCase.tickSize, testCase.decimals);
    const valid = validatePrice(adj, testCase.tickSize);
    
    console.log(`  Adjusted: ${adj}`);
    console.log(`  Valid: ${valid}`);
    console.log('');
});

console.log('✅ Price filter compliance logic test completed!');
console.log('🎯 The new validation logic should fix the ICPUSDT issue.');
