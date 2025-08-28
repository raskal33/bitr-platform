const db = require('../db/db');
const { EventEmitter } = require('events');

/**
 * System Monitor Service
 * 
 * Monitors the health of all resolution services, cron jobs, and result fetching operations.
 * Provides real-time status, failure detection, and alerting capabilities.
 */
class SystemMonitor extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.monitoringInterval = 5 * 60 * 1000; // 5 minutes
    this.monitoringTimer = null;
    this.healthChecks = new Map();
    this.alertThresholds = {
      resultsFetching: {
        consecutiveFailures: 3,
        maxProcessingTime: 10 * 60 * 1000, // 10 minutes
        minSuccessRate: 0.8 // 80%
      },
      resolutionServices: {
        consecutiveFailures: 2,
        maxProcessingTime: 5 * 60 * 1000, // 5 minutes
        minSuccessRate: 0.9 // 90%
      },
      cronJobs: {
        maxMissedRuns: 2,
        maxExecutionTime: 15 * 60 * 1000, // 15 minutes
        minUptime: 0.95 // 95%
      }
    };
    
    // Initialize health check registry
    this.initializeHealthChecks();
  }

  /**
   * Initialize all health checks
   */
  initializeHealthChecks() {
    // Results Fetching Health Checks
    this.registerHealthCheck('results-fetching', {
      name: 'Results Fetching Service',
      category: 'results',
      check: () => this.checkResultsFetchingHealth(),
      critical: true
    });

    // Resolution Services Health Checks
    this.registerHealthCheck('oddyssey-resolution', {
      name: 'Oddyssey Resolution Service',
      category: 'resolution',
      check: () => this.checkOddysseyResolutionHealth(),
      critical: true
    });

    this.registerHealthCheck('football-resolution', {
      name: 'Football Resolution Service',
      category: 'resolution',
      check: () => this.checkFootballResolutionHealth(),
      critical: true
    });

    this.registerHealthCheck('crypto-resolution', {
      name: 'Crypto Resolution Service',
      category: 'resolution',
      check: () => this.checkCryptoResolutionHealth(),
      critical: true
    });

    // Cron Jobs Health Checks
    this.registerHealthCheck('results-fetcher-cron', {
      name: 'Results Fetcher Cron Job',
      category: 'cron',
      check: () => this.checkCronJobHealth('results-fetching'),
      critical: true
    });

    this.registerHealthCheck('results-resolution-cron', {
      name: 'Results Resolution Cron Job',
      category: 'cron',
      check: () => this.checkCronJobHealth('results-resolution'),
      critical: true
    });

    this.registerHealthCheck('oddyssey-cycle-cron', {
      name: 'Oddyssey Cycle Cron Job',
      category: 'cron',
      check: () => this.checkCronJobHealth('oddyssey-cycle'),
      critical: true
    });

    // Cycle-specific health checks
    this.registerHealthCheck('cycle-monitor', {
      name: 'Cycle Monitor',
      category: 'cycle',
      check: () => this.checkCycleHealth(),
      critical: true
    });

    // Database Health Checks
    this.registerHealthCheck('database-connection', {
      name: 'Database Connection',
      category: 'infrastructure',
      check: () => this.checkDatabaseHealth(),
      critical: true
    });

    // API Health Checks
    this.registerHealthCheck('sportmonks-api', {
      name: 'SportMonks API',
      category: 'external',
      check: () => this.checkSportMonksAPIHealth(),
      critical: false
    });

    this.registerHealthCheck('coinpaprika-api', {
      name: 'Coinpaprika API',
      category: 'external',
      check: () => this.checkCoinpaprikaAPIHealth(),
      critical: false
    });
  }

  /**
   * Register a health check
   */
  registerHealthCheck(id, config) {
    this.healthChecks.set(id, {
      ...config,
      id,
      status: 'unknown',
      lastCheck: null,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalChecks: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      averageResponseTime: 0,
      alerts: []
    });
  }

  /**
   * Start monitoring
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ System monitor already running');
      return;
    }

    this.isRunning = true;
    console.log('🔍 Starting system monitor...');

    // Run initial health check
    await this.runHealthChecks();

    // Start periodic monitoring
    this.monitoringTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.runHealthChecks();
      }
    }, this.monitoringInterval);

    console.log('✅ System monitor started successfully');
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.isRunning = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    console.log('⏹️ System monitor stopped');
  }

  /**
   * Run all health checks
   */
  async runHealthChecks() {
    console.log('🔍 Running system health checks...');
    
    const results = [];
    const startTime = Date.now();

    for (const [id, healthCheck] of this.healthChecks) {
      try {
        const checkStartTime = Date.now();
        const result = await healthCheck.check();
        const responseTime = Date.now() - checkStartTime;

        // Update health check status
        this.updateHealthCheckStatus(id, result, responseTime);
        
        results.push({
          id,
          name: healthCheck.name,
          status: result.status,
          responseTime,
          details: result.details,
          timestamp: new Date()
        });

      } catch (error) {
        console.error(`❌ Health check failed for ${id}:`, error);
        
        // Update health check status as failed
        this.updateHealthCheckStatus(id, {
          status: 'error',
          details: { error: error.message }
        }, 0);
        
        results.push({
          id,
          name: this.healthChecks.get(id)?.name || id,
          status: 'error',
          responseTime: 0,
          details: { error: error.message },
          timestamp: new Date()
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Health checks completed in ${totalTime}ms`);

    // Emit monitoring event
    this.emit('healthChecksCompleted', {
      results,
      totalTime,
      timestamp: new Date()
    });

    return results;
  }

  /**
   * Update health check status
   */
  updateHealthCheckStatus(id, result, responseTime) {
    const healthCheck = this.healthChecks.get(id);
    if (!healthCheck) return;

    const now = new Date();
    healthCheck.lastCheck = now;
    healthCheck.totalChecks++;

    if (result.status === 'healthy') {
      healthCheck.status = 'healthy';
      healthCheck.lastSuccess = now;
      healthCheck.consecutiveSuccesses++;
      healthCheck.consecutiveFailures = 0;
      healthCheck.totalSuccesses++;
    } else {
      healthCheck.status = result.status;
      healthCheck.lastFailure = now;
      healthCheck.consecutiveFailures++;
      healthCheck.consecutiveSuccesses = 0;
      healthCheck.totalFailures++;
    }

    // Update average response time
    healthCheck.averageResponseTime = 
      (healthCheck.averageResponseTime * (healthCheck.totalChecks - 1) + responseTime) / healthCheck.totalChecks;

    // Check for alerts
    this.checkForAlerts(id, healthCheck, result);
  }

  /**
   * Check for alerts based on thresholds
   */
  checkForAlerts(id, healthCheck, result) {
    const alerts = [];

    // Check consecutive failures
    if (healthCheck.category === 'results') {
      const threshold = this.alertThresholds.resultsFetching.consecutiveFailures;
      if (healthCheck.consecutiveFailures >= threshold) {
        alerts.push({
          type: 'consecutive_failures',
          severity: 'critical',
          message: `${healthCheck.name} has failed ${healthCheck.consecutiveFailures} consecutive times`,
          threshold,
          current: healthCheck.consecutiveFailures
        });
      }
    } else if (healthCheck.category === 'resolution') {
      const threshold = this.alertThresholds.resolutionServices.consecutiveFailures;
      if (healthCheck.consecutiveFailures >= threshold) {
        alerts.push({
          type: 'consecutive_failures',
          severity: 'critical',
          message: `${healthCheck.name} has failed ${healthCheck.consecutiveFailures} consecutive times`,
          threshold,
          current: healthCheck.consecutiveFailures
        });
      }
    }

    // Check response time
    if (healthCheck.averageResponseTime > this.alertThresholds.resultsFetching.maxProcessingTime) {
      alerts.push({
        type: 'slow_response',
        severity: 'warning',
        message: `${healthCheck.name} is responding slowly (${Math.round(healthCheck.averageResponseTime)}ms)`,
        threshold: this.alertThresholds.resultsFetching.maxProcessingTime,
        current: healthCheck.averageResponseTime
      });
    }

    // Check success rate
    const successRate = healthCheck.totalSuccesses / healthCheck.totalChecks;
    const minSuccessRate = this.alertThresholds.resultsFetching.minSuccessRate;
    if (successRate < minSuccessRate && healthCheck.totalChecks > 10) {
      alerts.push({
        type: 'low_success_rate',
        severity: 'warning',
        message: `${healthCheck.name} has low success rate (${(successRate * 100).toFixed(1)}%)`,
        threshold: minSuccessRate * 100,
        current: successRate * 100
      });
    }

    // Store alerts
    healthCheck.alerts = alerts;

    // Emit alerts
    if (alerts.length > 0) {
      this.emit('alert', {
        healthCheckId: id,
        healthCheckName: healthCheck.name,
        alerts,
        timestamp: new Date()
      });
    }
  }

  /**
   * Check results fetching health
   */
  async checkResultsFetchingHealth() {
    try {
      // Check recent results fetching activity
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_operations,
          COUNT(*) FILTER (WHERE success = true) as successful_operations,
          COUNT(*) FILTER (WHERE success = false) as failed_operations,
          AVG(processing_time_ms) as avg_processing_time,
          MAX(created_at) as last_operation
        FROM oracle.results_fetching_logs
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      const stats = result.rows[0];
      const successRate = stats.total_operations > 0 ? 
        stats.successful_operations / stats.total_operations : 1;

      // Check if there are pending results to fetch
      const pendingResult = await db.query(`
        SELECT COUNT(*) as pending_count
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.match_date < NOW() - INTERVAL '1 hour'
        AND fr.fixture_id IS NULL
        AND f.status NOT IN ('NS', 'CANC', 'POST')
      `);

      const pendingCount = parseInt(pendingResult.rows[0].pending_count);

      return {
        status: successRate >= 0.8 ? 'healthy' : 'degraded',
        details: {
          totalOperations: parseInt(stats.total_operations),
          successfulOperations: parseInt(stats.successful_operations),
          failedOperations: parseInt(stats.failed_operations),
          successRate: successRate,
          averageProcessingTime: parseFloat(stats.avg_processing_time) || 0,
          lastOperation: stats.last_operation,
          pendingResults: pendingCount
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Oddyssey resolution health
   */
  async checkOddysseyResolutionHealth() {
    try {
      // Check recent resolution activity
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(*) FILTER (WHERE is_resolved = true) as resolved_cycles,
          COUNT(*) FILTER (WHERE is_resolved = false AND cycle_end_time < NOW()) as pending_resolution,
          MAX(resolved_at) as last_resolution
        FROM oracle.oddyssey_cycles
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats = result.rows[0];
      const resolutionRate = stats.total_cycles > 0 ? 
        stats.resolved_cycles / stats.total_cycles : 1;

      return {
        status: resolutionRate >= 0.9 ? 'healthy' : 'degraded',
        details: {
          totalCycles: parseInt(stats.total_cycles),
          resolvedCycles: parseInt(stats.resolved_cycles),
          pendingResolution: parseInt(stats.pending_resolution),
          resolutionRate: resolutionRate,
          lastResolution: stats.last_resolution
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check football resolution health
   */
  async checkFootballResolutionHealth() {
    try {
      // Check recent football market resolution activity
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_markets,
          COUNT(*) FILTER (WHERE resolved = true) as resolved_markets,
          COUNT(*) FILTER (WHERE resolved = false AND end_time < NOW()) as pending_resolution,
          MAX(resolved_at) as last_resolution
        FROM oracle.football_prediction_markets
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats = result.rows[0];
      const resolutionRate = stats.total_markets > 0 ? 
        stats.resolved_markets / stats.total_markets : 1;

      return {
        status: resolutionRate >= 0.9 ? 'healthy' : 'degraded',
        details: {
          totalMarkets: parseInt(stats.total_markets),
          resolvedMarkets: parseInt(stats.resolved_markets),
          pendingResolution: parseInt(stats.pending_resolution),
          resolutionRate: resolutionRate,
          lastResolution: stats.last_resolution
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check crypto resolution health
   */
  async checkCryptoResolutionHealth() {
    try {
      // Check recent crypto market resolution activity
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_markets,
          COUNT(*) FILTER (WHERE resolved = true) as resolved_markets,
          COUNT(*) FILTER (WHERE resolved = false AND end_time < NOW()) as pending_resolution,
          MAX(resolved_at) as last_resolution
        FROM oracle.crypto_prediction_markets
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats = result.rows[0];
      const resolutionRate = stats.total_markets > 0 ? 
        stats.resolved_markets / stats.total_markets : 1;

      return {
        status: resolutionRate >= 0.9 ? 'healthy' : 'degraded',
        details: {
          totalMarkets: parseInt(stats.total_markets),
          resolvedMarkets: parseInt(stats.resolved_markets),
          pendingResolution: parseInt(stats.pending_resolution),
          resolutionRate: resolutionRate,
          lastResolution: stats.last_resolution
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check cron job health
   */
  async checkCronJobHealth(jobName) {
    try {
      // Check recent cron job execution logs
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE success = true) as successful_executions,
          COUNT(*) FILTER (WHERE success = false) as failed_executions,
          AVG(execution_time_ms) as avg_execution_time,
          MAX(executed_at) as last_execution
        FROM oracle.cron_job_logs
        WHERE job_name = $1
        AND executed_at > NOW() - INTERVAL '1 hour'
      `, [jobName]);

      const stats = result.rows[0];
      const successRate = stats.total_executions > 0 ? 
        stats.successful_executions / stats.total_executions : 1;

      // Check if job is running too frequently or not frequently enough
      const expectedRuns = jobName === 'results-fetching' ? 12 : 60; // 5min vs 1min intervals
      const actualRuns = parseInt(stats.total_executions);
      const runRate = actualRuns / expectedRuns;

      let status = 'healthy';
      if (successRate < 0.9) status = 'degraded';
      if (successRate < 0.7) status = 'critical';
      if (runRate < 0.5) status = 'critical'; // Too few runs

      return {
        status,
        details: {
          totalExecutions: parseInt(stats.total_executions),
          successfulExecutions: parseInt(stats.successful_executions),
          failedExecutions: parseInt(stats.failed_executions),
          successRate: successRate,
          averageExecutionTime: parseFloat(stats.avg_execution_time) || 0,
          lastExecution: stats.last_execution,
          expectedRuns,
          actualRuns,
          runRate
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    try {
      const startTime = Date.now();
      
      // Simple query to test connection
      await db.query('SELECT 1 as test');
      
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        details: {
          responseTime,
          connection: 'active'
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check SportMonks API health
   */
  async checkSportMonksAPIHealth() {
    try {
      const startTime = Date.now();
      
      // Test API with a simple request
      const response = await fetch(`https://api.sportmonks.com/v3/football/leagues?api_token=${process.env.SPORTMONKS_API_TOKEN}`);

      const responseTime = Date.now() - startTime;

      return {
        status: response.ok ? 'healthy' : 'degraded',
        details: {
          responseTime,
          statusCode: response.status,
          statusText: response.statusText
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Coinpaprika API health
   */
  async checkCoinpaprikaAPIHealth() {
    try {
      const startTime = Date.now();
      
      // Test API with a simple request
      const response = await fetch('https://api.coinpaprika.com/v1/coins/btc-bitcoin');
      const responseTime = Date.now() - startTime;

      return {
        status: response.ok ? 'healthy' : 'degraded',
        details: {
          responseTime,
          statusCode: response.status,
          statusText: response.statusText
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Get overall system status
   */
  getSystemStatus() {
    const healthChecks = Array.from(this.healthChecks.values());
    const criticalChecks = healthChecks.filter(h => h.critical);
    const healthyCritical = criticalChecks.filter(h => h.status === 'healthy').length;
    const totalCritical = criticalChecks.length;

    let overallStatus = 'healthy';
    if (healthyCritical < totalCritical * 0.8) overallStatus = 'degraded';
    if (healthyCritical < totalCritical * 0.5) overallStatus = 'critical';

    return {
      status: overallStatus,
      timestamp: new Date(),
      summary: {
        totalChecks: healthChecks.length,
        healthyChecks: healthChecks.filter(h => h.status === 'healthy').length,
        degradedChecks: healthChecks.filter(h => h.status === 'degraded').length,
        criticalChecks: healthChecks.filter(h => h.status === 'critical').length,
        errorChecks: healthChecks.filter(h => h.status === 'error').length,
        criticalHealth: `${healthyCritical}/${totalCritical}`
      },
      healthChecks: healthChecks.map(h => ({
        id: h.id,
        name: h.name,
        category: h.category,
        status: h.status,
        lastCheck: h.lastCheck,
        consecutiveFailures: h.consecutiveFailures,
        averageResponseTime: h.averageResponseTime,
        alerts: h.alerts
      }))
    };
  }

  /**
   * Get detailed health check status
   */
  getHealthCheckStatus(id) {
    return this.healthChecks.get(id);
  }

  /**
   * Check cycle health using dedicated cycle monitor
   */
  async checkCycleHealth() {
    try {
      const CycleMonitor = require('./cycle-monitor');
      const cycleMonitor = new CycleMonitor();
      
      const healthCheck = await cycleMonitor.performCycleHealthCheck();
      
      return {
        status: healthCheck.status,
        details: {
          issuesCount: healthCheck.issues.length,
          issues: healthCheck.issues.map(issue => ({
            type: issue.type,
            severity: issue.severity,
            message: issue.message
          }))
        }
      };
    } catch (error) {
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * Get all health checks by category
   */
  getHealthChecksByCategory(category) {
    return Array.from(this.healthChecks.values())
      .filter(h => h.category === category)
      .map(h => ({
        id: h.id,
        name: h.name,
        status: h.status,
        lastCheck: h.lastCheck,
        consecutiveFailures: h.consecutiveFailures,
        averageResponseTime: h.averageResponseTime,
        alerts: h.alerts
      }));
  }
}

module.exports = SystemMonitor;
