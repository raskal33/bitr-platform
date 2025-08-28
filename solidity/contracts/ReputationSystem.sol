// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ReputationSystem
 * @dev Manages user reputation scores on-chain for access control
 */
contract ReputationSystem is Ownable {
    
    // Reputation thresholds
    uint256 public constant MIN_GUIDED_POOL_REPUTATION = 40;
    uint256 public constant MIN_OPEN_POOL_REPUTATION = 100;
    uint256 public constant MIN_OUTCOME_PROPOSAL_REPUTATION = 100;
    uint256 public constant DEFAULT_REPUTATION = 40;
    uint256 public constant MAX_REPUTATION = 500;
    
    // User reputation scores
    mapping(address => uint256) public userReputation;
    
    // Authorized updaters (backend indexer, etc.)
    mapping(address => bool) public authorizedUpdaters;
    
    // Events
    event ReputationUpdated(address indexed user, uint256 oldReputation, uint256 newReputation);
    event UpdaterAuthorized(address indexed updater, bool authorized);
    
    constructor(address initialOwner) Ownable(initialOwner) {
        // Owner starts with max reputation
        userReputation[initialOwner] = MAX_REPUTATION;
    }
    
    /**
     * @dev Authorize/deauthorize an address to update reputation
     */
    function setAuthorizedUpdater(address updater, bool authorized) external onlyOwner {
        authorizedUpdaters[updater] = authorized;
        emit UpdaterAuthorized(updater, authorized);
    }
    
    /**
     * @dev Update user reputation (only authorized updaters)
     */
    function updateReputation(address user, uint256 newReputation) external {
        require(authorizedUpdaters[msg.sender] || msg.sender == owner(), "Not authorized to update reputation");
        require(newReputation <= MAX_REPUTATION, "Reputation exceeds maximum");
        
        uint256 oldReputation = userReputation[user];
        userReputation[user] = newReputation;
        
        emit ReputationUpdated(user, oldReputation, newReputation);
    }
    
    /**
     * @dev Batch update multiple users' reputation
     */
    function batchUpdateReputation(address[] calldata users, uint256[] calldata reputations) external {
        require(authorizedUpdaters[msg.sender] || msg.sender == owner(), "Not authorized to update reputation");
        require(users.length == reputations.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            require(reputations[i] <= MAX_REPUTATION, "Reputation exceeds maximum");
            
            uint256 oldReputation = userReputation[users[i]];
            userReputation[users[i]] = reputations[i];
            
            emit ReputationUpdated(users[i], oldReputation, reputations[i]);
        }
    }
    
    /**
     * @dev Get user reputation (returns default if not set)
     */
    function getUserReputation(address user) external view returns (uint256) {
        uint256 reputation = userReputation[user];
        return reputation == 0 ? DEFAULT_REPUTATION : reputation;
    }
    
    /**
     * @dev Check if user can create guided pools
     */
    function canCreateGuidedPool(address user) external view returns (bool) {
        return this.getUserReputation(user) >= MIN_GUIDED_POOL_REPUTATION;
    }
    
    /**
     * @dev Check if user can create open pools
     */
    function canCreateOpenPool(address user) external view returns (bool) {
        return this.getUserReputation(user) >= MIN_OPEN_POOL_REPUTATION;
    }
    
    /**
     * @dev Check if user can propose outcomes
     */
    function canProposeOutcome(address user) external view returns (bool) {
        return this.getUserReputation(user) >= MIN_OUTCOME_PROPOSAL_REPUTATION;
    }
    
    /**
     * @dev Initialize reputation for new users (can be called by anyone)
     */
    function initializeUserReputation(address user) external {
        if (userReputation[user] == 0) {
            userReputation[user] = DEFAULT_REPUTATION;
            emit ReputationUpdated(user, 0, DEFAULT_REPUTATION);
        }
    }
}
