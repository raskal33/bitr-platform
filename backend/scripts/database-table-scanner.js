const db = require('../db/db');
const fs = require('fs');
const path = require('path');

class DatabaseTableScanner {
  constructor() {
    this.issues = [];
    this.tables = new Set();
    this.referencedTables = new Set();
  }

  /**
   * Scan all JavaScript files for database table references
   */
  async scanCodebase() {
    console.log('🔍 Scanning codebase for database table references...');
    
    const backendDir = path.join(__dirname, '..');
    await this.scanDirectory(backendDir);
    
    console.log(`📊 Found ${this.referencedTables.size} unique table references in code`);
    console.log(`📊 Found ${this.tables.size} actual database tables`);
    
    return this.analyzeIssues();
  }

  /**
   * Recursively scan directory for JavaScript files
   */
  async scanDirectory(dir) {
    try {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          await this.scanDirectory(fullPath);
        } else if (file.endsWith('.js')) {
          await this.scanFile(fullPath);
        }
      }
    } catch (error) {
      console.error(`❌ Error scanning directory ${dir}:`, error.message);
    }
  }

  /**
   * Scan a single JavaScript file for table references
   */
  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Find all oracle table references (excluding sequences and JavaScript methods)
      const oracleTableRegex = /oracle\.(\w+)/g;
      let match;
      
      while ((match = oracleTableRegex.exec(content)) !== null) {
        const tableName = match[1];
        
        // Skip sequences and JavaScript methods
        if (tableName.endsWith('_seq') || 
            tableName === 'toLowerCase' || 
            tableName === 'toString' || 
            tableName === 'toUpperCase' || 
            tableName === 'toFixed' || 
            tableName === 'toJSON') {
          continue;
        }
        
        this.referencedTables.add(tableName);
        
        // Store context for better error reporting
        const lines = content.split('\n');
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const lineContent = lines[lineNumber - 1]?.trim() || '';
        
        this.issues.push({
          type: 'table_reference',
          table: tableName,
          file: filePath,
          line: lineNumber,
          context: lineContent.substring(0, 100)
        });
      }
    } catch (error) {
      console.error(`❌ Error scanning file ${filePath}:`, error.message);
    }
  }

  /**
   * Get actual database tables
   */
  async getDatabaseTables() {
    try {
      const result = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        ORDER BY table_name
      `);
      
      result.rows.forEach(row => {
        this.tables.add(row.table_name);
      });
      
      console.log(`✅ Found ${this.tables.size} tables in oracle schema`);
      return this.tables;
    } catch (error) {
      console.error('❌ Error getting database tables:', error);
      return new Set();
    }
  }

  /**
   * Analyze issues and generate report
   */
  async analyzeIssues() {
    console.log('\n🔍 Analyzing database table issues...');
    
    const missingTables = [];
    const unusedTables = [];
    const potentialIssues = [];

    // Check for missing tables (referenced in code but don't exist in DB)
    for (const table of this.referencedTables) {
      if (!this.tables.has(table)) {
        missingTables.push(table);
      }
    }

    // Check for unused tables (exist in DB but not referenced in code)
    for (const table of this.tables) {
      if (!this.referencedTables.has(table)) {
        unusedTables.push(table);
      }
    }

    // Check for potential naming inconsistencies
    const namingIssues = this.checkNamingInconsistencies();

    return {
      summary: {
        totalReferencedTables: this.referencedTables.size,
        totalDatabaseTables: this.tables.size,
        missingTables: missingTables.length,
        unusedTables: unusedTables.length,
        namingIssues: namingIssues.length
      },
      missingTables,
      unusedTables,
      namingIssues,
      allReferencedTables: Array.from(this.referencedTables).sort(),
      allDatabaseTables: Array.from(this.tables).sort()
    };
  }

  /**
   * Check for naming inconsistencies
   */
  checkNamingInconsistencies() {
    const issues = [];
    const tableNames = Array.from(this.referencedTables);
    
    // Check for similar table names that might be typos
    for (let i = 0; i < tableNames.length; i++) {
      for (let j = i + 1; j < tableNames.length; j++) {
        const name1 = tableNames[i];
        const name2 = tableNames[j];
        
        // Check for similar names (potential typos)
        if (this.isSimilarName(name1, name2)) {
          issues.push({
            type: 'similar_names',
            table1: name1,
            table2: name2,
            similarity: this.calculateSimilarity(name1, name2)
          });
        }
      }
    }

    // Check for inconsistent naming patterns
    const patterns = this.analyzeNamingPatterns(tableNames);
    if (patterns.inconsistencies.length > 0) {
      issues.push(...patterns.inconsistencies);
    }

    return issues;
  }

  /**
   * Check if two table names are similar (potential typo)
   */
  isSimilarName(name1, name2) {
    if (name1 === name2) return false;
    
    // Check for common typos
    const commonTypos = [
      ['oddyssey_matches', 'oddyssey_matches'],
      ['oddyssey_cycles', 'oddyssey_cycle'],
      ['daily_game_matches', 'daily_game_match'],
      ['fixture_odds', 'fixture_odd'],
      ['fixture_results', 'fixture_result']
    ];

    for (const [typo1, typo2] of commonTypos) {
      if ((name1 === typo1 && name2 === typo2) || (name1 === typo2 && name2 === typo1)) {
        return true;
      }
    }

    // Check for Levenshtein distance
    const distance = this.levenshteinDistance(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);
    const similarity = 1 - (distance / maxLength);
    
    return similarity > 0.8; // 80% similarity threshold
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate similarity percentage
   */
  calculateSimilarity(name1, name2) {
    const distance = this.levenshteinDistance(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);
    return Math.round((1 - (distance / maxLength)) * 100);
  }

  /**
   * Analyze naming patterns for inconsistencies
   */
  analyzeNamingPatterns(tableNames) {
    const inconsistencies = [];
    
    // Check for inconsistent pluralization
    const singularForms = tableNames.filter(name => !name.endsWith('s'));
    const pluralForms = tableNames.filter(name => name.endsWith('s'));
    
    // Look for potential singular/plural pairs
    for (const singular of singularForms) {
      const plural = singular + 's';
      if (pluralForms.includes(plural)) {
        inconsistencies.push({
          type: 'pluralization_inconsistency',
          singular,
          plural,
          suggestion: `Choose either singular or plural form consistently`
        });
      }
    }

    return { inconsistencies };
  }

  /**
   * Generate detailed report
   */
  generateReport(analysis) {
    console.log('\n📋 DATABASE TABLE ANALYSIS REPORT');
    console.log('=====================================');
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   • Referenced tables in code: ${analysis.summary.totalReferencedTables}`);
    console.log(`   • Actual database tables: ${analysis.summary.totalDatabaseTables}`);
    console.log(`   • Missing tables: ${analysis.summary.missingTables}`);
    console.log(`   • Unused tables: ${analysis.summary.unusedTables}`);
    console.log(`   • Naming issues: ${analysis.summary.namingIssues}`);

    if (analysis.missingTables.length > 0) {
      console.log(`\n❌ MISSING TABLES (referenced in code but don't exist in DB):`);
      analysis.missingTables.forEach(table => {
        console.log(`   • ${table}`);
      });
    }

    if (analysis.unusedTables.length > 0) {
      console.log(`\n⚠️ UNUSED TABLES (exist in DB but not referenced in code):`);
      analysis.unusedTables.forEach(table => {
        console.log(`   • ${table}`);
      });
    }

    if (analysis.namingIssues.length > 0) {
      console.log(`\n🔍 NAMING INCONSISTENCIES:`);
      analysis.namingIssues.forEach(issue => {
        if (issue.type === 'similar_names') {
          console.log(`   • Similar names: "${issue.table1}" vs "${issue.table2}" (${issue.similarity}% similar)`);
        } else if (issue.type === 'pluralization_inconsistency') {
          console.log(`   • Pluralization: "${issue.singular}" vs "${issue.plural}"`);
        }
      });
    }

    console.log(`\n📋 ALL REFERENCED TABLES:`);
    analysis.allReferencedTables.forEach(table => {
      const exists = analysis.allDatabaseTables.includes(table) ? '✅' : '❌';
      console.log(`   ${exists} ${table}`);
    });

    console.log(`\n📋 ALL DATABASE TABLES:`);
    analysis.allDatabaseTables.forEach(table => {
      const referenced = analysis.allReferencedTables.includes(table) ? '✅' : '⚠️';
      console.log(`   ${referenced} ${table}`);
    });

    return analysis;
  }
}

// Main execution
async function main() {
  const scanner = new DatabaseTableScanner();
  
  try {
    // Get actual database tables
    await scanner.getDatabaseTables();
    
    // Scan codebase
    const analysis = await scanner.scanCodebase();
    
    // Generate report
    scanner.generateReport(analysis);
    
    // Save detailed report to file
    const reportPath = path.join(__dirname, 'database-table-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Error during database table scan:', error);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = DatabaseTableScanner;
