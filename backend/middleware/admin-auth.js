const config = require('../config');

/**
 * Admin authentication middleware
 * Validates the admin key from the request headers
 */
function adminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'] || req.headers['admin-key'];
  
  if (!adminKey) {
    return res.status(401).json({
      error: 'Admin key required',
      message: 'Please provide admin key in x-admin-key header'
    });
  }
  
  if (!config.api.adminKey) {
    return res.status(500).json({
      error: 'Admin key not configured',
      message: 'Admin key is not configured on the server'
    });
  }
  
  if (adminKey !== config.api.adminKey) {
    return res.status(403).json({
      error: 'Invalid admin key',
      message: 'The provided admin key is invalid'
    });
  }
  
  // Admin key is valid, proceed to the next middleware
  next();
}

module.exports = adminAuth;
