#!/usr/bin/env node

const SportMonksService = require('../services/sportmonks');
const CoinpaprikaService = require('../services/coinpaprika');
const config = require('../config');

class ManualDataFetcher {
  constructor() {
    this.sportmonksService = new SportMonksService();
    this.coinpaprikaService = new CoinpaprikaService();
  }

  async fetchFixtures() {
    console.log('⚽ Fetching 7-day fixtures from SportMonks...');
    try {
      const result = await this.sportmonksService.fetchAndSave7DayFixtures();
      console.log('✅ Fixtures fetch completed:');
      console.log(`   - Total fixtures: ${result.fixturesCount || 0}`);
      console.log(`   - Saved: ${result.savedCount || 0}`);
      console.log(`   - Updated: ${result.updatedCount || 0}`);
      console.log(`   - Errors: ${result.errors || 0}`);
      return result;
    } catch (error) {
      console.error('❌ Fixtures fetch failed:', error.message);
      throw error;
    }
  }

  async fetchCryptoPrices() {
    console.log('💰 Fetching crypto prices from CoinPaprika...');
    try {
      // Get popular coins
      const popularResponse = await this.coinpaprikaService.getPopularCoins();
      if (popularResponse.success) {
        console.log(`✅ Fetched ${popularResponse.data.length} popular coins`);
        console.log('   Top 5 coins:');
        popularResponse.data.slice(0, 5).forEach(coin => {
          console.log(`   - ${coin.symbol}: $${coin.price_usd?.toFixed(2) || 'N/A'} (${coin.percent_change_24h?.toFixed(2) || 'N/A'}%)`);
        });
        return popularResponse;
      } else {
        throw new Error(popularResponse.error);
      }
    } catch (error) {
      console.error('❌ Crypto prices fetch failed:', error.message);
      throw error;
    }
  }

  async fetchAll() {
    console.log('🚀 Starting manual data fetch...\n');
    
    try {
      // Fetch fixtures
      await this.fetchFixtures();
      console.log('');
      
      // Fetch crypto prices
      await this.fetchCryptoPrices();
      console.log('');
      
      console.log('🎉 All data fetched successfully!');
    } catch (error) {
      console.error('💥 Manual data fetch failed:', error.message);
      process.exit(1);
    }
  }

  async fetchFixturesOnly() {
    console.log('⚽ Fetching fixtures only...\n');
    await this.fetchFixtures();
  }

  async fetchCryptoOnly() {
    console.log('💰 Fetching crypto prices only...\n');
    await this.fetchCryptoPrices();
  }
}

// CLI interface
if (require.main === module) {
  const fetcher = new ManualDataFetcher();
  const args = process.argv.slice(2);
  
  if (args.includes('--fixtures-only')) {
    fetcher.fetchFixturesOnly().catch(console.error);
  } else if (args.includes('--crypto-only')) {
    fetcher.fetchCryptoOnly().catch(console.error);
  } else {
    fetcher.fetchAll().catch(console.error);
  }
}

module.exports = ManualDataFetcher;
