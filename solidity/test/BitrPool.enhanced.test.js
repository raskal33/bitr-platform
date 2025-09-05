const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BitrPool Enhanced Features", function () {
    let bitrPool, bitrToken, guidedOracle;
    let owner, creator, bettor1, bettor2, lp1;

    beforeEach(async function () {
        [owner, creator, bettor1, bettor2, lp1] = await ethers.getSigners();

        // Deploy mock BITR token (MON is now native)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        bitrToken = await MockERC20.deploy("Bitredict Token", "BITR");
        
        // Mint tokens to the contract owner
        await bitrToken.mint(owner.address, ethers.parseEther("1000000"));

        // Deploy mock oracles
        const MockGuidedOracle = await ethers.getContractFactory("MockGuidedOracle");
        guidedOracle = await MockGuidedOracle.deploy();
        
        // Deploy main contract with correct constructor arguments
        const BitrPool = await ethers.getContractFactory("BitrPool");
        bitrPool = await BitrPool.deploy(
            await bitrToken.getAddress(),
            owner.address, // fee collector
            await guidedOracle.getAddress(),
            ethers.ZeroAddress // optimistic oracle placeholder
        );

        // Transfer BITR tokens to users
        await bitrToken.transfer(creator.address, ethers.parseEther("10000"));
        await bitrToken.transfer(bettor1.address, ethers.parseEther("10000"));
        await bitrToken.transfer(bettor2.address, ethers.parseEther("10000"));
        await bitrToken.transfer(lp1.address, ethers.parseEther("10000"));
    });

    describe("Pool Progress Functions", function () {
        let poolId;

        beforeEach(async function () {
            // Create a test pool
            const currentTime = Math.floor(Date.now() / 1000);
            const eventStart = currentTime + 3600;
            const eventEnd = currentTime + 7200;

            // Create pool with native MON (no approval needed)
            await bitrPool.connect(creator).createPool(
                ethers.keccak256(ethers.toUtf8Bytes("HOME_WIN")),
                150, // 1.50x odds
                ethers.parseEther("100"),
                eventStart,
                eventEnd,
                "Premier League",
                "football",
                "UK",
                false, // not private
                ethers.parseEther("10"), // max 10 MON per user
                false, // use MON (native)
                0, // guided oracle
                ethers.keccak256(ethers.toUtf8Bytes("MATCH_123")),
                { value: ethers.parseEther("101") } // 1 MON creation fee + 100 MON stake
            );
            poolId = 0;
        });

        it("Should return correct pool progress metrics", async function () {
            const [totalPoolSize, currentBettorStake, maxBettorCapacity, creatorSideStake, fillPercentage, bettorCount, lpCount] = 
                await bitrPool.getPoolProgress(poolId);

            expect(totalPoolSize).to.equal(ethers.parseEther("300")); // 100 + 200 = 300
            expect(currentBettorStake).to.equal(0); // No bets yet
            expect(maxBettorCapacity).to.equal(ethers.parseEther("200")); // (100 * 100) / (150 - 100) = 200
            expect(creatorSideStake).to.equal(ethers.parseEther("100")); // Creator stake
            expect(fillPercentage).to.equal(0); // No bets yet
            expect(bettorCount).to.equal(0);
            expect(lpCount).to.equal(1); // Creator is first LP
        });

        it("Should enforce maxBetPerUser limit", async function () {
            // Try to bet more than the 10 MON limit
            await expect(
                bitrPool.connect(bettor1).placeBet(poolId, ethers.parseEther("15"), { value: ethers.parseEther("15") })
            ).to.be.revertedWith("Exceeds max bet per user");
        });
    });
});
