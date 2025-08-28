# Comprehensive Health Monitoring System

This document describes the comprehensive health monitoring system implemented for the Bitredict backend, which provides real-time monitoring, alerting, and debugging capabilities for all system components.

## Overview

The health monitoring system implements all requirements from task 8:
- ✅ **6.1**: Health check endpoints for all services
- ✅ **6.2**: Structured logging with context information  
- ✅ **6.3**: Database connection monitoring
- ✅ **6.4**: API request/response logging for debugging
- ✅ **6.5**: Detailed execution logging for monitoring

## Architecture

### Core Components

1. **Health Monitor Service** (`services/health-monitor.js`)
   - Central health monitoring service
   - Tracks system metrics and service status
   - Provides comprehensive health checks

2. **Logging Configuration** (`config/logging.js`)
   - Structured logging with JSON format
   - Context-aware logging with service identification
   - File and console logging support

3. **Monitored Database** (`db/monitored-db.js`)
   - Database connection monitoring wrapper
   - Query performance tracking
   - Connection health validation

4. **Health Monitoring Middleware** (`middleware/health-monitoring-middleware.js`)
   - Request/response logging
   - Performance monitoring
   - Error tracking and alerting

5. **Comprehensive Health Service** (`services/comprehensive-health-service.js`)
   - Advanced health analysis
   - Intelligent alerting
   - Trend analysis and recommendations

## Health Endpoints

### Basic Health Endpoints

| Endpoint | Description | Response |
|----------|-------------|----------|
| `GET /api/health` | Basic health check | Overall system status |
| `GET /api/health/detailed` | Detailed health with all services | Comprehensive health data |
| `GET /api/health/database` | Database-specific health | Database connection status |
| `GET /api/health/services` | External services health | API connectivity status |
| `GET /api/health/cron` | Cron jobs health | Job execution status |
| `GET /api/health/oddyssey` | Oddyssey service health | Daily game status |
| `GET /api/health/oracle` | Oracle services health | Fixture and odds status |

### Advanced Monitoring Endpoints

| Endpoint | Description | Response |
|----------|-------------|----------|
| `GET /api/health/metrics` | Performance metrics | System performance data |
| `GET /api/health/detailed-services` | Enhanced service monitoring | Service health with alerts |
| `GET /api/health/alerts` | Current system alerts | Active alerts and recommendations |
| `GET /api/health/readiness` | Kubernetes readiness probe | Ready/not ready status |
| `GET /api/health/liveness` | Kubernetes liveness probe | Alive/not alive status |

### Monitoring Dashboard Endpoints

| Endpoint | Description | Response |
|----------|-------------|----------|
| `GET /api/monitoring/dashboard` | Complete system overview | Comprehensive dashboard data |
| `GET /api/monitoring/real-time` | Real-time system metrics | Live performance data |
| `GET /api/monitoring/logs` | Recent system logs | Filtered log entries |
| `GET /api/monitoring/database-stats` | Detailed database statistics | Database performance metrics |
| `GET /api/monitoring/api-performance` | API performance analysis | Endpoint performance data |
| `GET /api/monitoring/cron-analysis` | Cron job analysis | Job performance and health |

## Health Check Response Format

### Basic Health Response
```json
{
  "timestamp": "2025-01-13T10:30:00.000Z",
  "uptime": 3600000,
  "status": "healthy",
  "services": {
    "database": {
      "status": "healthy",
      "responseTime": 45,
      "connections": {
        "total": 20,
        "idle": 15,
        "waiting": 0
      }
    },
    "sportmonks": {
      "status": "healthy",
      "responseTime": 250,
      "apiKey": true
    },
    "blockchain": {
      "status": "healthy",
      "responseTime": 180,
      "latestBlock": 12345
    }
  },
  "metrics": {
    "requests": 1500,
    "errors": 5,
    "dbQueries": 2300,
    "cronJobs": 12
  },
  "system": {
    "memory": {
      "used": "128MB",
      "total": "512MB"
    },
    "uptime": {
      "hours": 1.5
    }
  }
}
```

### Enhanced Health Response with Alerts
```json
{
  "status": "degraded",
  "services": { ... },
  "alerts": [
    {
      "severity": "warning",
      "service": "database",
      "message": "High connection pool utilization: 85%",
      "recommendation": "Consider increasing connection pool size",
      "threshold": 80,
      "currentValue": 85
    }
  ],
  "recommendations": [
    {
      "category": "performance",
      "priority": "medium",
      "title": "Optimize Database Queries",
      "description": "Several slow queries detected",
      "actions": [
        "Review query execution plans",
        "Add missing indexes",
        "Optimize WHERE clauses"
      ]
    }
  ]
}
```

## Logging System

