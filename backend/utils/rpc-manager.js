/**
 * RPC Manager with Failover and Retry Logic
 * 
 * Handles multiple RPC endpoints with automatic failover,
 * exponential backoff, and circuit breaker pattern
 */

const { ethers } = require('ethers');

class RpcManager {
  constructor(rpcUrls = [], options = {}) {
    this.rpcUrls = rpcUrls.length > 0 ? rpcUrls : [
      'https://rpc.ankr.com/monad_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205', // ANKR Premium (500+ req/sec) - PRIMARY!
      'https://testnet-rpc.monad.xyz/',                    // Monad official (25 req/sec) - Fallback
      'https://frosty-summer-model.monad-testnet.quiknode.pro/bfedff2990828aad13692971d0dbed22de3c9783/', // QuickNode (15 req/sec) - Emergency
    ];
    
    this.options = {
      maxRetries: options.maxRetries || 5, // More retries for premium
      baseDelay: options.baseDelay || 200, // 200ms (5x faster)
      maxDelay: options.maxDelay || 10000,   // 10 seconds (3x faster)
      circuitBreakerThreshold: options.circuitBreakerThreshold || 8, // Higher threshold for premium
      circuitBreakerTimeout: options.circuitBreakerTimeout || 30000, // 30 seconds (2x faster)
      ...options
    };
    
    this.providers = new Map();
    this.currentProviderIndex = 0;
    this.failureCounts = new Map();
    this.circuitBreakerState = new Map(); // 'closed', 'open', 'half-open'
    
    // Smart load balancing - track usage and rate limits - PREMIUM OPTIMIZED
    this.providerStats = new Map();
    this.providerRateLimits = new Map([
      [0, { name: 'ANKR Premium', maxReqPerSec: 500, weight: 10 }],     // PREMIUM! 500+ req/sec
      [1, { name: 'Monad Official', maxReqPerSec: 25, weight: 1 }],     // Fallback
      [2, { name: 'QuickNode', maxReqPerSec: 15, weight: 0.5 }]        // Emergency only
    ]);
    this.lastRequestTime = new Map();
    this.requestCounts = new Map();
    
    // Initialize Maps first, then providers
    for (let i = 0; i < this.rpcUrls.length; i++) {
      this.requestCounts.set(i, 0);
      this.lastRequestTime.set(i, 0);
    }
    
    this.initializeProviders();
  }
  
  initializeProviders() {
    this.rpcUrls.forEach((url, index) => {
      try {
        const provider = new ethers.JsonRpcProvider(url, null, {
          timeout: 30000, // 30 second timeout
          retryLimit: 0   // We handle retries ourselves
        });
        this.providers.set(index, { url, provider });
        this.failureCounts.set(index, 0);
        this.circuitBreakerState.set(index, 'closed');
        this.requestCounts.set(index, 0);
        this.lastRequestTime.set(index, 0);
        
        const providerInfo = this.providerRateLimits.get(index);
        console.log(`✅ RPC Provider ${index} initialized: ${providerInfo?.name || 'Unknown'} (${url})`);
        console.log(`   📊 Rate limit: ${providerInfo?.maxReqPerSec || 'Unknown'} req/sec, Weight: ${providerInfo?.weight || 1}`);
      } catch (error) {
        console.error(`❌ Failed to initialize RPC Provider ${index} (${url}):`, error.message);
      }
    });
  }
  
  getCurrentProvider() {
    const providerInfo = this.providers.get(this.currentProviderIndex);
    if (!providerInfo) {
      throw new Error('No RPC providers available');
    }
    return providerInfo;
  }
  
  switchToNextProvider() {
    const totalProviders = this.providers.size;
    if (totalProviders === 0) {
      throw new Error('No RPC providers available');
    }
    
    // Try to find next working provider
    for (let i = 0; i < totalProviders; i++) {
      this.currentProviderIndex = (this.currentProviderIndex + 1) % totalProviders;
      const state = this.circuitBreakerState.get(this.currentProviderIndex);
      
      if (state === 'closed' || state === 'half-open') {
        const providerInfo = this.providers.get(this.currentProviderIndex);
        console.log(`🔄 Switched to RPC Provider ${this.currentProviderIndex}: ${providerInfo.url}`);
        return providerInfo;
      }
    }
    
    // If all providers are in 'open' state, reset the first one to 'half-open'
    this.currentProviderIndex = 0;
    this.circuitBreakerState.set(0, 'half-open');
    const providerInfo = this.providers.get(0);
    console.log(`🔄 All providers failed, trying first provider again: ${providerInfo.url}`);
    return providerInfo;
  }
  
  recordFailure(providerIndex, error) {
    const currentCount = this.failureCounts.get(providerIndex) || 0;
    const newCount = currentCount + 1;
    this.failureCounts.set(providerIndex, newCount);
    
    const providerInfo = this.providers.get(providerIndex);
    console.warn(`⚠️ RPC Provider ${providerIndex} failure ${newCount}: ${error.message}`);
    
    // Open circuit breaker if threshold reached
    if (newCount >= this.options.circuitBreakerThreshold) {
      this.circuitBreakerState.set(providerIndex, 'open');
      console.error(`🚫 Circuit breaker OPEN for Provider ${providerIndex} (${providerInfo.url})`);
      
      // Schedule circuit breaker reset
      setTimeout(() => {
        this.circuitBreakerState.set(providerIndex, 'half-open');
        this.failureCounts.set(providerIndex, 0);
        console.log(`🔄 Circuit breaker HALF-OPEN for Provider ${providerIndex} (${providerInfo.url})`);
      }, this.options.circuitBreakerTimeout);
    }
  }
  
