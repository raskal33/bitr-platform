// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BitrFaucet
 * @notice Distributes 20,000 testnet BITR tokens to eligible users
 * @dev Eligibility is verified by backend API, not on-chain
 */
contract BitrFaucet is Ownable, ReentrancyGuard {
    IERC20 public immutable bitrToken;
    
    // Faucet configuration
    uint256 public constant FAUCET_AMOUNT = 20000 * 1e18; // 20,000 BITR
    
    // Tracking
    mapping(address => bool) public hasClaimed;
    mapping(address => uint256) public lastClaimTime;
    uint256 public totalClaimed;
    uint256 public totalUsers;
    bool public faucetActive = true;
    
    // Events
    event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event FaucetDeactivated(uint256 timestamp);
    event FaucetReactivated(uint256 timestamp);
    event FaucetRefilled(uint256 amount, uint256 timestamp);
    event EmergencyWithdraw(address indexed owner, uint256 amount, uint256 timestamp);
    
    /**
     * @notice Constructor
     * @param _bitrToken Address of the BITR token contract
     */
    constructor(address _bitrToken) Ownable(msg.sender) {
        require(_bitrToken != address(0), "Invalid BITR token address");
        bitrToken = IERC20(_bitrToken);
    }
    
    /**
     * @notice Claim testnet BITR tokens
     * @dev Eligibility must be verified by backend before calling this
     */
    function claimBitr() external nonReentrant {
        require(faucetActive, "Faucet is not active");
        require(!hasClaimed[msg.sender], "Already claimed");
        
        // Check faucet has enough tokens
        uint256 faucetBalance = bitrToken.balanceOf(address(this));
        require(faucetBalance >= FAUCET_AMOUNT, "Insufficient faucet balance");
        
        // Mark as claimed
        hasClaimed[msg.sender] = true;
        lastClaimTime[msg.sender] = block.timestamp;
        totalClaimed += FAUCET_AMOUNT;
        totalUsers++;
        
        // Transfer tokens
        require(bitrToken.transfer(msg.sender, FAUCET_AMOUNT), "Token transfer failed");
        
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT, block.timestamp);
    }
    
    /**
     * @notice Check if user has already claimed
     * @param user Address to check
     * @return claimed Whether user has claimed
     * @return claimTime When user claimed (0 if not claimed)
     */
    function getUserInfo(address user) external view returns (
        bool claimed,
        uint256 claimTime
    ) {
        claimed = hasClaimed[user];
        claimTime = lastClaimTime[user];
    }
    
    /**
     * @notice Get faucet statistics
     * @return balance Current BITR balance in faucet
     * @return totalDistributed Total BITR distributed
     * @return userCount Total users who claimed
     * @return active Whether faucet is active
     */
    function getFaucetStats() external view returns (
        uint256 balance,
        uint256 totalDistributed,
        uint256 userCount,
        bool active
    ) {
        balance = bitrToken.balanceOf(address(this));
        totalDistributed = totalClaimed;
        userCount = totalUsers;
        active = faucetActive;
    }
    
    /**
     * @notice Refill the faucet with BITR tokens
     * @param amount Amount of BITR to add
     */
    function refillFaucet(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(bitrToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        emit FaucetRefilled(amount, block.timestamp);
    }
    
    /**
     * @notice Activate/deactivate the faucet
     * @param active New active state
     */
    function setFaucetActive(bool active) external onlyOwner {
        faucetActive = active;
        
        if (active) {
            emit FaucetReactivated(block.timestamp);
        } else {
            emit FaucetDeactivated(block.timestamp);
        }
    }
    
    /**
     * @notice Emergency withdraw all BITR tokens
     * @dev Only callable by owner
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = bitrToken.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        require(bitrToken.transfer(owner(), balance), "Transfer failed");
        
        emit EmergencyWithdraw(owner(), balance, block.timestamp);
    }
    
    /**
     * @notice Emergency withdraw specific amount of BITR tokens
     * @param amount Amount to withdraw
     */
    function emergencyWithdrawAmount(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(bitrToken.balanceOf(address(this)) >= amount, "Insufficient balance");
        
        require(bitrToken.transfer(owner(), amount), "Transfer failed");
        
        emit EmergencyWithdraw(owner(), amount, block.timestamp);
    }
    
    /**
     * @notice Check if enough tokens are available for a claim
     * @return bool Whether faucet has sufficient balance
     */
    function hasSufficientBalance() external view returns (bool) {
        return bitrToken.balanceOf(address(this)) >= FAUCET_AMOUNT;
    }
    
    /**
     * @notice Calculate how many claims the faucet can support
     * @return uint256 Number of possible claims
     */
    function maxPossibleClaims() external view returns (uint256) {
        uint256 balance = bitrToken.balanceOf(address(this));
        return balance / FAUCET_AMOUNT;
    }
} 