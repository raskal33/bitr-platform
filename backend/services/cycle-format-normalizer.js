const { ethers } = require('ethers');

/**
 * Cycle Format Normalizer
 * Handles inconsistent cycle data formats and normalizes them to a standard format
 */
class CycleFormatNormalizer {
  constructor() {
    this.serviceName = 'CycleFormatNormalizer';
  }

  /**
   * Normalize predictions from any cycle format to standard format
   * @param {Array} predictions - Raw predictions from any cycle
   * @param {number} cycleId - Cycle ID for debugging
   * @returns {Array} Normalized predictions in standard format
   */
  normalizePredictions(predictions, cycleId) {
    if (!Array.isArray(predictions)) {
      console.warn(`⚠️ Invalid predictions format for cycle ${cycleId}:`, predictions);
      return [];
    }

    return predictions.map((prediction, index) => {
      try {
        return this.normalizeSinglePrediction(prediction, cycleId, index);
      } catch (error) {
        console.error(`❌ Error normalizing prediction ${index} in cycle ${cycleId}:`, error);
        return null;
      }
    }).filter(p => p !== null);
  }

  /**
   * Normalize a single prediction to standard format
   * Standard format: {matchId, betType, selection, selectedOdd, selectionHash}
   */
  normalizeSinglePrediction(prediction, cycleId, index) {
    let normalized = {
      matchId: null,
      betType: null,
      selection: null,
      selectedOdd: 1000,
      selectionHash: null
    };

    // Handle different prediction formats
    if (Array.isArray(prediction)) {
      // Format 1: [matchId, betType, selectionHash, odds]
      if (prediction.length >= 4) {
        normalized.matchId = prediction[0];
        normalized.betType = prediction[1];
        normalized.selectionHash = prediction[2];
        normalized.selectedOdd = prediction[3];
        normalized.selection = this.hashToSelection(prediction[2], prediction[1]);
      }
      // Format 2: [matchId, betType, selection] (older format)
      else if (prediction.length >= 3) {
        normalized.matchId = prediction[0];
        normalized.betType = prediction[1];
        normalized.selection = prediction[2];
        normalized.selectionHash = this.selectionToHash(prediction[2]);
        normalized.selectedOdd = 1000; // Default odds
      }
    } else if (typeof prediction === 'object' && prediction !== null) {
      // Format 3: Object format {matchId, betType, selection, selectedOdd}
      normalized.matchId = prediction.matchId || prediction.fixture_id;
      normalized.betType = prediction.betType || prediction.bet_type;
      normalized.selection = prediction.selection;
      normalized.selectedOdd = prediction.selectedOdd || prediction.odds || 1000;
      normalized.selectionHash = prediction.selectionHash || this.selectionToHash(prediction.selection);

      // Handle Cycle 3 special format where selection contains hash and betType is "0"/"1"
      if (prediction.selection && prediction.selection.startsWith('0x')) {
        normalized.selectionHash = prediction.selection;
        normalized.selection = this.hashToSelection(prediction.selection, prediction.betType);
      }
    }

    // Validate and clean up the normalized prediction
    return this.validateNormalizedPrediction(normalized, cycleId, index);
  }

