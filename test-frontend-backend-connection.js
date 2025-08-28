const fetch = require('node-fetch');

async function testFrontendBackendConnection() {
  try {
    console.log('🧪 Testing frontend-backend connection...');
    
    // Test the API endpoint that the frontend would call
    const response = await fetch('http://localhost:3000/api/oddyssey/matches', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:8080'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Backend API response:', {
      success: data.success,
      matchesCount: data.data?.today?.matches?.length || 0,
      cycleId: data.meta?.cycle_id,
      message: data.message
    });
    
    if (data.data?.today?.matches?.length > 0) {
      console.log('✅ First match:', data.data.today.matches[0]);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    return false;
  }
}

// Run the test
testFrontendBackendConnection().then(success => {
  if (success) {
    console.log('🎉 Frontend-backend connection test passed!');
  } else {
    console.log('💥 Frontend-backend connection test failed!');
  }
});
