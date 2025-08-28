#!/usr/bin/env node

/**
 * DATABASE REQUIREMENTS ANALYZER
 * 
 * This script analyzes the entire codebase to detect:
 * 1. All database schemas, tables, and columns that the code expects
 * 2. Compares them with perfect-schema.sql to identify missing elements
 * 3. Generates a comprehensive report of what needs to be implemented
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DatabaseRequirementsAnalyzer {
  constructor() {
    this.codebasePath = path.join(__dirname, '..');
    this.perfectSchemaPath = path.join(__dirname, '..', 'database', 'perfect-schema.sql');
    this.requirements = {
      schemas: new Set(),
      tables: new Map(), // schema.table -> Set of columns
      indexes: new Set(),
      functions: new Set(),
      views: new Set()
    };
    this.perfectSchema = {
      schemas: new Set(),
      tables: new Map(),
      indexes: new Set(),
      functions: new Set(),
      views: new Set()
    };
  }

  /**
   * Extract database requirements from perfect-schema.sql
   */
  parsePerfectSchema() {
    console.log('📖 Parsing perfect-schema.sql...');
    
    if (!fs.existsSync(this.perfectSchemaPath)) {
      throw new Error('perfect-schema.sql not found!');
    }

    const content = fs.readFileSync(this.perfectSchemaPath, 'utf8');
    
    // Extract schemas
    const schemaMatches = content.match(/CREATE SCHEMA IF NOT EXISTS (\w+)/g);
    if (schemaMatches) {
      schemaMatches.forEach(match => {
        const schema = match.match(/CREATE SCHEMA IF NOT EXISTS (\w+)/)[1];
        this.perfectSchema.schemas.add(schema);
      });
    }

    // Extract tables
    const tableMatches = content.match(/CREATE TABLE IF NOT EXISTS (\w+\.\w+)/g);
    if (tableMatches) {
      tableMatches.forEach(match => {
        const fullTableName = match.match(/CREATE TABLE IF NOT EXISTS (\w+\.\w+)/)[1];
        const [schema, table] = fullTableName.split('.');
        
        if (!this.perfectSchema.tables.has(fullTableName)) {
          this.perfectSchema.tables.set(fullTableName, new Set());
        }
      });
    }

    // Extract columns for each table
    const tableBlocks = content.split(/CREATE TABLE IF NOT EXISTS/);
    tableBlocks.slice(1).forEach(block => {
      const lines = block.split('\n');
      const tableMatch = lines[0].match(/(\w+\.\w+)/);
      if (tableMatch) {
        const fullTableName = tableMatch[1];
        const columns = new Set();
        
        lines.forEach(line => {
          const columnMatch = line.match(/^\s*(\w+)\s+([^,]+),?$/);
          if (columnMatch && !line.includes('PRIMARY KEY') && !line.includes('FOREIGN KEY') && !line.includes('UNIQUE')) {
            columns.add(columnMatch[1].trim());
          }
        });
        
        this.perfectSchema.tables.set(fullTableName, columns);
      }
    });

    // Extract indexes
    const indexMatches = content.match(/CREATE INDEX IF NOT EXISTS \w+ ON (\w+\.\w+)/g);
    if (indexMatches) {
      indexMatches.forEach(match => {
        this.perfectSchema.indexes.add(match);
      });
    }

    // Extract functions
    const functionMatches = content.match(/CREATE OR REPLACE FUNCTION (\w+\.\w+)/g);
    if (functionMatches) {
      functionMatches.forEach(match => {
        this.perfectSchema.functions.add(match);
      });
    }

    console.log(`✅ Perfect schema parsed: ${this.perfectSchema.schemas.size} schemas, ${this.perfectSchema.tables.size} tables`);
  }

  /**
   * Extract database requirements from codebase
   */
  analyzeCodebase() {
    console.log('🔍 Analyzing codebase for database requirements...');
    
    // Get all JavaScript files
    const jsFiles = this.getJavaScriptFiles();
    
    jsFiles.forEach(file => {
      this.analyzeFile(file);
    });

    console.log(`✅ Codebase analyzed: ${this.requirements.schemas.size} schemas, ${this.requirements.tables.size} tables`);
  }

  /**
   * Get all JavaScript files in the codebase
   */
  getJavaScriptFiles() {
    const files = [];
    
    const walkDir = (dir) => {
      const items = fs.readdirSync(dir);
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          walkDir(fullPath);
        } else if (item.endsWith('.js') || item.endsWith('.ts')) {
          files.push(fullPath);
        }
      });
    };

    walkDir(this.codebasePath);
    return files;
  }

  /**
   * Analyze a single file for database requirements
   */
  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extract SELECT statements
      this.extractSelectStatements(content, filePath);
      
      // Extract INSERT statements
      this.extractInsertStatements(content, filePath);
      
      // Extract UPDATE statements
      this.extractUpdateStatements(content, filePath);
      
      // Extract DELETE statements
      this.extractDeleteStatements(content, filePath);
      
    } catch (error) {
      console.warn(`⚠️ Could not read file ${filePath}:`, error.message);
    }
  }

  /**
   * Extract table references from SELECT statements
   */
  extractSelectStatements(content, filePath) {
    const selectRegex = /SELECT[^;]+FROM\s+(\w+\.\w+)/gi;
    let match;
    
    while ((match = selectRegex.exec(content)) !== null) {
      const tableName = match[1];
      const [schema, table] = tableName.split('.');
      
      this.requirements.schemas.add(schema);
      
      if (!this.requirements.tables.has(tableName)) {
        this.requirements.tables.set(tableName, new Set());
      }
      
      // Try to extract column names from SELECT
      const selectMatch = content.substring(match.index, match.index + 200);
      const columnMatches = selectMatch.match(/(\w+\.\w+)/g);
      if (columnMatches) {
        columnMatches.forEach(colMatch => {
          const [colSchema, colTable, colName] = colMatch.split('.');
          if (colSchema && colTable && colName) {
            const fullTableName = `${colSchema}.${colTable}`;
            if (!this.requirements.tables.has(fullTableName)) {
              this.requirements.tables.set(fullTableName, new Set());
            }
            this.requirements.tables.get(fullTableName).add(colName);
          }
        });
      }
    }
  }

  /**
   * Extract table references from INSERT statements
   */
  extractInsertStatements(content, filePath) {
    const insertRegex = /INSERT INTO\s+(\w+\.\w+)/gi;
    let match;
    
    while ((match = insertRegex.exec(content)) !== null) {
      const tableName = match[1];
      const [schema, table] = tableName.split('.');
      
      this.requirements.schemas.add(schema);
      
      if (!this.requirements.tables.has(tableName)) {
        this.requirements.tables.set(tableName, new Set());
      }
    }
  }

  /**
   * Extract table references from UPDATE statements
   */
  extractUpdateStatements(content, filePath) {
    const updateRegex = /UPDATE\s+(\w+\.\w+)/gi;
    let match;
    
    while ((match = updateRegex.exec(content)) !== null) {
      const tableName = match[1];
      const [schema, table] = tableName.split('.');
      
      this.requirements.schemas.add(schema);
      
      if (!this.requirements.tables.has(tableName)) {
        this.requirements.tables.set(tableName, new Set());
      }
    }
  }

  /**
   * Extract table references from DELETE statements
   */
  extractDeleteStatements(content, filePath) {
    const deleteRegex = /DELETE FROM\s+(\w+\.\w+)/gi;
    let match;
    
    while ((match = deleteRegex.exec(content)) !== null) {
      const tableName = match[1];
      const [schema, table] = tableName.split('.');
      
      this.requirements.schemas.add(schema);
      
      if (!this.requirements.tables.has(tableName)) {
        this.requirements.tables.set(tableName, new Set());
      }
    }
  }

  /**
   * Generate comprehensive comparison report
   */
  generateReport() {
    console.log('\n📊 GENERATING COMPREHENSIVE DATABASE ANALYSIS REPORT');
    console.log('===================================================\n');

    // 1. Schema Analysis
    console.log('1. SCHEMA ANALYSIS');
    console.log('------------------');
    
    const codebaseSchemas = Array.from(this.requirements.schemas).sort();
    const perfectSchemas = Array.from(this.perfectSchema.schemas).sort();
    
    console.log(`Codebase expects: ${codebaseSchemas.join(', ')}`);
    console.log(`Perfect schema has: ${perfectSchemas.join(', ')}`);
    
    const missingSchemas = codebaseSchemas.filter(schema => !perfectSchemas.includes(schema));
    const extraSchemas = perfectSchemas.filter(schema => !codebaseSchemas.includes(schema));
    
    if (missingSchemas.length > 0) {
      console.log(`❌ Missing schemas: ${missingSchemas.join(', ')}`);
    }
    if (extraSchemas.length > 0) {
      console.log(`⚠️ Extra schemas in perfect schema: ${extraSchemas.join(', ')}`);
    }

    // 2. Table Analysis
    console.log('\n2. TABLE ANALYSIS');
    console.log('----------------');
    
    const codebaseTables = Array.from(this.requirements.tables.keys()).sort();
    const perfectTables = Array.from(this.perfectSchema.tables.keys()).sort();
    
    console.log(`Codebase expects: ${codebaseTables.length} tables`);
    console.log(`Perfect schema has: ${perfectTables.length} tables`);
    
    const missingTables = codebaseTables.filter(table => !perfectTables.includes(table));
    const extraTables = perfectTables.filter(table => !codebaseTables.includes(table));
    
    if (missingTables.length > 0) {
      console.log(`❌ Missing tables:`);
      missingTables.forEach(table => console.log(`   - ${table}`));
    }
    
    if (extraTables.length > 0) {
      console.log(`⚠️ Extra tables in perfect schema:`);
      extraTables.forEach(table => console.log(`   - ${table}`));
    }

    // 3. Column Analysis
    console.log('\n3. COLUMN ANALYSIS');
    console.log('-----------------');
    
    const commonTables = codebaseTables.filter(table => perfectTables.includes(table));
    
    commonTables.forEach(table => {
      const codebaseColumns = this.requirements.tables.get(table) || new Set();
      const perfectColumns = this.perfectSchema.tables.get(table) || new Set();
      
      const missingColumns = Array.from(codebaseColumns).filter(col => !perfectColumns.has(col));
      
      if (missingColumns.length > 0) {
        console.log(`❌ Missing columns in ${table}:`);
        missingColumns.forEach(col => console.log(`   - ${col}`));
      }
    });

    // 4. Summary
    console.log('\n4. SUMMARY');
    console.log('----------');
    
    const totalMissingTables = missingTables.length;
    const totalMissingSchemas = missingSchemas.length;
    
    console.log(`Total missing schemas: ${totalMissingSchemas}`);
    console.log(`Total missing tables: ${totalMissingTables}`);
    
    if (totalMissingSchemas === 0 && totalMissingTables === 0) {
      console.log('✅ Perfect! All codebase requirements are covered by perfect-schema.sql');
    } else {
      console.log('❌ Some requirements are missing from perfect-schema.sql');
    }

    // 5. Generate SQL fixes
    if (totalMissingSchemas > 0 || totalMissingTables > 0) {
      console.log('\n5. SUGGESTED SQL FIXES');
      console.log('---------------------');
      
      missingSchemas.forEach(schema => {
        console.log(`CREATE SCHEMA IF NOT EXISTS ${schema};`);
      });
      
      missingTables.forEach(table => {
        const [schema, tableName] = table.split('.');
        console.log(`-- TODO: Create table ${table}`);
        console.log(`-- CREATE TABLE IF NOT EXISTS ${table} (`);
        console.log(`--   id SERIAL PRIMARY KEY,`);
        console.log(`--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
        console.log(`-- );`);
        console.log('');
      });
    }

    // 6. Save detailed report
    this.saveDetailedReport();
  }

  /**
   * Save detailed report to file
   */
  saveDetailedReport() {
    const report = {
      timestamp: new Date().toISOString(),
      codebaseRequirements: {
        schemas: Array.from(this.requirements.schemas).sort(),
        tables: Object.fromEntries(
          Array.from(this.requirements.tables.entries()).map(([table, columns]) => [
            table, 
            Array.from(columns).sort()
          ])
        )
      },
      perfectSchema: {
        schemas: Array.from(this.perfectSchema.schemas).sort(),
        tables: Object.fromEntries(
          Array.from(this.perfectSchema.tables.entries()).map(([table, columns]) => [
            table, 
            Array.from(columns).sort()
          ])
        )
      },
      analysis: {
        missingSchemas: Array.from(this.requirements.schemas).filter(schema => !this.perfectSchema.schemas.has(schema)),
        missingTables: Array.from(this.requirements.tables.keys()).filter(table => !this.perfectSchema.tables.has(table)),
        extraSchemas: Array.from(this.perfectSchema.schemas).filter(schema => !this.requirements.schemas.has(schema)),
        extraTables: Array.from(this.perfectSchema.tables.keys()).filter(table => !this.requirements.tables.has(table))
      }
    };

    const reportPath = path.join(__dirname, 'database-analysis-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  /**
   * Run the complete analysis
   */
  async run() {
    try {
      console.log('🚀 Starting Database Requirements Analysis...\n');
      
      this.parsePerfectSchema();
      this.analyzeCodebase();
      this.generateReport();
      
      console.log('\n✅ Analysis complete!');
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    }
  }
}

// Run the analyzer
if (require.main === module) {
  const analyzer = new DatabaseRequirementsAnalyzer();
  analyzer.run();
}

module.exports = DatabaseRequirementsAnalyzer;
