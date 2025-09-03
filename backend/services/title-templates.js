/**
 * Title Templates Service
 * Generates user-friendly titles for all market types
 */

class TitleTemplatesService {
  /**
   * Generate title for any market type
   */
  generateTitle(marketType, homeTeam, awayTeam, predictedOutcome, league = null) {
    if (!homeTeam || !awayTeam) {
      return predictedOutcome || `Prediction`;
    }

    const templates = {
      // Moneyline markets (1X2)
      '1X2': {
        'Home wins': `Will ${homeTeam} beat ${awayTeam}?`,
        'Away wins': `Will ${awayTeam} beat ${homeTeam}?`,
        'Draw': `Will ${homeTeam} vs ${awayTeam} end in a draw?`,
        '1': `Will ${homeTeam} beat ${awayTeam}?`,
        '2': `Will ${awayTeam} beat ${homeTeam}?`,
        'X': `Will ${homeTeam} vs ${awayTeam} end in a draw?`
      },

      // Over/Under markets
      'OU05': {
        'Over 0.5 goals': `Will ${homeTeam} vs ${awayTeam} have over 0.5 goals?`,
        'Under 0.5 goals': `Will ${homeTeam} vs ${awayTeam} have under 0.5 goals?`
      },
      'OU15': {
        'Over 1.5 goals': `Will ${homeTeam} vs ${awayTeam} have over 1.5 goals?`,
        'Under 1.5 goals': `Will ${homeTeam} vs ${awayTeam} have under 1.5 goals?`
      },
      'OU25': {
        'Over 2.5 goals': `Will ${homeTeam} vs ${awayTeam} have over 2.5 goals?`,
        'Under 2.5 goals': `Will ${homeTeam} vs ${awayTeam} have under 2.5 goals?`
      },
      'OU35': {
        'Over 3.5 goals': `Will ${homeTeam} vs ${awayTeam} have over 3.5 goals?`,
        'Under 3.5 goals': `Will ${homeTeam} vs ${awayTeam} have under 3.5 goals?`
      },

      // Both Teams To Score
      'BTTS': {
        'Both teams to score': `Will both ${homeTeam} and ${awayTeam} score?`,
        'Not both teams to score': `Will both ${homeTeam} and ${awayTeam} NOT score?`,
        'Yes': `Will both ${homeTeam} and ${awayTeam} score?`,
        'No': `Will both ${homeTeam} and ${awayTeam} NOT score?`
      },

      // Half-time markets
      'HT_1X2': {
        'Home wins at half-time': `Will ${homeTeam} be leading at half-time?`,
        'Away wins at half-time': `Will ${awayTeam} be leading at half-time?`,
        'Draw at half-time': `Will ${homeTeam} vs ${awayTeam} be tied at half-time?`
      },
      'HT_OU05': {
        'Over 0.5 goals at half-time': `Will ${homeTeam} vs ${awayTeam} have over 0.5 goals at half-time?`,
        'Under 0.5 goals at half-time': `Will ${homeTeam} vs ${awayTeam} have under 0.5 goals at half-time?`
      },
      'HT_OU15': {
        'Over 1.5 goals at half-time': `Will ${homeTeam} vs ${awayTeam} have over 1.5 goals at half-time?`,
        'Under 1.5 goals at half-time': `Will ${homeTeam} vs ${awayTeam} have under 1.5 goals at half-time?`
      },

      // Double Chance
      'DC': {
        'Home or Draw': `Will ${homeTeam} win or draw?`,
        'Away or Draw': `Will ${awayTeam} win or draw?`,
        'Home or Away': `Will ${homeTeam} or ${awayTeam} win?`
      },

      // Correct Score
      'CS': {
        '1-0': `Will ${homeTeam} vs ${awayTeam} end 1-0?`,
        '2-0': `Will ${homeTeam} vs ${awayTeam} end 2-0?`,
        '2-1': `Will ${homeTeam} vs ${awayTeam} end 2-1?`,
        '3-0': `Will ${homeTeam} vs ${awayTeam} end 3-0?`,
        '3-1': `Will ${homeTeam} vs ${awayTeam} end 3-1?`,
        '3-2': `Will ${homeTeam} vs ${awayTeam} end 3-2?`,
        '0-0': `Will ${homeTeam} vs ${awayTeam} end 0-0?`,
        '1-1': `Will ${homeTeam} vs ${awayTeam} end 1-1?`,
        '2-2': `Will ${homeTeam} vs ${awayTeam} end 2-2?`,
        '0-1': `Will ${homeTeam} vs ${awayTeam} end 0-1?`,
        '0-2': `Will ${homeTeam} vs ${awayTeam} end 0-2?`,
        '1-2': `Will ${homeTeam} vs ${awayTeam} end 1-2?`,
        '0-3': `Will ${homeTeam} vs ${awayTeam} end 0-3?`,
        '1-3': `Will ${homeTeam} vs ${awayTeam} end 1-3?`,
        '2-3': `Will ${homeTeam} vs ${awayTeam} end 2-3?`
      },

      // First Goalscorer
      'FG': {
        'Home Team': `Will ${homeTeam} score first?`,
        'Away Team': `Will ${awayTeam} score first?`,
        'No Goals': `Will there be no goals in ${homeTeam} vs ${awayTeam}?`
      },

      // Half Time/Full Time
      'HTFT': {
        'Home/Home': `Will ${homeTeam} lead at half-time and win?`,
        'Home/Draw': `Will ${homeTeam} lead at half-time but draw?`,
        'Home/Away': `Will ${homeTeam} lead at half-time but lose?`,
        'Draw/Home': `Will ${homeTeam} vs ${awayTeam} be tied at half-time but ${homeTeam} win?`,
        'Draw/Draw': `Will ${homeTeam} vs ${awayTeam} be tied at half-time and full-time?`,
        'Draw/Away': `Will ${homeTeam} vs ${awayTeam} be tied at half-time but ${awayTeam} win?`,
        'Away/Home': `Will ${awayTeam} lead at half-time but lose?`,
        'Away/Draw': `Will ${awayTeam} lead at half-time but draw?`,
        'Away/Away': `Will ${awayTeam} lead at half-time and win?`
      }
    };

    // Get templates for this market type
    const marketTemplates = templates[marketType];
    if (!marketTemplates) {
      // Fallback for unknown market types
      return `Will ${homeTeam} vs ${awayTeam} be ${predictedOutcome}?`;
    }

    // Find exact match for predicted outcome
    if (marketTemplates[predictedOutcome]) {
      return marketTemplates[predictedOutcome];
    }

    // Try partial matches
    for (const [key, template] of Object.entries(marketTemplates)) {
      if (predictedOutcome.toLowerCase().includes(key.toLowerCase()) || 
          key.toLowerCase().includes(predictedOutcome.toLowerCase())) {
        return template;
      }
    }

    // Fallback template
    return `Will ${homeTeam} vs ${awayTeam} be ${predictedOutcome}?`;
  }

