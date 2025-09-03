const cron = require('node-cron');
const comprehensiveHealthService = require('../services/comprehensive-health-service');
const MonitoringAlertingSystem = require('../services/monitoring-alerting-system');
const SystemMonitor = require('../services/system-monitor');

/**
 * Health Monitoring Cron Job
 * Runs comprehensive health checks and sends alerts if needed
 */
class HealthMonitoringCron {
  constructor() {
    this.healthService = comprehensiveHealthService;
    this.alertingSystem = new MonitoringAlertingSystem();
    this.systemMonitor = new SystemMonitor();
    this.isRunning = false;
  }

  /**
   * Start health monitoring cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Health monitoring cron is already running');
      return;
    }

    console.log('🏥 Starting health monitoring cron jobs...');

    // Comprehensive health check every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.runHealthCheck();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // System monitoring every minute
    cron.schedule('* * * * *', async () => {
      await this.runSystemMonitoring();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Daily health report
    cron.schedule('0 8 * * *', async () => {
      await this.generateDailyHealthReport();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.isRunning = true;
    console.log('✅ Health monitoring cron jobs started');
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck() {
    try {
      console.log('🔍 Running comprehensive health check...');
      
      const healthReport = await this.healthService.runComprehensiveHealthCheck();
      
      // Check for critical issues
      if (healthReport.criticalIssues && healthReport.criticalIssues.length > 0) {
        console.log('🚨 Critical health issues detected:', healthReport.criticalIssues);
        
        // Send alert
        await this.alertingSystem.sendAlert({
          type: 'critical',
          title: 'Critical System Health Issues',
          message: `Detected ${healthReport.criticalIssues.length} critical issues`,
          details: healthReport.criticalIssues
        });
      }
      
      // Check for warnings
      if (healthReport.warnings && healthReport.warnings.length > 0) {
        console.log('⚠️ Health warnings detected:', healthReport.warnings.length);
      }
      
      console.log(`✅ Health check completed - Overall status: ${healthReport.overallStatus}`);
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
      
      // Send alert about health check failure
      await this.alertingSystem.sendAlert({
        type: 'error',
        title: 'Health Check System Failure',
        message: 'The health monitoring system itself has failed',
        details: error.message
      });
    }
  }

  /**
   * Run system monitoring
   */
  async runSystemMonitoring() {
    try {
      const metrics = await this.systemMonitor.collectMetrics();
      
      // Check for resource issues
      if (metrics.memory && metrics.memory.usagePercent > 90) {
        await this.alertingSystem.sendAlert({
          type: 'warning',
          title: 'High Memory Usage',
          message: `Memory usage at ${metrics.memory.usagePercent}%`,
          details: metrics.memory
        });
      }
      
      if (metrics.cpu && metrics.cpu.usagePercent > 95) {
        await this.alertingSystem.sendAlert({
          type: 'warning',
          title: 'High CPU Usage',
          message: `CPU usage at ${metrics.cpu.usagePercent}%`,
          details: metrics.cpu
        });
      }
      
    } catch (error) {
      console.error('❌ System monitoring failed:', error);
    }
  }

  /**
   * Generate daily health report
   */
  async generateDailyHealthReport() {
    try {
      console.log('📊 Generating daily health report...');
      
      const report = await this.healthService.generateDailyReport();
      
      // Send daily report
      await this.alertingSystem.sendAlert({
        type: 'info',
        title: 'Daily Health Report',
        message: 'System health summary for the past 24 hours',
        details: report
      });
      
      console.log('✅ Daily health report generated and sent');
      
    } catch (error) {
      console.error('❌ Daily health report failed:', error);
    }
  }

  /**
   * Stop health monitoring
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Health monitoring cron jobs stopped');
  }
}

// Create and start the health monitoring cron
const healthMonitoringCron = new HealthMonitoringCron();

// Start if run directly
if (require.main === module) {
  healthMonitoringCron.start();
  
  // Keep the process alive
  console.log('🏥 Health monitoring cron job started');
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down health monitoring...');
    healthMonitoringCron.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down health monitoring...');
    healthMonitoringCron.stop();
    process.exit(0);
  });
}

module.exports = healthMonitoringCron;