### Structured Logging Format
```json
{
  "timestamp": "2025-01-13T10:30:00.000Z",
  "level": "INFO",
  "message": "API Request: GET /api/health",
  "context": {
    "service": "api",
    "requestId": "req_abc123",
    "method": "GET",
    "path": "/api/health",
    "statusCode": 200,
    "duration": "45ms",
    "ip": "192.168.1.100"
  }
}
```

### Log Levels and Usage

- **ERROR**: System errors, failed operations, exceptions
- **WARN**: Performance issues, degraded services, high resource usage
- **INFO**: Normal operations, API requests, service status changes
- **DEBUG**: Detailed execution information, query details

### Service-Specific Logging

#### API Request Logging
```javascript
// Automatic logging for all API requests
{
  "level": "INFO",
  "message": "GET /api/oddyssey/matches - 200 (123ms)",
  "context": {
    "service": "api",
    "method": "GET",
    "path": "/api/oddyssey/matches",
    "statusCode": 200,
    "duration": "123ms",
    "requestId": "req_xyz789"
  }
}
```

#### Database Query Logging
```javascript
// Automatic logging for database operations
{
  "level": "DEBUG",
  "message": "Database query executed",
  "context": {
    "service": "database",
    "query": "SELECT * FROM oddyssey.daily_game_matches WHERE...",
    "duration": "25ms",
    "rowCount": 10
  }
}
```

#### Cron Job Logging
```javascript
// Automatic logging for cron job execution
{
  "level": "INFO",
  "message": "Cron job completed: fixtures-scheduler",
  "context": {
    "service": "cron",
    "jobName": "fixtures-scheduler",
    "duration": "2340ms",
    "status": "success"
  }
}
```

## Database Monitoring

### Connection Pool Monitoring
- Real-time connection pool utilization
- Connection health validation
- Automatic reconnection on failures
- Query performance tracking

### Health Check Queries
```sql
-- Basic connectivity test
SELECT NOW() as current_time;

-- Schema verification
SELECT schema_name FROM information_schema.schemata 
WHERE schema_name IN ('core', 'oracle', 'oddyssey', 'analytics', 'system');

-- Table existence check
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'oddyssey' AND table_name = 'daily_game_matches';
```

### Performance Metrics
- Query execution time tracking
- Slow query identification (>1000ms)
- Connection pool utilization alerts
- Database error rate monitoring

## Alert System

### Alert Severity Levels

- **CRITICAL**: Service unavailable, system failure
- **WARNING**: Performance degradation, high resource usage
- **INFO**: Normal operational alerts, status changes

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | >5% | >10% |
| Memory Usage | >80% | >95% |
| DB Connection Pool | >90% | >95% |
| Response Time | >2000ms | >5000ms |
| Cron Job Failures | >3 consecutive | >5 consecutive |

### Alert Examples

#### High Error Rate Alert
```json
{
  "severity": "warning",
  "service": "api",
  "message": "High error rate detected: 7.5%",
  "recommendation": "Check application logs and recent deployments",
  "threshold": 5.0,
  "currentValue": 7.5,
  "timestamp": "2025-01-13T10:30:00.000Z"
}
```

#### Database Connection Alert
```json
{
  "severity": "critical",
  "service": "database",
  "message": "Database connection pool exhausted: 100%",
  "recommendation": "Increase connection pool size immediately",
  "threshold": 95,
  "currentValue": 100,
  "timestamp": "2025-01-13T10:30:00.000Z"
}
```

## Performance Monitoring

### Key Metrics Tracked

1. **API Performance**
   - Requests per hour
   - Error rate percentage
   - Average response time
   - Slow request count (>2s)

2. **Database Performance**
   - Queries per hour
   - Database error rate
   - Connection pool utilization
   - Slow query count (>1s)

3. **System Performance**
   - Memory usage (heap used/total)
   - CPU usage
   - Uptime
   - Process metrics

4. **Service Health**
   - External API response times
   - Service availability
   - Cron job success rates
   - Blockchain connectivity

### Performance Trends
The system tracks performance trends over time to identify:
- Gradual performance degradation
- Seasonal usage patterns
- Resource usage growth
- Service reliability trends

## Usage Examples

### Basic Health Check
```bash
# Check overall system health
curl http://localhost:3000/api/health

# Check specific service health
curl http://localhost:3000/api/health/database
curl http://localhost:3000/api/health/oddyssey
```

### Monitoring Dashboard
```bash
# Get comprehensive dashboard data
curl http://localhost:3000/api/monitoring/dashboard

# Get real-time metrics
curl http://localhost:3000/api/monitoring/real-time

# Get recent logs
curl "http://localhost:3000/api/monitoring/logs?level=error&limit=50"
```

### Using in Application Code

