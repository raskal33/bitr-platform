#!/usr/bin/env node

/**
 * Backend File Scanner
 * Scans for missing necessary files and potential issues
 */

const fs = require('fs');
const path = require('path');

// Define required files and directories
const requiredFiles = [
  // Core services
  'services/oddyssey-oracle-bot.js',
  'services/pool-settlement-service.js',
  'services/web3-service.js',
  'services/sportmonks.js',
  'services/oddyssey-match-selector.js',
  'services/schema-sync-bridge.js',
  
  // Database
  'db/db.js',
  
  // Cron processes
  'cron/consolidated-workers.js',
  'cron/oddyssey-scheduler-process.js',
  'cron/oddyssey-creator-process.js',
  'cron/oddyssey-oracle-bot-process.js',
  'cron/pool-settlement-service-process.js',
  'cron/coordinated-results-scheduler-process.js',
  'cron/fixtures-scheduler.js',
  'cron/fixture-status-updater.js',
  'cron/crypto-scheduler-process.js',
  'cron/football-scheduler.js',
  
  // Indexers
  'indexer.js',
  'indexer_oddyssey.js',
  'indexer_oddyssey_starter.js',
  
  // API
  'api/server.js',
  'api/oddyssey.js',
  
  // Config
  'config.js',
  'package.json',
  
  // Contract artifacts
  'solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
  'solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json',
  'solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
  'solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json',
  'solidity/artifacts/contracts/BitredictStaking.sol/BitredictStaking.json',
  'solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json',
  'solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json'
];

// Define required environment variables
const requiredEnvVars = [
  'RPC_URL',
  'BOT_PRIVATE_KEY',
  'ODDYSSEY_ADDRESS',
  'DATABASE_URL',
  'SPORTMONKS_API_TOKEN'
];

// Define optional but recommended files
const recommendedFiles = [
  '.env',
  '.env.example',
  'README.md',
  'startup-initializer.js'
];

function checkFileExists(filePath) {
  const fullPath = path.join(__dirname, filePath);
  return {
    exists: fs.existsSync(fullPath),
    path: fullPath,
    relative: filePath
  };
}

function checkDirectoryExists(dirPath) {
  const fullPath = path.join(__dirname, dirPath);
  return {
    exists: fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory(),
    path: fullPath,
    relative: dirPath
  };
}

function checkEnvVars() {
  require('dotenv').config();
  const missing = [];
  const present = [];
  
  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      present.push(envVar);
    } else {
      missing.push(envVar);
    }
  });
  
  return { missing, present };
}

function scanForIssues() {
  console.log('🔍 Scanning backend for missing files and potential issues...\n');
  
  // Check required files
  console.log('📋 Required Files:');
  const missingFiles = [];
  const presentFiles = [];
  
  requiredFiles.forEach(file => {
    const result = checkFileExists(file);
    if (result.exists) {
      presentFiles.push(file);
      console.log(`  ✅ ${file}`);
    } else {
      missingFiles.push(file);
      console.log(`  ❌ ${file} - MISSING`);
    }
  });
  
  console.log(`\n📊 Required Files Summary: ${presentFiles.length}/${requiredFiles.length} present`);
  
  // Check recommended files
  console.log('\n📋 Recommended Files:');
  const missingRecommended = [];
  const presentRecommended = [];
  
  recommendedFiles.forEach(file => {
    const result = checkFileExists(file);
    if (result.exists) {
      presentRecommended.push(file);
      console.log(`  ✅ ${file}`);
    } else {
      missingRecommended.push(file);
      console.log(`  ⚠️  ${file} - RECOMMENDED`);
    }
  });
  
  // Check environment variables
  console.log('\n🔧 Environment Variables:');
  const envCheck = checkEnvVars();
  
  envCheck.present.forEach(envVar => {
    console.log(`  ✅ ${envVar}`);
  });
  
  envCheck.missing.forEach(envVar => {
    console.log(`  ❌ ${envVar} - MISSING`);
  });
  
  // Check directories
  console.log('\n📁 Directory Structure:');
  const requiredDirs = [
    'services',
    'cron',
    'db',
    'api',
    'solidity/artifacts/contracts',
    'solidity/deployments'
  ];
  
  requiredDirs.forEach(dir => {
    const result = checkDirectoryExists(dir);
    if (result.exists) {
      console.log(`  ✅ ${dir}/`);
    } else {
      console.log(`  ❌ ${dir}/ - MISSING`);
    }
  });
  
  // Summary
  console.log('\n📊 SUMMARY:');
  console.log(`  Required Files: ${presentFiles.length}/${requiredFiles.length} present`);
  console.log(`  Recommended Files: ${presentRecommended.length}/${recommendedFiles.length} present`);
  console.log(`  Environment Variables: ${envCheck.present.length}/${requiredEnvVars.length} present`);
  
  if (missingFiles.length > 0) {
    console.log('\n❌ MISSING REQUIRED FILES:');
    missingFiles.forEach(file => console.log(`  - ${file}`));
  }
  
  if (envCheck.missing.length > 0) {
    console.log('\n❌ MISSING ENVIRONMENT VARIABLES:');
    envCheck.missing.forEach(envVar => console.log(`  - ${envVar}`));
  }
  
  if (missingRecommended.length > 0) {
    console.log('\n⚠️  MISSING RECOMMENDED FILES:');
    missingRecommended.forEach(file => console.log(`  - ${file}`));
  }
  
  // Check for potential issues
  console.log('\n🔍 Potential Issues:');
  
  // Check if .env exists but is empty
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.trim().length === 0) {
      console.log('  ⚠️  .env file exists but is empty');
    }
  }
  
  // Check package.json for required dependencies
  const packagePath = path.join(__dirname, 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const requiredDeps = ['ethers', 'pg', 'node-cron', 'dotenv'];
      const missingDeps = requiredDeps.filter(dep => !packageJson.dependencies?.[dep]);
      
      if (missingDeps.length > 0) {
        console.log(`  ⚠️  Missing dependencies: ${missingDeps.join(', ')}`);
      }
    } catch (error) {
      console.log('  ❌ Error reading package.json');
    }
  }
  
  // Check for executable permissions on process files
  const processFiles = [
    'cron/oddyssey-oracle-bot-process.js',
    'cron/oddyssey-creator-process.js',
    'cron/oddyssey-scheduler-process.js'
  ];
  
  processFiles.forEach(file => {
    const result = checkFileExists(file);
    if (result.exists) {
      try {
        fs.accessSync(result.path, fs.constants.X_OK);
        console.log(`  ✅ ${file} is executable`);
      } catch {
        console.log(`  ⚠️  ${file} is not executable (run: chmod +x ${file})`);
      }
    }
  });
  
  console.log('\n✅ Scan completed!');
  
  return {
    missingFiles,
    missingEnvVars: envCheck.missing,
    missingRecommended,
    totalIssues: missingFiles.length + envCheck.missing.length
  };
}

// Run the scan
if (require.main === module) {
  scanForIssues();
}

module.exports = { scanForIssues, checkFileExists, checkEnvVars };