  /**
   * Convert selection hash to readable selection
   */
  hashToSelection(hash, betType) {
    if (!hash || !hash.startsWith('0x')) {
      return hash; // Already a readable selection
    }

    // Known hash mappings from contract
    const hashMappings = {
      // Moneyline (1X2) hashes
      '0x09492a13c7e2353fdb9d678856a01eb3a777f03982867b5ce379154825ae0e62': '1', // Home win
      '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6': 'X', // Draw
      '0xad7c5bef027816a800da1736444fb58a807ef4c9603b7848673f7e3a68eb14a5': '2', // Away win
      '0x550c64a15031c3064454c19adc6243a6122c138a242eaa098da50bb114fc8d56': '2', // Alternative Away win
      
      // Over/Under hashes
      '0x09492a13c7e2353fdb9d678856a01eb3a777f03982867b5ce379154825ae0e62': 'Over', // Over (context-dependent)
      '0xe5f3458d553c578199ad9150ab9a1cce5e22e9b34834f66492b28636da59e11b': 'Under' // Under
    };

    // Try direct hash lookup first
    if (hashMappings[hash]) {
      // For ambiguous hashes, use betType to determine context
      if (hash === '0x09492a13c7e2353fdb9d678856a01eb3a777f03982867b5ce379154825ae0e62') {
        return (betType === '0' || betType === 'MONEYLINE') ? '1' : 'Over';
      }
      return hashMappings[hash];
    }

    // Try to decode common selections
    const commonSelections = ['1', '2', 'X', 'Over', 'Under', 'Yes', 'No'];
    for (const selection of commonSelections) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(selection));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return selection;
      }
    }

    console.warn(`⚠️ Unknown hash: ${hash} for betType: ${betType}`);
    return hash; // Return original hash if can't decode
  }

  /**
   * Convert readable selection to hash
   */
  selectionToHash(selection) {
    if (!selection) return null;
    
    if (selection.startsWith('0x')) {
      return selection; // Already a hash
    }

    try {
      return ethers.keccak256(ethers.toUtf8Bytes(selection));
    } catch (error) {
      console.warn(`⚠️ Could not hash selection: ${selection}`, error);
      return selection;
    }
  }

  /**
   * Validate and clean up normalized prediction
   */
  validateNormalizedPrediction(prediction, cycleId, index) {
    // Ensure matchId is a number
    if (prediction.matchId) {
      prediction.matchId = parseInt(prediction.matchId);
      if (isNaN(prediction.matchId)) {
        console.warn(`⚠️ Invalid matchId in cycle ${cycleId}, prediction ${index}`);
        return null;
      }
    } else {
      console.warn(`⚠️ Missing matchId in cycle ${cycleId}, prediction ${index}`);
      return null;
    }

    // Normalize betType
    if (prediction.betType === '0' || prediction.betType === 'MONEYLINE') {
      prediction.betType = 'MONEYLINE';
    } else if (prediction.betType === '1' || prediction.betType === 'OVERUNDER') {
      prediction.betType = 'OVERUNDER';
    }

    // Ensure selectedOdd is a number
    if (typeof prediction.selectedOdd !== 'number') {
      prediction.selectedOdd = parseInt(prediction.selectedOdd) || 1000;
    }

    // Ensure we have either selection or selectionHash
    if (!prediction.selection && !prediction.selectionHash) {
      console.warn(`⚠️ Missing selection data in cycle ${cycleId}, prediction ${index}`);
      return null;
    }

    return prediction;
  }

  /**
   * Get the current result field name for evaluation
   * Always use CURRENT (90-minute) results, not preliminary results
   */
  getResultField(betType) {
    switch (betType) {
      case 'MONEYLINE':
      case '1X2':
        return 'outcome_1x2'; // Use current outcome, not result_1x2
      case 'OVERUNDER':
      case 'OU25':
        return 'outcome_ou25'; // Use current outcome, not result_ou25
      default:
        return 'outcome_1x2'; // Default fallback
    }
  }

  /**
   * Debug cycle format - analyze and log cycle data structure
   */
  debugCycleFormat(cycleId, predictions) {
    console.log(`🔍 Debugging cycle ${cycleId} format:`);
    console.log(`  Total predictions: ${predictions?.length || 0}`);
    
    if (predictions && predictions.length > 0) {
      const firstPred = predictions[0];
      console.log(`  First prediction type: ${Array.isArray(firstPred) ? 'Array' : typeof firstPred}`);
      console.log(`  First prediction structure:`, firstPred);
      
      if (Array.isArray(firstPred)) {
        console.log(`  Array length: ${firstPred.length}`);
        console.log(`  Array format: [${firstPred.map((item, i) => `${i}: ${typeof item}`).join(', ')}]`);
      } else if (typeof firstPred === 'object') {
        console.log(`  Object keys: [${Object.keys(firstPred).join(', ')}]`);
      }
    }
  }
}

module.exports = CycleFormatNormalizer;
