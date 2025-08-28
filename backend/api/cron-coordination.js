const express = require('express');
const router = express.Router();
const masterCoordinator = require('../cron/master-coordinator');
const cronCoordinator = require('../services/cron-coordinator');

// Get system status
router.get('/status', async (req, res) => {
  try {
    const status = await masterCoordinator.getSystemStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting coordination status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get coordination status',
      error: error.message
    });
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const healthCheck = await masterCoordinator.healthCheck();
    const statusCode = healthCheck.healthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: healthCheck.healthy,
      data: healthCheck
    });
  } catch (error) {
    console.error('Error in coordination health check:', error);
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Get execution history
router.get('/history', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const history = await masterCoordinator.getExecutionHistory(parseInt(limit));
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error getting execution history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get execution history',
      error: error.message
    });
  }
});

// Get performance metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await masterCoordinator.getPerformanceMetrics();
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance metrics',
      error: error.message
    });
  }
});

// Manual trigger endpoints (admin only)
router.post('/trigger/fixtures-refresh', async (req, res) => {
  try {
    const result = await masterCoordinator.triggerFixturesRefresh();
    
    res.json({
      success: true,
      message: 'Fixtures refresh triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering fixtures refresh:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger fixtures refresh',
      error: error.message
    });
  }
});

router.post('/trigger/odds-update', async (req, res) => {
  try {
    const result = await masterCoordinator.triggerOddsUpdate();
    
    res.json({
      success: true,
      message: 'Odds update triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering odds update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger odds update',
      error: error.message
    });
  }
});

router.post('/trigger/oddyssey-cycle', async (req, res) => {
  try {
    const result = await masterCoordinator.triggerOddysseyNewCycle();
    
    res.json({
      success: true,
      message: 'Oddyssey new cycle triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering Oddyssey new cycle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger Oddyssey new cycle',
      error: error.message
    });
  }
});

router.post('/trigger/oddyssey-matches', async (req, res) => {
  try {
    const result = await masterCoordinator.triggerOddysseyMatchSelection();
    
    res.json({
      success: true,
      message: 'Oddyssey match selection triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering Oddyssey match selection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger Oddyssey match selection',
      error: error.message
    });
  }
});

router.post('/trigger/oddyssey-resolution', async (req, res) => {
  try {
    const result = await masterCoordinator.triggerOddysseyResolution();
    
    res.json({
      success: true,
      message: 'Oddyssey resolution triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering Oddyssey resolution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger Oddyssey resolution',
      error: error.message
    });
  }
});

router.post('/trigger/results-fetching', async (req, res) => {
  try {
    const result = await masterCoordinator.triggerResultsFetching();
    
    res.json({
      success: true,
      message: 'Results fetching triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering results fetching:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger results fetching',
      error: error.message
    });
  }
});

router.post('/trigger/results-resolution', async (req, res) => {
  try {
    const result = await masterCoordinator.triggerResultsResolution();
    
    res.json({
      success: true,
      message: 'Results resolution triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering results resolution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger results resolution',
      error: error.message
    });
  }
});

// Emergency endpoints
router.post('/emergency/force-release-locks', async (req, res) => {
  try {
    const result = await masterCoordinator.forceReleaseAllLocks();
    
    res.json({
      success: true,
      message: 'All locks force released',
      data: result
    });
  } catch (error) {
    console.error('Error force releasing locks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to force release locks',
      error: error.message
    });
  }
});

router.post('/emergency/restart', async (req, res) => {
  try {
    // Start restart in background to avoid request timeout
    setImmediate(async () => {
      try {
        await masterCoordinator.restart();
        console.log('✅ Master coordinator restarted successfully');
      } catch (error) {
        console.error('❌ Failed to restart master coordinator:', error);
      }
    });
    
    res.json({
      success: true,
      message: 'Master coordinator restart initiated'
    });
  } catch (error) {
    console.error('Error initiating restart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate restart',
      error: error.message
    });
  }
});

// Get specific job execution history
router.get('/history/:jobName', async (req, res) => {
  try {
    const { jobName } = req.params;
    const { limit = 20 } = req.query;
    
    const history = await cronCoordinator.getExecutionHistory(jobName, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        jobName,
        history
      }
    });
  } catch (error) {
    console.error('Error getting job execution history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job execution history',
      error: error.message
    });
  }
});

// Force release specific lock
router.post('/locks/:jobName/release', async (req, res) => {
  try {
    const { jobName } = req.params;
    const result = await cronCoordinator.forceReleaseLock(jobName);
    
    res.json({
      success: true,
      message: result ? 'Lock released successfully' : 'No lock found for job',
      data: { jobName, released: result }
    });
  } catch (error) {
    console.error('Error releasing lock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to release lock',
      error: error.message
    });
  }
});

// Check if specific job is locked
router.get('/locks/:jobName/status', async (req, res) => {
  try {
    const { jobName } = req.params;
    const isLocked = await cronCoordinator.isLocked(jobName);
    
    res.json({
      success: true,
      data: {
        jobName,
        isLocked,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error checking lock status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check lock status',
      error: error.message
    });
  }
});

module.exports = router;