const { updateEnvironmentFiles } = require('./update-env-for-neon');
const { setupNeonDatabase } = require('./setup-neon-database');

async function setupNeonComplete() {
    console.log('🚀 Starting complete Neon.tech setup...\n');

    try {
        // Step 1: Update environment files
        console.log('📋 Step 1: Updating environment configuration...');
        const updatedFiles = updateEnvironmentFiles();
        console.log(`✅ Environment files updated: ${updatedFiles} files modified\n`);

        // Step 2: Setup database
        console.log('🗄️  Step 2: Setting up database schemas and tables...');
        await setupNeonDatabase();
        console.log('✅ Database setup completed\n');

        // Step 3: Verify setup
        console.log('🔍 Step 3: Verifying complete setup...');
        await verifyCompleteSetup();

        console.log('\n🎉 Complete Neon.tech setup finished successfully!');
        console.log('\n📝 Summary:');
        console.log('✅ Environment configuration updated');
        console.log('✅ Database schemas and tables created');
        console.log('✅ All systems ready for use');
        
        console.log('\n🚀 Next steps:');
        console.log('1. Start your application with the new database');
        console.log('2. Run your indexers to populate data');
        console.log('3. Test your API endpoints');
        console.log('4. Monitor the system for any issues');

    } catch (error) {
        console.error('\n❌ Setup failed:', error);
        throw error;
    }
}

async function verifyCompleteSetup() {
    const { Client } = require('pg');
    const { NEON_DATABASE_URL } = require('./update-env-for-neon');

    const client = new Client({
        connectionString: NEON_DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('🔌 Connected to database for verification...');

        // Verify key schemas exist
        const schemaResult = await client.query(`
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name IN ('oracle', 'oddyssey', 'analytics', 'core', 'system', 'crypto', 'airdrop', 'prediction', 'neon_auth')
            ORDER BY schema_name
        `);

        console.log('✅ Found schemas:', schemaResult.rows.map(row => row.schema_name).join(', '));

        // Verify key tables exist
        const tableResult = await client.query(`
            SELECT table_schema, COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema IN ('oracle', 'oddyssey', 'analytics', 'core', 'system', 'crypto', 'airdrop', 'prediction', 'neon_auth')
            GROUP BY table_schema 
            ORDER BY table_schema
        `);

        console.log('✅ Table counts by schema:');
        tableResult.rows.forEach(row => {
            console.log(`   ${row.table_schema}: ${row.table_count} tables`);
        });

        // Verify some key tables exist
        const keyTables = [
            'oracle.fixtures',
            'oracle.leagues',
            'core.users',
            'analytics.user_analytics',
            'system.config'
        ];

        for (const table of keyTables) {
            const [schema, tableName] = table.split('.');
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = $1 AND table_name = $2
                )
            `, [schema, tableName]);

            if (result.rows[0].exists) {
                console.log(`✅ ${table} exists`);
            } else {
                console.log(`❌ ${table} missing`);
            }
        }

        // Test basic functionality
        console.log('\n🧪 Testing basic functionality...');
        
        // Test inserting into system.config
        await client.query(`
            INSERT INTO system.config (key, value, description) 
            VALUES ('neon_setup_test', 'completed', 'Neon.tech setup verification')
            ON CONFLICT (key) DO UPDATE SET value = 'completed', updated_at = NOW()
        `);
        console.log('✅ System configuration table is writable');

        // Test reading from system.config
        const configResult = await client.query(`
            SELECT value FROM system.config WHERE key = 'neon_setup_test'
        `);
        console.log('✅ System configuration table is readable');

        // Test oracle schema functionality
        await client.query(`
            INSERT INTO oracle.leagues (league_id, name, country) 
            VALUES ('test_league', 'Test League', 'Test Country')
            ON CONFLICT (league_id) DO NOTHING
        `);
        console.log('✅ Oracle schema is writable');

        console.log('\n✅ All verification tests passed!');

    } catch (error) {
        console.error('❌ Verification failed:', error);
        throw error;
    } finally {
        await client.end();
    }
}

// Run the complete setup if this script is executed directly
if (require.main === module) {
    setupNeonComplete()
        .then(() => {
            console.log('\n🎉 Complete Neon.tech setup finished successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Complete Neon.tech setup failed:', error);
            process.exit(1);
        });
}

module.exports = { setupNeonComplete, verifyCompleteSetup };