#### Manual Health Checks
```javascript
const healthMonitor = require('./services/health-monitor');

// Get comprehensive health status
const health = await healthMonitor.getComprehensiveHealthStatus();
console.log('System status:', health.status);

// Check specific service
const dbHealth = await healthMonitor.checkDatabaseHealth();
if (dbHealth.status !== 'healthy') {
  console.warn('Database issues detected');
}
```

#### Structured Logging
```javascript
const loggingConfig = require('./config/logging');

// Log with context
await loggingConfig.info('User action completed', {
  userId: '12345',
  action: 'create_bet',
  amount: 100
});

// Log errors with full context
await loggingConfig.error('Payment processing failed', error, {
  userId: '12345',
  paymentId: 'pay_67890',
  amount: 100
});
```

#### Using Monitoring Middleware
```javascript
const HealthMonitoringMiddleware = require('./middleware/health-monitoring-middleware');

// Wrap database operations
const monitoredQuery = HealthMonitoringMiddleware.databaseOperationMonitor(
  'getUserBets',
  { userId: '12345' }
);

// Wrap external API calls
const monitoredApiCall = HealthMonitoringMiddleware.externalApiMonitor(
  'sportmonks',
  '/fixtures'
);
```

## Configuration

### Environment Variables

```bash
# Logging configuration
LOG_LEVEL=info                    # debug, info, warn, error
ENABLE_FILE_LOGGING=true         # Enable file logging
LOG_FILE=./logs/app.log          # Log file path
ENABLE_STRUCTURED_LOGGING=true   # Enable JSON structured logging

# Health monitoring
HEALTH_CHECK_INTERVAL=300000     # Health check interval (5 minutes)
METRICS_COLLECTION_INTERVAL=60000 # Metrics collection interval (1 minute)
ALERT_THRESHOLD_ERROR_RATE=5.0   # Error rate alert threshold (5%)
ALERT_THRESHOLD_MEMORY=80        # Memory usage alert threshold (80%)
```

### Database Configuration
The health monitoring system requires these database tables:
- `system.cron_locks` - Cron job coordination
- `system.health_checks` - Health check history
- `system.performance_metrics` - Performance metrics storage

## Troubleshooting

### Common Issues

#### Health Endpoints Not Responding
```bash
# Check if server is running
curl http://localhost:3000/api/health/liveness

# Check database connectivity
curl http://localhost:3000/api/health/database
```

#### High Memory Usage Alerts
```bash
# Check memory metrics
curl http://localhost:3000/api/monitoring/real-time

# Review memory usage trends
curl http://localhost:3000/api/monitoring/dashboard
```

#### Database Connection Issues
```bash
# Check database health
curl http://localhost:3000/api/health/database

# Check connection pool status
curl http://localhost:3000/api/monitoring/database-stats
```

### Log Analysis

#### Finding Error Patterns
```bash
# Get recent error logs
curl "http://localhost:3000/api/monitoring/logs?level=error&limit=100"

# Filter by service
curl "http://localhost:3000/api/monitoring/logs?service=database&level=error"
```

#### Performance Investigation
```bash
# Check API performance
curl http://localhost:3000/api/monitoring/api-performance

# Check cron job performance
curl http://localhost:3000/api/monitoring/cron-analysis
```

## Integration with External Systems

### Kubernetes Health Checks
```yaml
# Deployment configuration
livenessProbe:
  httpGet:
    path: /api/health/liveness
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health/readiness
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Monitoring Tools Integration
The health endpoints can be integrated with:
- Prometheus (metrics scraping)
- Grafana (dashboard visualization)
- AlertManager (alert routing)
- DataDog (APM monitoring)
- New Relic (performance monitoring)

### Log Aggregation
Structured logs can be sent to:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Splunk
- CloudWatch Logs
- Fluentd/Fluent Bit

## Maintenance

### Regular Tasks

1. **Log Cleanup** (automated daily)
   - Remove logs older than 30 days
   - Archive important error logs
   - Clean up database health check history

2. **Performance Review** (weekly)
   - Review performance trends
   - Analyze alert patterns
   - Update alert thresholds if needed

3. **Health Check Validation** (monthly)
   - Verify all health endpoints
   - Test alert generation
   - Update monitoring documentation

### Scaling Considerations

- Health check frequency can be adjusted based on load
- Log retention policies should be configured for storage limits
- Database health check history should be partitioned for large datasets
- Performance metrics collection can be optimized for high-traffic systems

## Security Considerations

- Health endpoints should be protected in production
- Sensitive data is automatically redacted from logs
- Database connection details are not exposed in health responses
- API keys and tokens are masked in logging output

---

This comprehensive health monitoring system provides complete visibility into the Bitredict backend system, enabling proactive monitoring, quick issue identification, and detailed debugging capabilities.