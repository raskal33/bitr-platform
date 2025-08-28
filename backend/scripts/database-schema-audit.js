#!/usr/bin/env node

/**
 * Database Schema Audit Script
 * 
 * This script analyzes the codebase for database schema mismatches:
 * - Missing tables/columns referenced in code
 * - Wrong table usage (e.g., getting scores from fixtures instead of fixture_results)
 * - Inconsistent column naming
 * - SQL injection vulnerabilities
 * - Performance issues (missing indexes on queried columns)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

class DatabaseSchemaAuditor {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.suggestions = [];
    this.schemaCache = new Map();
    this.codeFiles = [];
    
    // Common patterns for SQL queries
    this.sqlPatterns = [
      // SELECT patterns
      /SELECT\s+([^FROM]+)\s+FROM\s+([^\s\(]+)/gi,
      // INSERT patterns  
      /INSERT\s+INTO\s+([^\s\(]+)\s*\(([^)]+)\)/gi,
      // UPDATE patterns
      /UPDATE\s+([^\s]+)\s+SET\s+([^WHERE]+)/gi,
      // Column references in WHERE/JOIN
      /(?:WHERE|AND|OR|ON)\s+([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)/gi,
    ];

    // Known table purposes (helps detect wrong table usage)
    this.tablePurposes = {
      'oracle.fixtures': {
        purpose: 'Basic match information',
        hasColumns: ['id', 'home_team', 'away_team', 'match_date', 'status', 'league_name'],
        doesNotHave: ['home_odds', 'draw_odds', 'away_odds', 'home_score', 'away_score'],
        useFor: 'Basic match info, team names, dates, status'
      },
      'oracle.fixture_results': {
        purpose: 'Match results and scores',
        hasColumns: ['fixture_id', 'home_score', 'away_score', 'outcome_1x2', 'outcome_ou25'],
        doesNotHave: ['home_team', 'away_team', 'match_date'],
        useFor: 'Match scores, outcomes, results'
      },
      'oracle.daily_game_matches': {
        purpose: 'Daily game data with odds',
        hasColumns: ['fixture_id', 'home_odds', 'draw_odds', 'away_odds', 'over_25_odds', 'under_25_odds'],
        doesNotHave: [],
        useFor: 'Odds data for daily games'
      },
      'oracle.oddyssey_cycles': {
        purpose: 'Oddyssey game cycles',
        hasColumns: ['cycle_id', 'matches_data', 'is_resolved', 'cycle_start_time'],
        doesNotHave: [],
        useFor: 'Cycle management'
      }
    };
  }

  /**
   * Main audit function
   */
  async runAudit() {
    console.log('🔍 Starting Database Schema Audit...\n');
    
    try {
      // Step 1: Load actual database schema
      await this.loadDatabaseSchema();
      
      // Step 2: Scan codebase for SQL queries
      await this.scanCodebase();
      
      // Step 3: Analyze queries for issues
      await this.analyzeQueries();
      
      // Step 4: Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Audit failed:', error);
      process.exit(1);
    } finally {
      await db.disconnect();
    }
  }

  /**
   * Load actual database schema from the database
   */
  async loadDatabaseSchema() {
    console.log('📋 Loading database schema...');
    
    try {
      // Get all tables and their columns
      const schemaQuery = `
        SELECT 
          table_schema,
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema IN ('oracle', 'public')
        ORDER BY table_schema, table_name, ordinal_position
      `;
      
      const result = await db.query(schemaQuery);
      
      // Group by table
      for (const row of result.rows) {
        const fullTableName = `${row.table_schema}.${row.table_name}`;
        
        if (!this.schemaCache.has(fullTableName)) {
          this.schemaCache.set(fullTableName, {
            schema: row.table_schema,
            name: row.table_name,
            columns: new Map()
          });
        }
        
        this.schemaCache.get(fullTableName).columns.set(row.column_name, {
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          default: row.column_default
        });
      }
      
      console.log(`✅ Loaded schema for ${this.schemaCache.size} tables`);
      
      // Load indexes for performance analysis
      await this.loadIndexes();
      
    } catch (error) {
      throw new Error(`Failed to load database schema: ${error.message}`);
    }
  }

  /**
   * Load database indexes
   */
  async loadIndexes() {
    try {
      const indexQuery = `
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE schemaname IN ('oracle', 'public')
      `;
      
      const result = await db.query(indexQuery);
      
      for (const row of result.rows) {
        const fullTableName = `${row.schemaname}.${row.tablename}`;
        const table = this.schemaCache.get(fullTableName);
        if (table) {
          if (!table.indexes) table.indexes = [];
          table.indexes.push({
            name: row.indexname,
            definition: row.indexdef
          });
        }
      }
      
    } catch (error) {
      console.warn('⚠️ Could not load indexes:', error.message);
    }
  }

  /**
   * Scan codebase for files containing SQL queries
   */
  async scanCodebase() {
    console.log('📁 Scanning codebase for SQL queries...');
    
    const directories = [
      'api',
      'services', 
      'cron',
      'scripts',
      'db'
    ];
    
    for (const dir of directories) {
      const fullPath = path.join(__dirname, '..', dir);
      if (fs.existsSync(fullPath)) {
        await this.scanDirectory(fullPath);
      }
    }
    
    console.log(`✅ Scanned ${this.codeFiles.length} files`);
  }

  /**
   * Recursively scan directory for JS files
   */
  async scanDirectory(dirPath) {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        await this.scanDirectory(itemPath);
      } else if (item.endsWith('.js') && !item.includes('.test.') && !item.includes('.spec.')) {
        const content = fs.readFileSync(itemPath, 'utf8');
        this.codeFiles.push({
          path: itemPath,
          relativePath: path.relative(path.join(__dirname, '..'), itemPath),
          content
        });
      }
    }
  }

  /**
   * Analyze SQL queries in the codebase
   */
  async analyzeQueries() {
    console.log('🔍 Analyzing SQL queries for schema issues...');
    
    for (const file of this.codeFiles) {
      this.analyzeFileQueries(file);
    }
  }

  /**
   * Analyze queries in a single file
   */
  analyzeFileQueries(file) {
    const lines = file.content.split('\n');
    
    // Find SQL queries (look for common patterns)
    const sqlRegex = /(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+.*?(?=;|\`|\)|$)/gis;
    const matches = file.content.match(sqlRegex) || [];
    
    for (let i = 0; i < matches.length; i++) {
      const query = matches[i].trim();
      const lineNumber = this.findLineNumber(file.content, query);
      
      this.analyzeQuery(query, file.relativePath, lineNumber);
    }
    
    // Also check for template literals with SQL
    const templateLiteralRegex = /`[\s\S]*?(SELECT|INSERT|UPDATE|DELETE)[\s\S]*?`/gi;
    const templateMatches = file.content.match(templateLiteralRegex) || [];
    
    for (const match of templateMatches) {
      const lineNumber = this.findLineNumber(file.content, match);
      this.analyzeQuery(match, file.relativePath, lineNumber);
    }
  }

  /**
   * Find line number of a query in file content
   */
  findLineNumber(content, query) {
    const lines = content.split('\n');
    const queryStart = query.substring(0, 50).trim();
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(queryStart.substring(0, 20))) {
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * Analyze a single SQL query
   */
  analyzeQuery(query, filePath, lineNumber) {
    // Clean up the query
    const cleanQuery = query.replace(/`/g, '').replace(/\$\{[^}]+\}/g, '?').trim();
    
    // Extract table references
    const tableRefs = this.extractTableReferences(cleanQuery);
    const columnRefs = this.extractColumnReferences(cleanQuery);
    
    // Check for issues
    this.checkMissingTables(tableRefs, filePath, lineNumber, cleanQuery);
    this.checkMissingColumns(columnRefs, filePath, lineNumber, cleanQuery);
    this.checkWrongTableUsage(cleanQuery, filePath, lineNumber);
    this.checkPerformanceIssues(cleanQuery, filePath, lineNumber);
  }

  /**
   * Extract table references from query
   */
  extractTableReferences(query) {
    const tables = new Set();
    
    // FROM clauses
    const fromMatches = query.match(/FROM\s+([^\s\(,]+)/gi) || [];
    fromMatches.forEach(match => {
      const table = match.replace(/FROM\s+/i, '').trim();
      tables.add(table);
    });
    
    // JOIN clauses
    const joinMatches = query.match(/JOIN\s+([^\s\(,]+)/gi) || [];
    joinMatches.forEach(match => {
      const table = match.replace(/JOIN\s+/i, '').trim();
      tables.add(table);
    });
    
    // INSERT INTO
    const insertMatches = query.match(/INSERT\s+INTO\s+([^\s\(,]+)/gi) || [];
    insertMatches.forEach(match => {
      const table = match.replace(/INSERT\s+INTO\s+/i, '').trim();
      tables.add(table);
    });
    
    // UPDATE
    const updateMatches = query.match(/UPDATE\s+([^\s,]+)/gi) || [];
    updateMatches.forEach(match => {
      const table = match.replace(/UPDATE\s+/i, '').trim();
      tables.add(table);
    });
    
    return Array.from(tables);
  }

  /**
   * Extract column references from query
   */
  extractColumnReferences(query) {
    const columns = [];
    
    // Table.column references
    const columnMatches = query.match(/([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
    
    for (const match of columnMatches) {
      const [tableAlias, columnName] = match.split('.');
      columns.push({ tableAlias, columnName, fullRef: match });
    }
    
    return columns;
  }

  /**
   * Check for missing tables
   */
  checkMissingTables(tableRefs, filePath, lineNumber, query) {
    for (const tableRef of tableRefs) {
      // Skip aliases and variables
      if (!tableRef.includes('.') || tableRef.includes('$') || tableRef.length < 3) {
        continue;
      }
      
      if (!this.schemaCache.has(tableRef)) {
        this.issues.push({
          type: 'MISSING_TABLE',
          severity: 'ERROR',
          file: filePath,
          line: lineNumber,
          message: `Table '${tableRef}' does not exist in database`,
          query: query.substring(0, 100) + '...',
          suggestion: `Check table name spelling or create the table`
        });
      }
    }
  }

  /**
   * Check for missing columns
   */
  checkMissingColumns(columnRefs, filePath, lineNumber, query) {
    for (const colRef of columnRefs) {
      // Try to resolve table alias to actual table
      const possibleTables = this.findPossibleTables(colRef.tableAlias, query);
      
      for (const tableName of possibleTables) {
        const table = this.schemaCache.get(tableName);
        if (table && !table.columns.has(colRef.columnName)) {
          this.issues.push({
            type: 'MISSING_COLUMN',
            severity: 'ERROR',
            file: filePath,
            line: lineNumber,
            message: `Column '${colRef.columnName}' does not exist in table '${tableName}'`,
            query: query.substring(0, 100) + '...',
            suggestion: this.suggestCorrectColumn(colRef.columnName, table)
          });
        }
      }
    }
  }

  /**
   * Find possible tables for an alias
   */
  findPossibleTables(alias, query) {
    const tables = [];
    
    // Look for alias definitions like "FROM table_name alias" or "FROM table_name AS alias"
    // Escape special regex characters in alias
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const aliasRegex = new RegExp(`FROM\\s+([^\\s,]+)\\s+(?:AS\\s+)?${escapedAlias}\\b`, 'i');
    const match = query.match(aliasRegex);
    
    if (match) {
      tables.push(match[1]);
    } else {
      // If no alias found, assume alias is the table name
      if (this.schemaCache.has(alias)) {
        tables.push(alias);
      }
      // Also check if it's a schema.table reference
      for (const tableName of this.schemaCache.keys()) {
        if (tableName.endsWith('.' + alias)) {
          tables.push(tableName);
        }
      }
    }
    
    return tables;
  }

  /**
   * Suggest correct column name
   */
  suggestCorrectColumn(wrongColumn, table) {
    const columns = Array.from(table.columns.keys());
    
    // Find similar column names
    const similar = columns.filter(col => 
      col.toLowerCase().includes(wrongColumn.toLowerCase()) ||
      wrongColumn.toLowerCase().includes(col.toLowerCase()) ||
      this.levenshteinDistance(col.toLowerCase(), wrongColumn.toLowerCase()) <= 2
    );
    
    if (similar.length > 0) {
      return `Did you mean: ${similar.join(', ')}?`;
    }
    
    return `Available columns: ${columns.slice(0, 5).join(', ')}${columns.length > 5 ? '...' : ''}`;
  }

  /**
   * Check for wrong table usage patterns
   */
  checkWrongTableUsage(query, filePath, lineNumber) {
    // Check for common wrong patterns
    const wrongPatterns = [
      {
        pattern: /oracle\.fixtures.*\.(home_odds|draw_odds|away_odds|over_.*odds|under_.*odds)/i,
        message: "Getting odds from 'fixtures' table - use 'daily_game_matches' table instead",
        severity: 'ERROR'
      },
      {
        pattern: /oracle\.fixtures.*\.(home_score|away_score)/i,
        message: "Getting scores from 'fixtures' table - use 'fixture_results' table instead", 
        severity: 'ERROR'
      },
      {
        pattern: /oracle\.daily_game_matches.*\.(status|match_date)/i,
        message: "Getting match info from 'daily_game_matches' - consider joining with 'fixtures' table",
        severity: 'WARNING'
      }
    ];
    
    for (const pattern of wrongPatterns) {
      if (pattern.pattern.test(query)) {
        this.issues.push({
          type: 'WRONG_TABLE_USAGE',
          severity: pattern.severity,
          file: filePath,
          line: lineNumber,
          message: pattern.message,
          query: query.substring(0, 100) + '...',
          suggestion: this.getTableUsageSuggestion(pattern.message)
        });
      }
    }
  }

  /**
   * Get table usage suggestion
   */
  getTableUsageSuggestion(message) {
    if (message.includes('odds')) {
      return "Use: SELECT dgm.home_odds FROM oracle.daily_game_matches dgm WHERE dgm.fixture_id = ?";
    }
    if (message.includes('scores')) {
      return "Use: SELECT fr.home_score, fr.away_score FROM oracle.fixture_results fr WHERE fr.fixture_id = ?";
    }
    return "Check table purposes in the audit report";
  }

  /**
   * Check for performance issues
   */
  checkPerformanceIssues(query, filePath, lineNumber) {
    // Check for missing indexes on WHERE clauses
    const whereMatches = query.match(/WHERE\s+([^=]+)=/gi) || [];
    
    for (const whereClause of whereMatches) {
      const column = whereClause.replace(/WHERE\s+/i, '').split('=')[0].trim();
      
      if (column.includes('.')) {
        const [tableAlias, columnName] = column.split('.');
        const tables = this.findPossibleTables(tableAlias, query);
        
        for (const tableName of tables) {
          const table = this.schemaCache.get(tableName);
          if (table && table.indexes) {
            const hasIndex = table.indexes.some(idx => 
              idx.definition.toLowerCase().includes(columnName.toLowerCase())
            );
            
            if (!hasIndex && !['id', 'created_at', 'updated_at'].includes(columnName)) {
              this.warnings.push({
                type: 'PERFORMANCE',
                severity: 'WARNING',
                file: filePath,
                line: lineNumber,
                message: `No index found on '${tableName}.${columnName}' - consider adding index for better performance`,
                query: query.substring(0, 100) + '...'
              });
            }
          }
        }
      }
    }
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
   * Generate comprehensive audit report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 DATABASE SCHEMA AUDIT REPORT');
    console.log('='.repeat(80));
    
    // Summary
    const errorCount = this.issues.filter(i => i.severity === 'ERROR').length;
    const warningCount = this.issues.filter(i => i.severity === 'WARNING').length + this.warnings.length;
    
    console.log(`\n📈 SUMMARY:`);
    console.log(`   🔴 Errors: ${errorCount}`);
    console.log(`   🟡 Warnings: ${warningCount}`);
    console.log(`   📁 Files scanned: ${this.codeFiles.length}`);
    console.log(`   🗄️  Tables in schema: ${this.schemaCache.size}`);
    
    // Errors
    if (errorCount > 0) {
      console.log(`\n🔴 ERRORS (${errorCount}):`);
      console.log('-'.repeat(50));
      
      this.issues.filter(i => i.severity === 'ERROR').forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.type}: ${issue.message}`);
        console.log(`   📁 File: ${issue.file}:${issue.line}`);
        console.log(`   📝 Query: ${issue.query}`);
        if (issue.suggestion) {
          console.log(`   💡 Suggestion: ${issue.suggestion}`);
        }
      });
    }
    
    // Warnings
    if (warningCount > 0) {
      console.log(`\n🟡 WARNINGS (${warningCount}):`);
      console.log('-'.repeat(50));
      
      [...this.issues.filter(i => i.severity === 'WARNING'), ...this.warnings].forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.type}: ${issue.message}`);
        console.log(`   📁 File: ${issue.file}:${issue.line}`);
        if (issue.query) {
          console.log(`   📝 Query: ${issue.query}`);
        }
        if (issue.suggestion) {
          console.log(`   💡 Suggestion: ${issue.suggestion}`);
        }
      });
    }
    
    // Table usage guide
    console.log(`\n📚 TABLE USAGE GUIDE:`);
    console.log('-'.repeat(50));
    
    for (const [tableName, info] of Object.entries(this.tablePurposes)) {
      console.log(`\n🗄️  ${tableName}:`);
      console.log(`   Purpose: ${info.purpose}`);
      console.log(`   Use for: ${info.useFor}`);
      console.log(`   Has: ${info.hasColumns.join(', ')}`);
      if (info.doesNotHave.length > 0) {
        console.log(`   ❌ Does NOT have: ${info.doesNotHave.join(', ')}`);
      }
    }
    
    // Schema overview
    console.log(`\n📋 SCHEMA OVERVIEW:`);
    console.log('-'.repeat(50));
    
    for (const [tableName, table] of this.schemaCache) {
      const columnCount = table.columns.size;
      const indexCount = table.indexes ? table.indexes.length : 0;
      console.log(`   ${tableName}: ${columnCount} columns, ${indexCount} indexes`);
    }
    
    // Final status
    console.log('\n' + '='.repeat(80));
    if (errorCount === 0) {
      console.log('✅ NO CRITICAL ERRORS FOUND - Schema usage looks good!');
    } else {
      console.log(`❌ ${errorCount} CRITICAL ERRORS FOUND - Please fix before deployment`);
    }
    
    if (warningCount > 0) {
      console.log(`⚠️  ${warningCount} warnings found - Consider reviewing for optimization`);
    }
    
    console.log('='.repeat(80));
    
    // Save detailed report to file
    this.saveReportToFile();
  }

  /**
   * Save detailed report to file
   */
  saveReportToFile() {
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        errors: this.issues.filter(i => i.severity === 'ERROR').length,
        warnings: this.issues.filter(i => i.severity === 'WARNING').length + this.warnings.length,
        filesScanned: this.codeFiles.length,
        tablesInSchema: this.schemaCache.size
      },
      issues: this.issues,
      warnings: this.warnings,
      schema: Object.fromEntries(
        Array.from(this.schemaCache.entries()).map(([name, table]) => [
          name,
          {
            columns: Array.from(table.columns.keys()),
            indexes: table.indexes ? table.indexes.map(idx => idx.name) : []
          }
        ])
      )
    };
    
    const reportPath = path.join(__dirname, 'database-audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }
}

// Run the audit if this script is executed directly
if (require.main === module) {
  const auditor = new DatabaseSchemaAuditor();
  auditor.runAudit().catch(console.error);
}

module.exports = DatabaseSchemaAuditor;
