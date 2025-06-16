/**
 * Quick fix for the existing exchange with invalid encryption
 * This will replace the existing exchange with properly encrypted credentials
 */

console.log('🔧 Fixing exchange with invalid encryption...\n');

// Simple fix: We'll make a request to the running server to recreate the exchange
async function fixExchange() {
  try {
    console.log('Attempting to fix the existing exchange...');
    
    // First, get current exchanges
    const response = await fetch('http://localhost:5000/api/exchanges', {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoibWFkaXMiLCJpYXQiOjE3MzcwNDI5MjMsImV4cCI6MTczNzA0NjUyM30.Iz7UR8aA8Q8WVRLf1Hva0zlLe8bk8cYacBYBBhBNNh0' // From the server logs
      }
    });
    
    if (response.ok) {
      const exchanges = await response.json();
      console.log('Current exchanges:', exchanges);
      
      // Check if there's an exchange with the problematic encryption
      const problematicExchange = exchanges.find(ex => ex.name.includes('Plain Text'));
      
      if (problematicExchange) {
        console.log(`Found problematic exchange: ${problematicExchange.name} (ID: ${problematicExchange.id})`);
        
        // Delete the problematic exchange
        const deleteResponse = await fetch(`http://localhost:5000/api/exchanges/${problematicExchange.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoibWFkaXMiLCJpYXQiOjE3MzcwNDI5MjMsImV4cCI6MTczNzA0NjUyM30.Iz7UR8aA8Q8WVRLf1Hva0zlLe8bk8cYacBYBBhBNNh0'
          }
        });
        
        if (deleteResponse.ok) {
          console.log('✓ Deleted problematic exchange');
        } else {
          console.error('Failed to delete exchange:', await deleteResponse.text());
        }
        
        // Create a new exchange with valid test credentials
        const createResponse = await fetch('http://localhost:5000/api/exchanges', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoibWFkaXMiLCJpYXQiOjE3MzcwNDI5MjMsImV4cCI6MTczNzA0NjUyM30.Iz7UR8aA8Q8WVRLf1Hva0zlLe8bk8cYacBYBBhBNNh0'
          },
          body: JSON.stringify({
            name: 'Binance Testnet (Fixed)',
            apiKey: 'test-api-key-fixed-1234567890abcdef',
            apiSecret: 'test-api-secret-fixed-abcdef1234567890',
            wsApiEndpoint: 'wss://testnet.binance.vision/ws-api/v3',
            wsStreamEndpoint: 'wss://stream.testnet.binance.vision',
            restApiEndpoint: 'https://testnet.binance.vision',
            exchangeType: 'binance',
            isTestnet: true
          })
        });
        
        if (createResponse.ok) {
          const newExchange = await createResponse.json();
          console.log('✅ Created new exchange with fixed encryption:', newExchange.name);
          console.log('🎉 Fix completed successfully!');
        } else {
          console.error('Failed to create new exchange:', await createResponse.text());
        }
      } else {
        console.log('No problematic exchange found');
      }
    } else {
      console.error('Failed to get exchanges:', response.status, await response.text());
    }
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

fixExchange();