  recordSuccess(providerIndex) {
    this.failureCounts.set(providerIndex, 0);
    this.circuitBreakerState.set(providerIndex, 'closed');
  }
  
  calculateDelay(attempt) {
    const delay = Math.min(
      this.options.baseDelay * Math.pow(2, attempt),
      this.options.maxDelay
    );
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }
  
  isRetryableError(error) {
    const retryableErrors = [
      'SERVER_ERROR',           // 502 Bad Gateway
      'TIMEOUT',               // Request timeout
      'NETWORK_ERROR',         // Network issues
      'ENOTFOUND',            // DNS resolution failed
      'ECONNREFUSED',         // Connection refused
      'ECONNRESET',           // Connection reset
      'socket hang up',       // Socket errors
      '502 Bad Gateway',      // HTTP 502
      '503 Service Unavailable', // HTTP 503
      '504 Gateway Timeout'   // HTTP 504
    ];
    
    const errorMessage = error.message || error.toString();
    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError) || 
      error.code === retryableError
    );
  }
  
  async executeWithRetry(operation, operationName = 'RPC call') {
    let lastError;
    let attempt = 0;
    
    while (attempt < this.options.maxRetries) {
      // Use smart provider selection for better load balancing
      const selectedProviderIndex = this.selectBestProvider();
      this.currentProviderIndex = selectedProviderIndex;
      const startProviderIndex = selectedProviderIndex;
      
      try {
        const { provider } = this.getCurrentProvider();
        
        // Premium RPC rate limiting - much more aggressive!
        const providerInfo = this.providerRateLimits.get(this.currentProviderIndex);
        if (this.lastRequestTime) {
          const timeSinceLastRequest = Date.now() - this.lastRequestTime;
          // Dynamic delay based on provider capabilities
          const minDelay = providerInfo?.name === 'ANKR Premium' ? 2 : 50; // 2ms for premium, 50ms for others
          if (timeSinceLastRequest < minDelay) {
            await new Promise(resolve => setTimeout(resolve, minDelay - timeSinceLastRequest));
          }
        }
        this.lastRequestTime = Date.now();
        
        const result = await operation(provider);
        
        // Record success
        this.recordSuccess(this.currentProviderIndex);
        
        if (attempt > 0) {
          console.log(`✅ ${operationName} succeeded on attempt ${attempt + 1}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        attempt++;
        
        console.error(`❌ ${operationName} failed (attempt ${attempt}/${this.options.maxRetries}):`, error.message);
        
        // Record failure for current provider
        this.recordFailure(this.currentProviderIndex, error);
        
        // If it's a retryable error and we have more attempts, try next provider
        if (this.isRetryableError(error) && attempt < this.options.maxRetries) {
          try {
            this.switchToNextProvider();
          } catch (switchError) {
            console.error('❌ No more providers available:', switchError.message);
            break;
          }
          
          // Wait with exponential backoff
          const delay = this.calculateDelay(attempt - 1);
          console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
          await this.sleep(delay);
        } else {
          // Non-retryable error or out of attempts
          break;
        }
      }
    }
    
    throw new Error(`${operationName} failed after ${attempt} attempts. Last error: ${lastError.message}`);
  }
  
  async getProvider() {
    const providerInfo = this.getCurrentProvider();
    return providerInfo.provider;
  }
  
  /**
   * Simple provider selection - using round-robin to avoid Map initialization issues
   */
  selectBestProvider() {
    // TEMPORARY FIX: Use simple round-robin to avoid Map errors
    console.log('🔄 Using simple round-robin provider selection');
    const selectedProvider = this.currentProviderIndex;
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.size;
    return selectedProvider;
  }
  
  async getBlockNumber() {
    return this.executeWithRetry(
      (provider) => provider.getBlockNumber(),
      'Get block number'
    );
  }
  
  async getBlock(blockNumber) {
    return this.executeWithRetry(
      (provider) => provider.getBlock(blockNumber),
      `Get block ${blockNumber}`
    );
  }
  
  async queryFilter(contract, filter, fromBlock, toBlock) {
    return this.executeWithRetry(
      (provider) => {
        // Create contract instance with current provider
        const contractWithProvider = contract.connect(provider);
        return contractWithProvider.queryFilter(filter, fromBlock, toBlock);
      },
      `Query filter ${filter.fragment?.name || 'unknown'}`
    );
  }
  
  async call(contract, method, args = []) {
    return this.executeWithRetry(
      async (provider) => {
        const contractWithProvider = contract.connect(provider);
        return contractWithProvider[method](...args);
      },
      `Contract call ${method}`
    );
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getStatus() {
    const status = {
      totalProviders: this.providers.size,
      currentProvider: this.currentProviderIndex,
      providers: []
    };
    
    this.providers.forEach((providerInfo, index) => {
      status.providers.push({
        index,
        url: providerInfo.url,
        failures: this.failureCounts.get(index),
        circuitState: this.circuitBreakerState.get(index),
        isCurrent: index === this.currentProviderIndex
      });
    });
    
    return status;
  }
  
  logStatus() {
    const status = this.getStatus();
    console.log('📊 RPC Manager Status:');
    status.providers.forEach(provider => {
      const indicator = provider.isCurrent ? '👉' : '  ';
      const state = provider.circuitState === 'closed' ? '✅' : 
                   provider.circuitState === 'open' ? '🚫' : '⚠️';
      console.log(`${indicator} ${state} Provider ${provider.index}: ${provider.url} (failures: ${provider.failures})`);
    });
  }
}

module.exports = RpcManager;
