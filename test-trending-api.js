const db = require('./backend/db/db');

async function testTrendingAPI() {
  try {
    console.log('🔍 Testing Trending Pools API...');
    
    // Test database connection
    console.log('📊 Testing database connection...');
    const testQuery = await db.query('SELECT NOW() as current_time');
    console.log('✅ Database connected:', testQuery.rows[0]);
    
    // Check if analytics.pools table exists
    console.log('📋 Checking analytics.pools table...');
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'analytics' 
        AND table_name = 'pools'
      ) as table_exists
    `);
    console.log('📋 analytics.pools table exists:', tableCheck.rows[0].table_exists);
    
    if (tableCheck.rows[0].table_exists) {
      // Check table structure
      console.log('🔍 Checking table structure...');
      const structureCheck = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'analytics' 
        AND table_name = 'pools'
        ORDER BY ordinal_position
      `);
      console.log('📋 Table columns:', structureCheck.rows.map(r => `${r.column_name} (${r.data_type})`));
      
      // Check if there's any data
      console.log('📊 Checking for data...');
      const dataCheck = await db.query('SELECT COUNT(*) as count FROM analytics.pools');
      console.log('📊 Total rows in analytics.pools:', dataCheck.rows[0].count);
      
      if (parseInt(dataCheck.rows[0].count) > 0) {
        // Try the trending query
        console.log('🚀 Testing trending query...');
        const trendingQuery = `
          SELECT 
            pa.pool_id,
            pa.creator_address,
            pa.odds,
            pa.is_settled,
            pa.creator_side_won,
            pa.is_private,
            pa.uses_bitr,
            pa.oracle_type,
            pa.market_id,
            pa.predicted_outcome,
            pa.actual_result,
            pa.creator_stake,
            pa.total_creator_side_stake,
            pa.total_bettor_stake,
            pa.max_bettor_stake,
            pa.event_start_time,
            pa.event_end_time,
            pa.betting_end_time,
            pa.created_at,
            pa.settled_at,
            pa.category,
            pa.league,
            pa.region
          FROM analytics.pools pa
          WHERE pa.is_settled = FALSE 
            AND pa.event_start_time > NOW() 
            AND pa.betting_end_time > NOW()
          ORDER BY pa.created_at DESC
          LIMIT 3
        `;
        
        const result = await db.query(trendingQuery);
        console.log('✅ Trending query successful');
        console.log('📊 Found pools:', result.rows.length);
        console.log('📋 Sample pool:', result.rows[0] || 'No pools found');
      } else {
        console.log('⚠️ No data in analytics.pools table');
        
        // Check if there's data in other pool tables
        console.log('🔍 Checking other pool tables...');
        const otherTables = ['oracle.pools', 'prediction.pools'];
        
        for (const table of otherTables) {
          try {
            const count = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`📊 ${table}: ${count.rows[0].count} rows`);
          } catch (error) {
            console.log(`❌ ${table}: ${error.message}`);
          }
        }
      }
    } else {
      console.log('❌ analytics.pools table does not exist');
    }
    
  } catch (error) {
    console.error('❌ Error testing trending API:', error);
  } finally {
    // db.end() is not available in this connection pool
    console.log('✅ Test completed successfully');
  }
}

testTrendingAPI();
