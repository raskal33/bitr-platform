/**
 * BigInt Serialization Utilities
 * Handles safe conversion of BigInt values for JSON serialization
 */

/**
 * Convert BigInt values to strings in an object for safe JSON serialization
 * @param {any} obj - The object to process
 * @returns {any} - The object with BigInt values converted to strings
 */
function serializeBigInts(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInts(item));
  }

  if (typeof obj === 'object') {
    // Handle Date objects
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    
    // Handle Buffer objects (sometimes returned by PostgreSQL)
    if (Buffer.isBuffer(obj)) {
      return obj.toString();
    }
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      try {
        result[key] = serializeBigInts(value);
      } catch (error) {
        console.warn(`Warning: Could not serialize key "${key}":`, error.message);
        result[key] = null; // Fallback to null for problematic values
      }
    }
    return result;
  }

  return obj;
}

/**
 * Safe JSON.stringify that handles BigInt values
 * @param {any} obj - The object to stringify
 * @param {number} space - Number of spaces for indentation
 * @returns {string} - JSON string with BigInt values converted to strings
 */
function safeStringify(obj, space = 0) {
  const serialized = serializeBigInts(obj);
  return JSON.stringify(serialized, null, space);
}

/**
 * Convert a database row with potential BigInt values to a safe object
 * @param {Object} row - Database row object
 * @returns {Object} - Safe object with BigInt values converted to strings
 */
function serializeDatabaseRow(row) {
  if (!row || typeof row !== 'object') {
    return row;
  }

  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') {
      result[key] = value.toString();
    } else if (value === null) {
      result[key] = null;
    } else if (typeof value === 'object') {
      result[key] = serializeBigInts(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Convert an array of database rows with potential BigInt values
 * @param {Array} rows - Array of database row objects
 * @returns {Array} - Array of safe objects with BigInt values converted to strings
 */
function serializeDatabaseRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map(row => serializeDatabaseRow(row));
}

module.exports = {
  serializeBigInts,
  safeStringify,
  serializeDatabaseRow,
  serializeDatabaseRows
};
