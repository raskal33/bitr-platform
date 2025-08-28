const { ethers } = require('ethers');

class ContractSlipsChecker {
  constructor() {
    this.rpcUrl = 'https://rpc.somnia.zone';
    this.oddysseyAddress = '0x9f9D719041C8F0EE708440f15AE056Cd858DCF4e';
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
  }

  async checkContractSlips() {
    console.log('🔍 Checking Contract Slips...\n');

    try {
      // Load the contract ABI (you'll need to have this)
      const abi = [
        "function getSlip(uint256 slipId) view returns (address player, uint256 cycleId, uint256 placedAt, tuple(uint256 matchId, uint8 betType, uint256 selectedOdd)[] predictions, uint256 finalScore, uint8 correctCount, bool isEvaluated)",
        "function getTotalSlipCount() view returns (uint256)",
        "function getUserSlips(address player) view returns (uint256[])",
        "function getUserSlipsForCycle(address player, uint256 cycleId) view returns (uint256[])"
      ];

      const contract = new ethers.Contract(this.oddysseyAddress, abi, this.provider);

      // Check total slip count
      console.log('📋 Check 1: Total slip count...');
      const totalSlipCount = await contract.getTotalSlipCount();
      console.log('✅ Total slip count:', totalSlipCount.toString());

      if (totalSlipCount > 0) {
        // Get the first slip
        console.log('\n📋 Check 2: Getting first slip...');
        const slip = await contract.getSlip(0);
        console.log('✅ First slip data:');
        console.log('- Player:', slip.player);
        console.log('- Cycle ID:', slip.cycleId.toString());
        console.log('- Placed At:', new Date(Number(slip.placedAt) * 1000).toLocaleString());
        console.log('- Predictions Count:', slip.predictions.length);
        console.log('- Final Score:', slip.finalScore.toString());
        console.log('- Correct Count:', slip.correctCount);
        console.log('- Is Evaluated:', slip.isEvaluated);

        // Show predictions
        console.log('\n🎯 Predictions:');
        slip.predictions.forEach((pred, index) => {
          console.log(`  ${index + 1}. Match ${pred.matchId}, Bet Type ${pred.betType}, Odds ${pred.selectedOdd}`);
        });

        // Check user slips for this player
        console.log('\n📋 Check 3: User slips for player...');
        const userSlips = await contract.getUserSlips(slip.player);
        console.log('✅ User slips for', slip.player, ':', userSlips.map(id => id.toString()));

        // Check user slips for cycle 3
        console.log('\n📋 Check 4: User slips for cycle 3...');
        const cycle3Slips = await contract.getUserSlipsForCycle(slip.player, 3);
        console.log('✅ User slips for cycle 3:', cycle3Slips.map(id => id.toString()));
      } else {
        console.log('❌ No slips found in contract');
      }

    } catch (error) {
      console.error('❌ Check failed:', error.message);
    }
  }
}

async function main() {
  const checker = new ContractSlipsChecker();
  await checker.checkContractSlips();
}

main().catch(console.error);
