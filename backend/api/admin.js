const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/admin-auth');
const config = require('../config');
const SportMonksService = require('../services/sportmonks');

/**
 * Admin API routes
 * All routes require admin authentication
 */

// Apply admin authentication to all routes
router.use(adminAuth);

/**
 * GET /api/admin/status
 * Get system status (admin only)
 */
router.get('/status', async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      config: {
        blockchain: {
          chainId: config.blockchain.chainId,
          rpcUrl: config.blockchain.rpcUrl ? 'configured' : 'not configured',
          startBlock: config.blockchain.startBlock
        },
        database: {
          host: config.database.host,
          name: config.database.name,
          port: config.database.port
        },
        api: {
          port: config.api.port,
          adminKey: config.api.adminKey ? 'configured' : 'not configured'
        }
      }
    };
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Admin status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/health
 * Get detailed health check (admin only)
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      services: {
        database: 'unknown', // Could be enhanced to actually check DB connection
        blockchain: 'unknown', // Could be enhanced to actually check RPC connection
        api: 'healthy'
      },
      metrics: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Admin health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/fixtures/refresh
 * Manually fetch and save 7 days of fixtures (admin only)
 */
router.post('/fixtures/refresh', async (req, res) => {
  try {
    console.log('🔄 Admin requested manual fixtures refresh...');
    
    const sportmonksService = new SportMonksService();
    const result = await sportmonksService.fetchAndSave7DayFixtures();
    
    res.json({
      success: true,
      message: 'Fixtures refresh completed successfully',
      data: {
        fixturesCount: result.fixturesCount || 0,
        savedCount: result.savedCount || 0,
        updatedCount: result.updatedCount || 0,
        errors: result.errors || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin fixtures refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Fixtures refresh failed',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/restart
 * Trigger application restart (admin only)
 * Note: This is a placeholder - actual restart would need to be implemented
 */
router.post('/restart', async (req, res) => {
  try {
    // In a real implementation, this would trigger a graceful restart
    // For now, we'll just return a success message
    res.json({
      success: true,
      message: 'Restart command received (placeholder)',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin restart error:', error);
    res.status(500).json({
      success: false,
      error: 'Restart failed',
      message: error.message
    });
  }
});

module.exports = router;
