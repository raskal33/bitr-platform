const { ethers } = require('ethers');

// Raw input data from the transaction
const rawInput = "0x1f117f9b4c6576736b6920536f6669615f77696e7300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b900000000000000000000000000000000000000000000006c6b935b8bbd4000000000000000000000000000000000000000000000000000000000000068a75ea00000000000000000000000000000000000000000000000000000000068a77ac000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000000000000000000000000001e00000000000000000000000000000000000000000000000000000000000000220000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000008c5e5506a47b97b69c6241505e27625e8147e1f471b3c0b4d84b833c6f9e773100000000000000000000000000000000000000000000000000000000000000184575726f706120436f6e666572656e6365204c656167756500000000000000000000000000000000000000000000000000000000000000000000000000000008666f6f7462616c6c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007556e6b6e6f776e00000000000000000000000000000000000000000000000000";

console.log('🔍 Decoding Raw Input Data...\n');

// Remove the function selector (first 4 bytes)
const dataWithoutSelector = rawInput.slice(10); // Remove "0x" and first 4 bytes

console.log('Raw data without function selector:');
console.log(dataWithoutSelector);
console.log('\n' + '='.repeat(80) + '\n');

// Decode each parameter (each parameter is 32 bytes = 64 hex characters)
const parameters = [];
for (let i = 0; i < dataWithoutSelector.length; i += 64) {
  const param = dataWithoutSelector.slice(i, i + 64);
  if (param.length === 64) {
    parameters.push(param);
  }
}

console.log(`Found ${parameters.length} parameters (32 bytes each):\n`);

// Decode each parameter
parameters.forEach((param, index) => {
  console.log(`Parameter ${index + 1}:`);
  console.log(`  Hex: ${param}`);
  
  // Try to decode as different types
  try {
    // Try as string (remove padding)
    const stringValue = ethers.toUtf8String('0x' + param);
    if (stringValue && stringValue.trim() && !stringValue.includes('\u0000')) {
      console.log(`  As String: "${stringValue}"`);
    }
  } catch (e) {
    // Not a valid string
  }
  
  try {
    // Try as number
    const numberValue = ethers.getBigInt('0x' + param);
    console.log(`  As Number: ${numberValue.toString()}`);
    
    // If it's a reasonable timestamp
    if (numberValue > 1000000000 && numberValue < 2000000000) {
      const date = new Date(Number(numberValue) * 1000);
      console.log(`  As Timestamp: ${date.toISOString()}`);
    }
    
    // If it's odds (should be between 100-10000)
    if (numberValue >= 100 && numberValue <= 10000) {
      console.log(`  As Odds: ${Number(numberValue) / 100}x`);
    }
    
    // If it's a stake amount (in wei)
    if (numberValue > 0 && numberValue < ethers.parseEther('1000000')) {
      console.log(`  As Stake: ${ethers.formatEther(numberValue)} tokens`);
    }
    
    // If it's a boolean (0 or 1)
    if (numberValue === 0n || numberValue === 1n) {
      console.log(`  As Boolean: ${numberValue === 1n ? 'true' : 'false'}`);
    }
    
  } catch (e) {
    console.log(`  Error decoding: ${e.message}`);
  }
  
  console.log('');
});

console.log('='.repeat(80));
console.log('📋 Expected createPool Parameters:');
console.log('1. predictedOutcome (bytes32)');
console.log('2. odds (uint256)');
console.log('3. creatorStake (uint256)');
console.log('4. eventStartTime (uint256)');
console.log('5. eventEndTime (uint256)');
console.log('6. league (string)');
console.log('7. category (string)');
console.log('8. region (string)');
console.log('9. isPrivate (bool)');
console.log('10. maxBetPerUser (uint256)');
console.log('11. useBitr (bool)');
console.log('12. oracleType (uint8)');
console.log('13. marketId (bytes32)');

console.log('\n' + '='.repeat(80));
console.log('🔍 Analysis:');

// Check if we have the right number of parameters
if (parameters.length === 13) {
  console.log('✅ Correct number of parameters (13)');
} else {
  console.log(`❌ Wrong number of parameters: ${parameters.length} (expected 13)`);
}

// Check the predictedOutcome (parameter 1)
const predictedOutcomeHex = parameters[0];
try {
  const predictedOutcomeString = ethers.toUtf8String('0x' + predictedOutcomeHex);
  console.log(`\n🎯 Predicted Outcome: "${predictedOutcomeString}"`);
  
  // Check if it looks like it was double-hashed
  const hashOfString = ethers.keccak256(ethers.toUtf8Bytes(predictedOutcomeString));
  console.log(`   Hash of this string: ${hashOfString}`);
  console.log(`   Original parameter:  ${predictedOutcomeHex}`);
  
  if (hashOfString.slice(2) === predictedOutcomeHex) {
    console.log('   ✅ This appears to be a single hash');
  } else {
    console.log('   ❌ This might be double-hashed or corrupted');
  }
} catch (e) {
  console.log(`\n🎯 Predicted Outcome: Could not decode as string`);
}

// Check the odds (parameter 2)
const oddsHex = parameters[1];
const odds = ethers.getBigInt('0x' + oddsHex);
console.log(`\n📊 Odds: ${Number(odds) / 100}x (${odds})`);

// Check the stake (parameter 3)
const stakeHex = parameters[2];
const stake = ethers.getBigInt('0x' + stakeHex);
console.log(`\n💰 Creator Stake: ${ethers.formatEther(stake)} tokens`);

// Check timestamps (parameters 4 & 5)
const startTimeHex = parameters[3];
const endTimeHex = parameters[4];
const startTime = ethers.getBigInt('0x' + startTimeHex);
const endTime = ethers.getBigInt('0x' + endTimeHex);
console.log(`\n⏰ Event Start: ${new Date(Number(startTime) * 1000).toISOString()}`);
console.log(`⏰ Event End: ${new Date(Number(endTime) * 1000).toISOString()}`);

// Check strings (parameters 6, 7, 8)
try {
  const league = ethers.toUtf8String('0x' + parameters[5]);
  const category = ethers.toUtf8String('0x' + parameters[6]);
  const region = ethers.toUtf8String('0x' + parameters[7]);
  console.log(`\n🏆 League: "${league}"`);
  console.log(`📂 Category: "${category}"`);
  console.log(`🌍 Region: "${region}"`);
} catch (e) {
  console.log(`\n❌ Error decoding strings: ${e.message}`);
}

// Check booleans (parameters 9 & 11)
const isPrivate = ethers.getBigInt('0x' + parameters[8]);
const useBitr = ethers.getBigInt('0x' + parameters[10]);
console.log(`\n🔒 Is Private: ${isPrivate === 1n ? 'true' : 'false'}`);
console.log(`🪙 Use BITR: ${useBitr === 1n ? 'true' : 'false'}`);

// Check maxBetPerUser (parameter 10)
const maxBetHex = parameters[9];
const maxBet = ethers.getBigInt('0x' + maxBetHex);
console.log(`\n💳 Max Bet Per User: ${ethers.formatEther(maxBet)} tokens`);

// Check oracleType (parameter 12)
const oracleType = ethers.getBigInt('0x' + parameters[11]);
console.log(`\n🔮 Oracle Type: ${oracleType} (0=Guided, 1=Open)`);

// Check marketId (parameter 13)
const marketIdHex = parameters[12];
console.log(`\n🆔 Market ID: ${marketIdHex}`);
try {
  const marketIdString = ethers.toUtf8String('0x' + marketIdHex);
  console.log(`   Decoded: "${marketIdString}"`);
} catch (e) {
  console.log(`   Could not decode as string`);
}