  /**
   * Generate short title (for mobile/compact display)
   */
  generateShortTitle(marketType, homeTeam, awayTeam, predictedOutcome) {
    if (!homeTeam || !awayTeam) {
      return predictedOutcome || `Prediction`;
    }

    const shortTemplates = {
      '1X2': {
        'Home wins': `${homeTeam} to win`,
        'Away wins': `${awayTeam} to win`,
        'Draw': `${homeTeam} vs ${awayTeam} draw`,
        '1': `${homeTeam} to win`,
        '2': `${awayTeam} to win`,
        'X': `${homeTeam} vs ${awayTeam} draw`
      },
      'OU25': {
        'Over 2.5 goals': `${homeTeam} vs ${awayTeam} over 2.5`,
        'Under 2.5 goals': `${homeTeam} vs ${awayTeam} under 2.5`
      },
      'BTTS': {
        'Both teams to score': `${homeTeam} vs ${awayTeam} both score`,
        'Not both teams to score': `${homeTeam} vs ${awayTeam} not both score`
      }
    };

    const marketTemplates = shortTemplates[marketType];
    if (marketTemplates && marketTemplates[predictedOutcome]) {
      return marketTemplates[predictedOutcome];
    }

    return `${homeTeam} vs ${awayTeam} ${predictedOutcome}`;
  }

  /**
   * Generate description for market type
   */
  generateDescription(marketType, homeTeam, awayTeam, league = null) {
    const descriptions = {
      '1X2': `Match winner after 90 minutes`,
      'OU25': `Total goals scored in the match`,
      'OU35': `Total goals scored in the match`,
      'BTTS': `Both teams score at least one goal`,
      'HT_1X2': `Leading team at half-time`,
      'HT_OU15': `Goals scored in first half`,
      'DC': `Two possible outcomes combined`,
      'CS': `Exact final score`,
      'FG': `First team to score`,
      'HTFT': `Half-time and full-time result combination`
    };

    const baseDescription = descriptions[marketType] || `Prediction market`;
    
    if (league) {
      return `${baseDescription} - ${league}`;
    }
    
    return baseDescription;
  }

  /**
   * Generate market type display name
   */
  getMarketTypeDisplayName(marketType) {
    const displayNames = {
      '1X2': 'Match Result',
      'OU25': 'Over/Under 2.5 Goals',
      'OU35': 'Over/Under 3.5 Goals',
      'BTTS': 'Both Teams To Score',
      'HT_1X2': 'Half-Time Result',
      'HT_OU15': 'Half-Time Over/Under 1.5',
      'DC': 'Double Chance',
      'CS': 'Correct Score',
      'FG': 'First Goalscorer',
      'HTFT': 'Half-Time/Full-Time'
    };

    return displayNames[marketType] || marketType;
  }
}

module.exports = TitleTemplatesService;
