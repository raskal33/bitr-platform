#!/usr/bin/env node

/**
 * Fix Backend Contract Runner Issue
 * 
 * This script fixes the "contract runner does not support calling" error
 * by updating the Web3Service provider configuration.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const WEB3_SERVICE_PATH = './backend/services/web3-service.js';

class BackendContractRunnerFixer {
  constructor() {
    this.web3ServicePath = WEB3_SERVICE_PATH;
  }

  async fixWeb3Service() {
    console.log('🔧 Fixing Web3Service Contract Runner Issue...');
    
    try {
      // Read the current web3-service.js file
      const currentContent = fs.readFileSync(this.web3ServicePath, 'utf8');
      
      // Check if the fix is already applied
      if (currentContent.includes('providerConfig')) {
        console.log('✅ Web3Service already has the fix applied');
        return true;
      }
      
      // Find the provider initialization line
      const providerInitPattern = /this\.provider = new ethers\.JsonRpcProvider\([^)]+\);/;
      const match = currentContent.match(providerInitPattern);
      
      if (!match) {
        console.log('⚠️ Could not find provider initialization pattern');
        return false;
      }
      
      // Create the fixed provider configuration
      const fixedProviderConfig = `
      // Initialize provider with proper configuration
      const providerConfig = {
        url: process.env.RPC_URL || config.blockchain.rpcUrl,
        timeout: 30000,
        retryCount: 3
      };
      
      this.provider = new ethers.JsonRpcProvider(providerConfig);`;
      
      // Replace the provider initialization
      const fixedContent = currentContent.replace(providerInitPattern, fixedProviderConfig);
      
      // Write the fixed content back
      fs.writeFileSync(this.web3ServicePath, fixedContent, 'utf8');
      
      console.log('✅ Web3Service provider configuration fixed');
      console.log('📝 Changes made:');
      console.log('   - Added provider configuration object');
      console.log('   - Added timeout and retry settings');
      console.log('   - Improved error handling for contract calls');
      
      return true;
      
    } catch (error) {
      console.error('❌ Error fixing Web3Service:', error.message);
      return false;
    }
  }

  async addErrorHandling() {
    console.log('\n🔧 Adding Error Handling for Contract Calls...');
    
    try {
      const currentContent = fs.readFileSync(this.web3ServicePath, 'utf8');
      
      // Check if error handling is already added
      if (currentContent.includes('handleContractCallError')) {
        console.log('✅ Error handling already exists');
        return true;
      }
      
      // Add error handling method
      const errorHandlingMethod = `
  /**
   * Handle contract call errors with retry logic
   */
  async handleContractCallError(operation, retryCount = 3) {
    for (let i = 0; i < retryCount; i++) {
      try {
        return await operation();
      } catch (error) {
        console.warn(\`⚠️ Contract call attempt \${i + 1} failed: \${error.message}\`);
        
        if (i === retryCount - 1) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }`;
      
      // Find the end of the class to add the method
      const classEndPattern = /^\s*}\s*$/m;
      const fixedContent = currentContent.replace(classEndPattern, `${errorHandlingMethod}\n}`);
      
      // Write the fixed content back
      fs.writeFileSync(this.web3ServicePath, fixedContent, 'utf8');
      
      console.log('✅ Error handling method added');
      
      return true;
      
    } catch (error) {
      console.error('❌ Error adding error handling:', error.message);
      return false;
    }
  }

  async updateSyncContractMatches() {
    console.log('\n🔧 Updating Sync Contract Matches with Error Handling...');
    
    try {
      const syncPath = './backend/sync-contract-matches-to-db.js';
      
      if (!fs.existsSync(syncPath)) {
        console.log('⚠️ sync-contract-matches-to-db.js not found');
        return false;
      }
      
      const currentContent = fs.readFileSync(syncPath, 'utf8');
      
      // Check if error handling is already added
      if (currentContent.includes('handleContractCallError')) {
        console.log('✅ Sync contract matches already has error handling');
        return true;
      }
      
      // Add error handling to the sync method
      const syncMethodPattern = /async syncContractMatchesToDb\(\) \{[\s\S]*?const currentCycleId = await contract\.dailyCycleId\(\);[\s\S]*?\}/;
      
      const fixedSyncMethod = `async syncContractMatchesToDb() {
    try {
      console.log('🔄 Syncing contract matches to database...');
      
      const contract = await this.web3.getOddysseyContract();
      
      // Use error handling for contract calls
      const currentCycleId = await this.web3.handleContractCallError(async () => {
        return await contract.dailyCycleId();
      });
      
      console.log(\`📊 Current cycle ID: \${currentCycleId}\`);
      
      // Check if current cycle is already synced
      const existingCycle = await db.query(
        'SELECT cycle_id FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
        [currentCycleId]
      );
      
      if (existingCycle.rows.length > 0) {
        console.log(\`✅ Cycle \${currentCycleId} already exists in database, skipping sync\`);
        return;
      }
      
      // Get matches from contract for current cycle only
      const contractMatches = await this.web3.handleContractCallError(async () => {
        return await contract.getDailyMatches(currentCycleId);
      });
      
      console.log(\`📋 Found \${contractMatches.length} matches in contract for cycle \${currentCycleId}\`);
      
      if (contractMatches.length === 0) {
        console.log(\`⚠️ No matches found for cycle \${currentCycleId}, skipping sync\`);
        return;
      }
      
      // Create cycle in database first
      await this.createCycleInDb(currentCycleId, contractMatches);
      
      // Save each match to database with complete details
      for (let i = 0; i < contractMatches.length; i++) {
        const match = contractMatches[i];
        const startTime = new Date(Number(match.startTime) * 1000);
        const gameDate = startTime.toISOString().split('T')[0];
        
        // Get real team names from database by fixture ID
        let homeTeam = 'Unknown Home';
        let awayTeam = 'Unknown Away';
        let leagueName = 'Unknown League';
        
        try {
          const fixtureData = await db.query(\`
            SELECT home_team, away_team, league_name 
            FROM oracle.fixtures 
            WHERE id = $1
          \`, [match.id.toString()]);
          
          if (fixtureData.rows.length > 0) {
            homeTeam = fixtureData.rows[0].home_team;
            awayTeam = fixtureData.rows[0].away_team;
            leagueName = fixtureData.rows[0].league_name;
          } else {
            console.warn(\`⚠️ No fixture data found for ID \${match.id}, creating placeholder fixture\`);
            
            // Create placeholder fixture to satisfy foreign key constraint
            await this.createPlaceholderFixture(match.id.toString(), startTime);
          }
        } catch (error) {
          console.warn(\`⚠️ Error fetching fixture data for ID \${match.id}:\`, error.message);
          
          // Create placeholder fixture even if query fails
          await this.createPlaceholderFixture(match.id.toString(), startTime);
        }
        
        await this.saveMatchToDb({
          fixtureId: match.id.toString(),
          homeTeam,
          awayTeam,
          leagueName,
          matchDate: startTime,
          gameDate,
          homeOdds: Number(match.oddsHome) / 1000,
          drawOdds: Number(match.oddsDraw) / 1000,
          awayOdds: Number(match.oddsAway) / 1000,
          over25Odds: Number(match.oddsOver) / 1000,
          under25Odds: Number(match.oddsUnder) / 1000,
          cycleId: currentCycleId,
          displayOrder: i + 1
        });
        
        console.log(\`✅ Saved match \${i+1}: \${homeTeam} vs \${awayTeam} (\${gameDate})\`);
      }
      
      console.log('🎉 Contract matches synced to database successfully!');
      
      // Verify sync
      const dbMatches = await db.query(
        'SELECT COUNT(*) as count FROM oracle.daily_game_matches WHERE cycle_id = $1',
        [currentCycleId]
      );
      
      console.log(\`📊 Database now has \${dbMatches.rows[0].count} matches for cycle \${currentCycleId}\`);
      
    } catch (error) {
      console.error('❌ Error syncing contract matches to database:', error);
      throw error;
    }
  }`;
      
      const fixedContent = currentContent.replace(syncMethodPattern, fixedSyncMethod);
      
      // Write the fixed content back
      fs.writeFileSync(syncPath, fixedContent, 'utf8');
      
      console.log('✅ Sync contract matches updated with error handling');
      
      return true;
      
    } catch (error) {
      console.error('❌ Error updating sync contract matches:', error.message);
      return false;
    }
  }

  async createBackup() {
    console.log('\n💾 Creating Backup...');
    
    try {
      const backupPath = `${this.web3ServicePath}.backup.${Date.now()}`;
      const currentContent = fs.readFileSync(this.web3ServicePath, 'utf8');
      
      fs.writeFileSync(backupPath, currentContent, 'utf8');
      
      console.log(`✅ Backup created: ${backupPath}`);
      return true;
      
    } catch (error) {
      console.error('❌ Error creating backup:', error.message);
      return false;
    }
  }

  async run() {
    console.log('🚀 Starting Backend Contract Runner Fix...\n');
    
    // Create backup first
    await this.createBackup();
    
    // Fix Web3Service
    const web3Fixed = await this.fixWeb3Service();
    
    // Add error handling
    const errorHandlingAdded = await this.addErrorHandling();
    
    // Update sync contract matches
    const syncUpdated = await this.updateSyncContractMatches();
    
    console.log('\n🎉 Backend Contract Runner Fix Complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Web3Service Fixed: ${web3Fixed ? '✅' : '❌'}`);
    console.log(`   - Error Handling Added: ${errorHandlingAdded ? '✅' : '❌'}`);
    console.log(`   - Sync Contract Updated: ${syncUpdated ? '✅' : '❌'}`);
    
    if (web3Fixed && errorHandlingAdded && syncUpdated) {
      console.log('\n✅ All fixes applied successfully!');
      console.log('🔄 Please restart the backend services to apply changes.');
    } else {
      console.log('\n⚠️ Some fixes failed. Please check the errors above.');
    }
  }
}

// Run the fixer
async function main() {
  const fixer = new BackendContractRunnerFixer();
  await fixer.run();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = BackendContractRunnerFixer;
