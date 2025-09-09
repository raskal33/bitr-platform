
# Indexer Best Practices Guide

## 1. BigInt Handling
Always use safe BigInt serialization:
```javascript
// ❌ WRONG - Will throw error
JSON.stringify(event.args)

// ✅ CORRECT - Safe BigInt handling
JSON.stringify(event.args, (key, value) => 
  typeof value === 'bigint' ? value.toString() : value
)
```

## 2. Database Column Compatibility
Check for column existence before using:
```javascript
// Use compatibility layer
const compat = new DatabaseCompatibilityLayer(db);
await compat.storeEvent(event, eventType, contractName);
```

## 3. Error Handling
Always wrap database operations in try-catch:
```javascript
try {
  await db.query(sql, params);
} catch (error) {
  console.error('Database error:', error);
  // Don't throw - log and continue
}
```

## 4. Data Verification
Verify data after storage:
```javascript
const verification = await compat.verifySlipData(slipId, cycleId);
if (!verification.valid) {
  console.error('Data verification failed:', verification.error);
}
```

## 5. Conflict Resolution
Use proper conflict resolution:
```javascript
// For events
ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING

// For slips  
ON CONFLICT (slip_id, cycle_id) DO UPDATE SET ...
```

## 6. Performance Optimization
- Use batch processing for multiple events
- Implement proper indexing on frequently queried columns
- Use connection pooling for database connections
- Monitor indexer lag and performance metrics

## 7. Monitoring and Alerting
- Log all errors with context
- Monitor indexer health and lag
- Set up alerts for consecutive failures
- Track performance metrics (blocks/sec, events/sec)
