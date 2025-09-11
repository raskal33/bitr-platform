#!/usr/bin/env node

/**
 * Column Mismatch Detection Script
 * 
 * This script analyzes the codebase to find potential column naming mismatches
 * between what the code expects and what actually exists in the database.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Actual database schema (from development branch br-wild-mountain-a2wqdszo)
const ACTUAL_SCHEMA = {
  'oracle.match_results': {
    columns: ['id', 'match_id', 'home_score', 'away_score', 'ht_home_score', 'ht_away_score', 'result', 'created_at', 'updated_at', 'result_1x2', 'result_ou25', 'finished_at']
  },
  'oracle.fixture_results': {
    columns: [
      'id', 'fixture_id', 'home_score', 'away_score', 'ht_home_score', 'ht_away_score',
      'result_1x2', 'result_ou05', 'result_ou15', 'result_ou25', 'result_ou35', 'result_ou45', 'result_btts', 'result_ht',
      'result_ht_ou05', 'result_ht_ou15', 'result_ht_goals',
      'outcome_1x2', 'outcome_ou05', 'outcome_ou15', 'outcome_ou25', 'outcome_ou35', 'outcome_ht_result', 'outcome_btts',
      'full_score', 'ht_score', 'final_price', 'finished_at', 'evaluation_status', 'evaluation_timestamp',
      'evaluator', 'confidence_score', 'created_at', 'updated_at'
    ]
  },
  'oracle.fixtures': {
    columns: [
      'id', 'name', 'home_team_id', 'away_team_id', 'home_team', 'away_team', 'league_id', 'league_name',
      'season_id', 'round_id', 'round', 'match_date', 'starting_at', 'status', 'venue_id', 'state_id',
      'result_info', 'leg', 'venue', 'referee', 'league', 'season', 'stage', 'round_obj', 'state',
      'participants', 'metadata', 'referee_id', 'referee_name', 'referee_image_path', 'venue_capacity',
      'venue_coordinates', 'venue_surface', 'venue_image_path', 'home_team_image_path', 'away_team_image_path',
      'league_image_path', 'country_image_path', 'team_assignment_validated', 'odds_mapping_validated',
      'processing_errors', 'created_at', 'updated_at'
    ]
  },
  'oracle.fixture_odds': {
    columns: [
      'id', 'fixture_id', 'market_id', 'bookmaker_id', 'label', 'value', 'name', 'sort_order',
      'market_description', 'probability', 'dp3', 'fractional', 'american', 'winning', 'stopped',
      'total', 'handicap', 'participants', 'created_at', 'original_label', 'latest_bookmaker_update',
      'bookmaker', 'bookmaker_name', 'bookmaker_logo', 'updated_at'
    ]
  },
  'oracle.oddyssey_cycles': {
    columns: [
      'cycle_id', 'created_at', 'updated_at', 'matches_count', 'matches_data', 'cycle_start_time',
      'cycle_end_time', 'resolved_at', 'is_resolved', 'tx_hash', 'resolution_tx_hash', 'resolution_data',
      'ready_for_resolution', 'resolution_prepared_at', 'start_time', 'end_time', 'prize_pool',
      'evaluation_completed', 'evaluation_completed_at'
    ]
  },
  'oracle.oddyssey_slips': {
    columns: [
      'slip_id', 'player_address', 'cycle_id', 'predictions', 'is_evaluated', 'placed_at',
      'tx_hash', 'correct_count', 'created_at', 'evaluated_at', 'final_score', 'total_odds',
      'status', 'leaderboard_rank', 'prize_claimed'
    ]
  }
};

// Common problematic patterns (based on development branch schema)
const PROBLEMATIC_PATTERNS = [
  // Wrong column names in match_results - these columns now exist in dev branch!
  { pattern: /mr\.outcome_1x2/g, correct: 'mr.result_1x2', table: 'oracle.match_results' },
  { pattern: /mr\.outcome_ou25/g, correct: 'mr.result_ou25', table: 'oracle.match_results' },
  { pattern: /mr\.resolved_at/g, correct: 'mr.finished_at', table: 'oracle.match_results' },
  
  // Wrong table references
  { pattern: /oracle\.matches/g, correct: 'oracle.fixtures', table: 'oracle.matches' },
  
  // Common timestamp column issues
  { pattern: /\.resolved_at/g, correct: '.finished_at', table: 'multiple' },
];

function findFilesWithPattern(pattern, directory = '/home/leon/bitr/backend') {
  try {
    const result = execSync(`grep -r "${pattern}" "${directory}" --include="*.js" --include="*.sql" -l`, { encoding: 'utf8' });
    return result.trim().split('\n').filter(f => f);
  } catch (error) {
    return [];
  }
}

function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    
    PROBLEMATIC_PATTERNS.forEach(({ pattern, correct, table }) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          issues.push({
            file: filePath,
            line: findLineNumber(content, match),
            issue: `Found "${match}" - should be "${correct}"`,
            table: table,
            severity: 'HIGH'
          });
        });
      }
    });
    
    return issues;
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return [];
  }
}

function findLineNumber(content, searchText) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchText)) {
      return i + 1;
    }
  }
  return 0;
}

function generateReport() {
  console.log('🔍 Column Mismatch Detection Report');
  console.log('=====================================\n');
  
  const allIssues = [];
  
  // Check each problematic pattern
  PROBLEMATIC_PATTERNS.forEach(({ pattern, correct, table }) => {
    console.log(`Checking pattern: ${pattern}`);
    const files = findFilesWithPattern(pattern.source);
    
    files.forEach(file => {
      const issues = analyzeFile(file);
      allIssues.push(...issues);
    });
  });
  
  // Group issues by file
  const issuesByFile = {};
  allIssues.forEach(issue => {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = [];
    }
    issuesByFile[issue.file].push(issue);
  });
  
  // Generate report
  console.log('\n📊 SUMMARY');
  console.log(`Total issues found: ${allIssues.length}`);
  console.log(`Files affected: ${Object.keys(issuesByFile).length}\n`);
  
  console.log('📋 DETAILED ISSUES BY FILE');
  console.log('==========================\n');
  
  Object.entries(issuesByFile).forEach(([file, issues]) => {
    console.log(`📁 ${file}`);
    issues.forEach(issue => {
      console.log(`  Line ${issue.line}: ${issue.issue}`);
      console.log(`  Table: ${issue.table}`);
      console.log(`  Severity: ${issue.severity}\n`);
    });
  });
  
  // Generate fix suggestions
  console.log('🔧 SUGGESTED FIXES');
  console.log('==================\n');
  
  Object.entries(issuesByFile).forEach(([file, issues]) => {
    console.log(`📁 ${file}:`);
    issues.forEach(issue => {
      const fix = issue.issue.replace('Found "', '').replace('" - should be "', '" → "').replace('"', '');
      console.log(`  sed -i 's/${issue.issue.match(/Found "([^"]+)" - should be "([^"]+)"/)?.[1]}/${issue.issue.match(/Found "([^"]+)" - should be "([^"]+)"/)?.[2]}/g' "${file}"`);
    });
    console.log('');
  });
  
  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    totalIssues: allIssues.length,
    filesAffected: Object.keys(issuesByFile).length,
    issues: allIssues,
    issuesByFile: issuesByFile
  };
  
  fs.writeFileSync('/home/leon/bitr/backend/scripts/column-mismatch-report.json', JSON.stringify(report, null, 2));
  console.log('📄 Report saved to: /home/leon/bitr/backend/scripts/column-mismatch-report.json');
}

if (require.main === module) {
  generateReport();
}

module.exports = { generateReport, ACTUAL_SCHEMA, PROBLEMATIC_PATTERNS };
