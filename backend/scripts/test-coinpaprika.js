#!/usr/bin/env node

const CoinpaprikaService = require('../services/coinpaprika');

async function testCoinPaprika() {
  console.log('🧪 Testing CoinPaprika API...\n');
  
  const service = new CoinpaprikaService();
  
  try {
    console.log('1. Testing getPopularCoins()...');
    const result = await service.getPopularCoins();
    console.log('✅ getPopularCoins() result:', {
      success: result.success,
      dataLength: result.data?.length || 0,
      error: result.error || 'none'
    });
    
    if (result.success && result.data?.length > 0) {
      console.log('   First 3 coins:');
      result.data.slice(0, 3).forEach(coin => {
        console.log(`   - ${coin.symbol}: $${coin.price_usd?.toFixed(2) || 'N/A'}`);
      });
    }
    
  } catch (error) {
    console.error('❌ getPopularCoins() failed:', error.message);
    console.error('   Stack:', error.stack);
  }
  
  try {
    console.log('\n2. Testing direct API call...');
    const data = await service.makeRequest('/tickers', { limit: 5, quotes: 'USD' });
    console.log('✅ Direct API call successful, got', data.length, 'coins');
    if (data.length > 0) {
      console.log('   First coin:', {
        id: data[0].id,
        symbol: data[0].symbol,
        price: data[0].quotes?.USD?.price
      });
    }
  } catch (error) {
    console.error('❌ Direct API call failed:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testCoinPaprika().catch(console.error);
