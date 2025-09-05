const fs = require('fs');
const path = require('path');

// Neon.tech database URL
const NEON_DATABASE_URL = 'postgresql://neondb_owner:npg_RSgeyExdq7O8@ep-proud-unit-a2nqswvi-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

function updateEnvironmentFiles() {
    console.log('🔧 Updating environment configuration for Neon.tech...');

    // List of environment files to update
    const envFiles = [
        '.env',
        '.env.local',
        '.env.development',
        '.env.production',
        'backend/.env',
        'backend/.env.local',
        'backend/.env.development',
        'backend/.env.production'
    ];

    let updatedFiles = 0;

    for (const envFile of envFiles) {
        const envPath = path.join(process.cwd(), envFile);
        
        if (fs.existsSync(envPath)) {
            try {
                console.log(`📝 Updating ${envFile}...`);
                
                let content = fs.readFileSync(envPath, 'utf8');
                let updated = false;

                // Check if DATABASE_URL already exists
                if (content.includes('DATABASE_URL=')) {
                    // Update existing DATABASE_URL
                    content = content.replace(
                        /DATABASE_URL=.*/g,
                        `DATABASE_URL="${NEON_DATABASE_URL}"`
                    );
                    updated = true;
                } else {
                    // Add DATABASE_URL if it doesn't exist
                    content += `\nDATABASE_URL="${NEON_DATABASE_URL}"\n`;
                    updated = true;
                }

                // Also update any other database-related variables
                if (content.includes('DB_URL=')) {
                    content = content.replace(
                        /DB_URL=.*/g,
                        `DB_URL="${NEON_DATABASE_URL}"`
                    );
                    updated = true;
                }

                if (content.includes('POSTGRES_URL=')) {
                    content = content.replace(
                        /POSTGRES_URL=.*/g,
                        `POSTGRES_URL="${NEON_DATABASE_URL}"`
                    );
                    updated = true;
                }

                // Write the updated content back
                fs.writeFileSync(envPath, content);
                
                if (updated) {
                    console.log(`✅ Updated ${envFile}`);
                    updatedFiles++;
                } else {
                    console.log(`ℹ️  No changes needed for ${envFile}`);
                }

            } catch (error) {
                console.error(`❌ Error updating ${envFile}:`, error.message);
            }
        } else {
            console.log(`ℹ️  ${envFile} not found, skipping...`);
        }
    }

    // Update Prisma schema if it exists
    const prismaSchemaPath = path.join(process.cwd(), 'backend/prisma/schema.prisma');
    if (fs.existsSync(prismaSchemaPath)) {
        try {
            console.log('📝 Updating Prisma schema...');
            
            let prismaContent = fs.readFileSync(prismaSchemaPath, 'utf8');
            
            // Update the datasource url
            if (prismaContent.includes('url = env("DATABASE_URL")')) {
                console.log('✅ Prisma schema already uses DATABASE_URL environment variable');
            } else if (prismaContent.includes('url = ')) {
                // Replace hardcoded URL with environment variable
                prismaContent = prismaContent.replace(
                    /url = ".*"/g,
                    'url = env("DATABASE_URL")'
                );
                fs.writeFileSync(prismaSchemaPath, prismaContent);
                console.log('✅ Updated Prisma schema to use DATABASE_URL environment variable');
                updatedFiles++;
            }
        } catch (error) {
            console.error('❌ Error updating Prisma schema:', error.message);
        }
    }

    // Create a .env.example file if it doesn't exist
    const envExamplePath = path.join(process.cwd(), '.env.example');
    if (!fs.existsSync(envExamplePath)) {
        try {
            console.log('📝 Creating .env.example file...');
            
            const exampleContent = `# Database Configuration
DATABASE_URL="${NEON_DATABASE_URL}"

# Blockchain Configuration
WEB3_PROVIDER_URL="https://testnet-rpc.monad.xyz/"
FALLBACK_RPC_URL="https://frosty-summer-model.monad-testnet.quiknode.pro/bfedff2990828aad13692971d0dbed22de3c9783/"
CHAIN_ID=10143

# API Keys
SPORTMONKS_API_TOKEN=""
COINPAPRIKA_API_KEY=""

# Admin Configuration
ADMIN_WALLET_ADDRESS=""

# System Configuration
NODE_ENV="development"
PORT=3000
`;

            fs.writeFileSync(envExamplePath, exampleContent);
            console.log('✅ Created .env.example file');
            updatedFiles++;
        } catch (error) {
            console.error('❌ Error creating .env.example:', error.message);
        }
    }

    console.log(`\n📊 Environment Update Summary:`);
    console.log(`✅ Updated ${updatedFiles} files`);
    console.log(`🔗 New DATABASE_URL: ${NEON_DATABASE_URL}`);
    
    console.log('\n📝 Next steps:');
    console.log('1. Review the updated environment files');
    console.log('2. Run the database setup script: node backend/scripts/setup-neon-database.js');
    console.log('3. Test the database connection');
    console.log('4. Update your application configuration if needed');

    return updatedFiles;
}

// Run the update if this script is executed directly
if (require.main === module) {
    updateEnvironmentFiles();
}

module.exports = { updateEnvironmentFiles, NEON_DATABASE_URL };
