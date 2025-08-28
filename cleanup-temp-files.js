#!/usr/bin/env node

/**
 * CLEANUP TEMPORARY FIX FILES
 * Removes all temporary database fix files and documentation created during debugging
 */

const fs = require('fs');
const path = require('path');

class ProjectCleanup {
    constructor() {
        this.filesToRemove = [];
        this.keptFiles = [];
        
        // Patterns for files to remove
        this.removePatterns = [
            // Temporary fix scripts
            /.*fix.*\.sql$/i,
            /.*emergency.*\.sql$/i,
            /.*production.*fix.*\.sql$/i,
            /.*critical.*\.sql$/i,
            /.*master.*fix.*\.sql$/i,
            /.*intelligent.*fix.*\.sql$/i,
            /.*simple.*fix.*\.sql$/i,
            /.*reset.*\.sql$/i,
            
            // Temporary JS fix files
            /.*fix.*\.js$/i,
            /.*check.*state.*\.js$/i,
            /.*verify.*\.js$/i,
            /.*comprehensive.*scanner.*\.js$/i,
            /.*foreign.*key.*\.js$/i,
            /.*apply.*fixes.*\.js$/i,
            
            // Temporary documentation files
            /.*FIXES.*\.md$/i,
            /.*FIX.*REPORT.*\.md$/i,
            /.*EMERGENCY.*\.md$/i,
            /.*PRODUCTION.*ANALYSIS.*\.md$/i,
            /.*IMPLEMENTATION.*\.md$/i,
            /.*AUDIT.*REPORT.*\.md$/i,
            /.*COMPLETE.*DATABASE.*\.md$/i,
            
            // Test files created during debugging
            /^test-.*\.js$/i,
            /.*cleanup.*temporary.*\.sql$/i,
            /.*add-status-column.*\.sql$/i
        ];
        
        // Files to definitely keep (important for the project)
        this.keepPatterns = [
            /^README\.md$/i,
            /package\.json$/i,
            /package-lock\.json$/i,
            /\.env$/i,
            /\.gitignore$/i,
            /hardhat\.config\.js$/i,
            /docker-compose.*\.yml$/i,
            /setup\.sh$/i,
            /setup-prisma\.sh$/i,
            
            // Keep legitimate project files
            /^backend\/db\/schema\.sql$/i,
            /^backend\/db\/.*_schema\.sql$/i,
            /^backend\/prisma\/schema\.prisma$/i,
            /^backend\/migrations\/.*\.sql$/i, // Keep real migrations
            /^backend\/services\/.*\.js$/i, // Keep actual services
            /^backend\/api\/.*\.js$/i, // Keep API files
            /^backend\/config\/.*\.js$/i, // Keep config files
            /^backend\/db\/db\.js$/i, // Keep DB connection
            
            // Keep the intelligent scanner (it's useful for future)
            /intelligent-db-scanner\.js$/i,
            /verify-complete-database\.js$/i
        ];
    }

    scanDirectory(dir = './') {
        console.log(`🔍 Scanning ${dir} for temporary files...`);
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'generated') {
                continue;
            }
            
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative('./', fullPath);
            
            if (entry.isDirectory()) {
                this.scanDirectory(fullPath);
            } else {
                this.analyzeFile(relativePath);
            }
        }
    }

    analyzeFile(filePath) {
        const fileName = path.basename(filePath);
        
        // Check if file should be kept
        const shouldKeep = this.keepPatterns.some(pattern => pattern.test(filePath) || pattern.test(fileName));
        if (shouldKeep) {
            this.keptFiles.push(filePath);
            return;
        }
        
        // Check if file should be removed
        const shouldRemove = this.removePatterns.some(pattern => pattern.test(fileName));
        if (shouldRemove) {
            this.filesToRemove.push(filePath);
            return;
        }
        
        // If uncertain, keep it
        this.keptFiles.push(filePath);
    }

    printReport() {
        console.log('\n📊 CLEANUP ANALYSIS REPORT');
        console.log('===========================');
        
        console.log(`\n🗑️  FILES TO REMOVE (${this.filesToRemove.length}):`);
        if (this.filesToRemove.length === 0) {
            console.log('   No temporary files found to remove.');
        } else {
            this.filesToRemove.forEach(file => {
                console.log(`   ❌ ${file}`);
            });
        }
        
        console.log(`\n✅ KEEPING (${this.keptFiles.length} files)`);
        console.log('   All important project files will be preserved.');
    }

    async performCleanup() {
        if (this.filesToRemove.length === 0) {
            console.log('\n✨ Directory is already clean!');
            return;
        }
        
        console.log('\n🧹 PERFORMING CLEANUP...');
        
        let removedCount = 0;
        let failedCount = 0;
        
        for (const filePath of this.filesToRemove) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`   ✅ Removed: ${filePath}`);
                    removedCount++;
                } else {
                    console.log(`   ⚠️  Not found: ${filePath}`);
                }
            } catch (error) {
                console.log(`   ❌ Failed to remove ${filePath}: ${error.message}`);
                failedCount++;
            }
        }
        
        console.log(`\n🎉 CLEANUP COMPLETE!`);
        console.log(`   ✅ Removed: ${removedCount} files`);
        if (failedCount > 0) {
            console.log(`   ❌ Failed: ${failedCount} files`);
        }
        console.log(`   📁 Directory is now clean and deployment-ready!`);
    }

    async run() {
        console.log('🧹 PROJECT CLEANUP TOOL');
        console.log('========================');
        
        this.scanDirectory();
        this.printReport();
        
        if (this.filesToRemove.length > 0) {
            await this.performCleanup();
        }
        
        // Check for any remaining development artifacts
        console.log('\n🔍 Final verification...');
        const remainingTempFiles = this.keptFiles.filter(file => 
            file.includes('test-') || 
            file.includes('temp') || 
            file.includes('debug') ||
            file.includes('old')
        );
        
        if (remainingTempFiles.length > 0) {
            console.log('\n⚠️  Potential remaining temporary files:');
            remainingTempFiles.forEach(file => console.log(`   ? ${file}`));
            console.log('   Review these manually if needed.');
        } else {
            console.log('✅ No additional temporary files detected.');
        }
    }
}

async function main() {
    const cleanup = new ProjectCleanup();
    await cleanup.run();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ProjectCleanup;
