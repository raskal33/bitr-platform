#!/usr/bin/env node

/**
 * Analytics Middleware
 * Automatically collects analytics data from API requests
 */

const AnalyticsDataCollector = require('../services/analytics-data-collector');

class AnalyticsMiddleware {
  constructor() {
    this.dataCollector = new AnalyticsDataCollector();
    this.dataCollector.start();
  }

  /**
   * Middleware to collect slip placement data
   */
  collectSlipData() {
    return async (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Collect data if request was successful
        if (res.statusCode === 200 && req.body && req.body.predictions) {
          const userAddress = req.body.playerAddress || req.user?.address;
          if (userAddress) {
            this.dataCollector.collectUserActivity(userAddress, 'slip_placed', {
              amount: req.body.amount || 0,
              predictions: req.body.predictions.length,
              cycleId: req.body.cycleId
            });
          }
        }
        
        originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
  }

  /**
   * Middleware to collect pool creation data
   */
  collectPoolData() {
    return async (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Collect data if request was successful
        if (res.statusCode === 200 && req.body) {
          const userAddress = req.body.creatorAddress || req.user?.address;
          if (userAddress) {
            this.dataCollector.collectUserActivity(userAddress, 'pool_created', {
              poolId: req.body.poolId || `pool_${Date.now()}`,
              odds: req.body.odds,
              creatorStake: req.body.creatorStake,
              maxBettorStake: req.body.maxBettorStake,
              isPrivate: req.body.isPrivate,
              oracleType: req.body.oracleType,
              marketId: req.body.marketId,
              predictedOutcome: req.body.predictedOutcome,
              eventStartTime: req.body.eventStartTime,
              bettingEndTime: req.body.bettingEndTime,
              category: req.body.category,
              league: req.body.league,
              region: req.body.region
            });
          }
        }
        
        originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
  }

  /**
   * Middleware to collect bet placement data
   */
  collectBetData() {
    return async (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Collect data if request was successful
        if (res.statusCode === 200 && req.body) {
          const userAddress = req.body.userAddress || req.user?.address;
          if (userAddress) {
            this.dataCollector.collectUserActivity(userAddress, 'bet_placed', {
              poolId: req.params.poolId || req.body.poolId,
              amount: req.body.amount,
              side: req.body.side
            });
          }
        }
        
        originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
  }

  /**
   * Middleware to collect social interaction data
   */
  collectSocialData() {
    return async (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Collect data if request was successful
        if (res.statusCode === 200 && req.body) {
          const userAddress = req.body.userAddress || req.user?.address;
          if (userAddress) {
            let interactionType = 'comment';
            
            // Determine interaction type based on route
            if (req.path.includes('discussions')) {
              interactionType = 'discussion';
            } else if (req.path.includes('replies')) {
              interactionType = 'reply';
            } else if (req.path.includes('reactions')) {
              interactionType = 'reaction_given';
            } else if (req.path.includes('reflections')) {
              interactionType = 'reflection';
            }

            this.dataCollector.collectUserActivity(userAddress, 'social_interaction', {
              interactionType,
              targetId: req.params.poolId || req.params.discussionId,
              content: req.body.content
            });
          }
        }
        
        originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
  }

  /**
   * Middleware to collect staking activity data
   */
  collectStakingData() {
    return async (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Collect data if request was successful
        if (res.statusCode === 200 && req.body) {
          const userAddress = req.body.userAddress || req.user?.address;
          if (userAddress) {
            this.dataCollector.collectUserActivity(userAddress, 'staking_activity', {
              eventType: req.body.actionType || 'stake',
              amount: req.body.amount,
              txHash: req.body.transactionHash,
              blockNumber: req.body.blockNumber,
              tierId: req.body.tierId,
              durationOption: req.body.durationOption,
              additionalData: req.body.additionalData
            });
          }
        }
        
        originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
  }

  /**
   * Generic middleware to collect any user activity
   */
  collectActivity(activityType, dataExtractor = null) {
    return async (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Collect data if request was successful
        if (res.statusCode === 200) {
          const userAddress = req.user?.address || req.body?.userAddress || req.params?.userAddress;
          if (userAddress) {
            const activityData = dataExtractor ? dataExtractor(req, res) : {};
            this.dataCollector.collectUserActivity(userAddress, activityType, activityData);
          }
        }
        
        originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
  }

  /**
   * Middleware to track API usage analytics
   */
  trackApiUsage() {
    return async (req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const userAddress = req.user?.address;
        
        // Log API usage for analytics
        console.log(`📊 API Usage: ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms${userAddress ? ` - User: ${userAddress}` : ''}`);
        
        // Collect API usage data if user is authenticated
        if (userAddress) {
          this.dataCollector.collectUserActivity(userAddress, 'api_usage', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            timestamp: new Date()
          });
        }
      });
      
      next();
    };
  }

  /**
   * Get data collector instance
   */
  getDataCollector() {
    return this.dataCollector;
  }
}

module.exports = AnalyticsMiddleware;
