const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Neon.tech database configuration
const DATABASE_URL = 'postgresql://neondb_owner:npg_RSgeyExdq7O8@ep-proud-unit-a2nqswvi-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function setupNeonDatabase() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔌 Connecting to Neon.tech database...');
        await client.connect();
        console.log('✅ Connected to Neon.tech database successfully!');

        // Read the perfect schema SQL file
        const schemaPath = path.join(__dirname, '../database/perfect-schema.sql');
        console.log(`📖 Reading schema file: ${schemaPath}`);
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found: ${schemaPath}`);
        }

        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
        console.log(`📄 Schema file loaded (${schemaSQL.length} characters)`);

        // Split the SQL into individual statements
        const statements = schemaSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        console.log(`🔧 Found ${statements.length} SQL statements to execute`);

        // Execute each statement
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            
            // Skip empty statements and comments
            if (!statement || statement.startsWith('--')) {
                continue;
            }

            try {
                console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
                await client.query(statement);
                successCount++;
                
                // Log progress every 10 statements
                if ((i + 1) % 10 === 0) {
                    console.log(`📊 Progress: ${i + 1}/${statements.length} statements executed`);
                }
            } catch (error) {
                errorCount++;
                console.error(`❌ Error executing statement ${i + 1}:`, error.message);
                
                // Continue with other statements unless it's a critical error
                if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
                    console.log(`⚠️  Statement ${i + 1} skipped (already exists)`);
                } else {
                    console.error(`🔍 Statement that failed:`, statement.substring(0, 100) + '...');
                }
            }
        }

        console.log('\n📊 Database Setup Summary:');
        console.log(`✅ Successful statements: ${successCount}`);
        console.log(`❌ Failed statements: ${errorCount}`);
        console.log(`📈 Success rate: ${((successCount / (successCount + errorCount)) * 100).toFixed(2)}%`);

        // Verify the setup by checking for key schemas and tables
        console.log('\n🔍 Verifying database setup...');
        
        const verificationQueries = [
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('oracle', 'oddyssey', 'analytics', 'core', 'system', 'crypto', 'airdrop', 'prediction', 'neon_auth')",
            "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema IN ('oracle', 'oddyssey', 'analytics', 'core', 'system', 'crypto', 'airdrop', 'prediction', 'neon_auth')",
            "SELECT table_schema, COUNT(*) as tables FROM information_schema.tables WHERE table_schema IN ('oracle', 'oddyssey', 'analytics', 'core', 'system', 'crypto', 'airdrop', 'prediction', 'neon_auth') GROUP BY table_schema ORDER BY table_schema"
        ];

        for (const query of verificationQueries) {
            try {
                const result = await client.query(query);
                console.log('✅ Verification query result:', result.rows);
            } catch (error) {
                console.error('❌ Verification query failed:', error.message);
            }
        }

        console.log('\n🎉 Neon.tech database setup completed!');
        console.log('📝 Next steps:');
        console.log('1. Update your .env file with the new DATABASE_URL');
        console.log('2. Run your indexers to start populating the database');
        console.log('3. Test your API endpoints with the new database');

    } catch (error) {
        console.error('❌ Database setup failed:', error);
        throw error;
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run the setup if this script is executed directly
if (require.main === module) {
    setupNeonDatabase()
        .then(() => {
            console.log('✅ Neon.tech database setup completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Neon.tech database setup failed:', error);
            process.exit(1);
        });
}

module.exports = { setupNeonDatabase };
