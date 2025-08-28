// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GuidedOracle {
    // Outcome structure for football/coin markets
    struct Outcome {
        bool isSet;            // True if outcome has been submitted
        bytes resultData;      // Generic outcome data (can be "1", "2", "over", etc.)
        uint256 timestamp;     // When the outcome was written
    }

    // Only the authorized bot (off-chain oracle service) can write outcomes
    address public oracleBot;
    address public owner;

    // mapping from external ID (e.g. Sportmonks match ID, coin symbol hash) to outcome
    mapping(bytes32 => Outcome) public outcomes;

    // Events
    event OutcomeSubmitted(bytes32 indexed marketId, bytes resultData, uint256 timestamp);
    event OracleBotUpdated(address newBot);
    event CallExecuted(address indexed target, bytes data);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyBot() {
        require(msg.sender == oracleBot, "Only oracle bot can submit outcome");
        _;
    }

    constructor(address _oracleBot) {
        oracleBot = _oracleBot;
        owner = msg.sender;
    }

    // Submit the final outcome for a guided market
    function submitOutcome(bytes32 marketId, bytes calldata resultData) external onlyBot {
        require(!outcomes[marketId].isSet, "Outcome already submitted");
        outcomes[marketId] = Outcome({
            isSet: true,
            resultData: resultData,
            timestamp: block.timestamp
        });

        emit OutcomeSubmitted(marketId, resultData, block.timestamp);
    }

    /**
     * @notice Allows the oracle bot to execute a call to another contract.
     * @dev This is used for pushing data to consumer contracts like Oddyssey,
     * which require the oracle to initiate the data push. The `msg.sender` on
     * the target contract will be this GuidedOracle contract.
     * @param target The address of the contract to call.
     * @param data The calldata for the function to be executed.
     */
    function executeCall(address target, bytes calldata data) external onlyBot {
        (bool success, ) = target.call(data);
        require(success, "External call failed");
        emit CallExecuted(target, data);
    }

    // View function to fetch result
    function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData) {
        Outcome memory o = outcomes[marketId];
        return (o.isSet, o.resultData);
    }

    // Update bot address if needed
    function updateOracleBot(address newBot) external onlyOwner {
        require(newBot != address(0), "Invalid bot address");
        oracleBot = newBot;
        emit OracleBotUpdated(newBot);
    }
}
