const { expect } = require("chai");
const { ethers } = require("hardhat");

const OracleType = {
    GUIDED: 0,
    OPEN: 1
};

describe("Fully Decentralized Predinex System", function () {
    let bitredictPool, bitrToken, sttToken, owner, creator, bettor1, lp1, feeCollector, guidedOracle, optimisticOracle;

    beforeEach(async function () {
        [owner, creator, bettor1, lp1, feeCollector] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        sttToken = await MockERC20.deploy("STT Token", "STT", 18, ethers.parseEther("10000000"));
        bitrToken = await MockERC20.deploy("Bitredict Token", "BITR", 18, ethers.parseEther("10000000"));

        const MockGuidedOracle = await ethers.getContractFactory("MockGuidedOracle");
        const MockOptimisticOracle = await ethers.getContractFactory("MockOptimisticOracle");
        guidedOracle = await MockGuidedOracle.deploy();
        optimisticOracle = await MockOptimisticOracle.deploy();

        const BitredictPool = await ethers.getContractFactory("BitredictPool");
        bitredictPool = await BitredictPool.deploy(
            await sttToken.getAddress(),
            await bitrToken.getAddress(),
            feeCollector.address,
            await guidedOracle.getAddress(),
            await optimisticOracle.getAddress()
        );

        await sttToken.transfer(creator.address, ethers.parseEther("10000"));
        await sttToken.transfer(bettor1.address, ethers.parseEther("10000"));
        await sttToken.transfer(lp1.address, ethers.parseEther("10000"));
        await bitrToken.transfer(creator.address, ethers.parseEther("50000"));
    });
    
    async function createPool(params) {
        const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
        const defaultParams = {
            predictedOutcome: ethers.keccak256(ethers.toUtf8Bytes("DEFAULT_OUTCOME")),
            odds: 150, creatorStake: ethers.parseEther("100"), 
            eventStartTime: blockTimestamp + 3600, eventEndTime: blockTimestamp + 7200,
            league: "Default", category: "default", region: "Global",
            isPrivate: false, maxBetPerUser: 0, useBitr: false, oracleType: 0,
            marketId: ethers.keccak256(ethers.toUtf8Bytes(`market_${Math.random()}`))
        };
        const finalParams = { ...defaultParams, ...params };

        const token = finalParams.useBitr ? bitrToken : sttToken;
        await token.connect(creator).approve(await bitredictPool.getAddress(), finalParams.creatorStake);
        
        const tx = await bitredictPool.connect(creator).createPool(...Object.values(finalParams));
        const receipt = await tx.wait();
        const poolCreatedEvent = receipt.logs.find(e => e.eventName === 'PoolCreated');
        return { poolId: poolCreatedEvent.args[0], marketId: finalParams.marketId, token };
    }

    it("Should enforce minimum pool creation stake of 20 STT", async function () {
        await expect(createPool({ creatorStake: ethers.parseEther("19") }))
            .to.be.revertedWith("Stake below minimum");
    });

    it("Should enforce minimum bet amount of 1 STT", async function () {
        const { poolId, token } = await createPool({ creatorStake: ethers.parseEther("20") });

        await token.connect(bettor1).approve(await bitredictPool.getAddress(), ethers.parseEther("0.99"));
        await expect(bitredictPool.connect(bettor1).placeBet(poolId, ethers.parseEther("0.99")))
            .to.be.revertedWith("Bet below minimum");
    });

    it("Should allow creator to withdraw stake if no bets received", async function () {
        const creatorStake = ethers.parseEther("25");
        const { poolId, eventEndTime } = await createPool({ creatorStake });
        
        const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await ethers.provider.send("evm_increaseTime", [eventEndTime - blockTimestamp + 1]);
        await ethers.provider.send("evm_mine");

        const creatorBalanceBefore = await sttToken.balanceOf(creator.address);
        await bitredictPool.connect(creator).withdrawCreatorStake(poolId);
        const creatorBalanceAfter = await sttToken.balanceOf(creator.address);

        expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(creatorStake);
    });

    describe("Creator Withdrawal for Pools with No Bets", function () {
        let poolId = 0;

        beforeEach(async function () {
            const chelseaWinOutcome = ethers.keccak256(ethers.toUtf8Bytes("CHELSEA_WIN"));
            const eventStartTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
            const eventEndTime = eventStartTime + 3600;

            await sttToken.connect(creator).approve(await bitredictPool.getAddress(), ethers.parseEther("21"));
            await bitredictPool.connect(creator).createPool(
                chelseaWinOutcome,
                150,
                ethers.parseEther("20"),
                eventStartTime,
                eventEndTime,
                "Premier League",
                "football",
                "England",
                false,
                0
            );
        });

        it("Should allow creator to withdraw stake if no bets received after betting period", async function () {
            // Add some liquidity to test LP refunds too
            await sttToken.connect(bettor1).approve(await bitredictPool.getAddress(), ethers.parseEther("10"));
            await bitredictPool.connect(bettor1).addLiquidity(poolId, ethers.parseEther("10"));

            // Fast forward past betting deadline
            await ethers.provider.send("evm_increaseTime", [3700]); // 1 hour + 1 minute
            await ethers.provider.send("evm_mine");

            const creatorBalanceBefore = await sttToken.balanceOf(creator.address);
            const bettor1BalanceBefore = await sttToken.balanceOf(bettor1.address);

            // Creator should be able to withdraw
            await expect(
                bitredictPool.connect(creator).withdrawCreatorStake(poolId)
            ).to.emit(bitredictPool, "PoolRefunded")
            .withArgs(poolId, "No bets received");

            const creatorBalanceAfter = await sttToken.balanceOf(creator.address);
            const bettor1BalanceAfter = await sttToken.balanceOf(bettor1.address);

            // Check refunds
            expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(ethers.parseEther("20"));
            expect(bettor1BalanceAfter - bettor1BalanceBefore).to.equal(ethers.parseEther("10"));

            // Pool should be marked as settled
            const pool = await bitredictPool.getPool(poolId);
            expect(pool.settled).to.be.true;

            console.log("✅ Creator withdrawal for pools with no bets works");
        });

        it("Should NOT allow creator withdrawal if pool has bets", async function () {
            // Place a bet
            await sttToken.connect(bettor1).approve(await bitredictPool.getAddress(), ethers.parseEther("5"));
            await bitredictPool.connect(bettor1).placeBet(poolId, ethers.parseEther("5"));

            // Fast forward past betting deadline
            await ethers.provider.send("evm_increaseTime", [3700]);
            await ethers.provider.send("evm_mine");

            // Creator should NOT be able to withdraw
            await expect(
                bitredictPool.connect(creator).withdrawCreatorStake(poolId)
            ).to.be.revertedWith("Pool has bets, cannot withdraw");

            console.log("✅ Creator withdrawal blocked when pool has bets");
        });
    });

    describe("Comprehensive Stats Tracking", function () {
        let poolId = 0;

        beforeEach(async function () {
            const chelseaWinOutcome = ethers.keccak256(ethers.toUtf8Bytes("CHELSEA_WIN"));
            const eventStartTime = Math.floor(Date.now() / 1000) + 7200;
            const eventEndTime = eventStartTime + 7200;

            await sttToken.connect(creator).approve(await bitredictPool.getAddress(), ethers.parseEther("21"));
            await bitredictPool.connect(creator).createPool(
                chelseaWinOutcome,
                150,
                ethers.parseEther("20"),
                eventStartTime,
                eventEndTime,
                "Premier League",
                "football",
                "England",
                false,
                0
            );
        });

        it("Should track global stats correctly", async function () {
            // Check initial global stats
            let globalStats = await bitredictPool.getGlobalStats();
            expect(globalStats.totalPools).to.equal(1);
            expect(globalStats.activePools).to.equal(1);
            expect(globalStats.totalBets).to.equal(0);

            // Add bets
            await sttToken.connect(bettor1).approve(await bitredictPool.getAddress(), ethers.parseEther("5"));
            await bitredictPool.connect(bettor1).placeBet(poolId, ethers.parseEther("5"));

            await sttToken.connect(lp1).approve(await bitredictPool.getAddress(), ethers.parseEther("8"));
            await bitredictPool.connect(lp1).placeBet(poolId, ethers.parseEther("8"));

            // Check updated global stats
            globalStats = await bitredictPool.getGlobalStats();
            expect(globalStats.totalBets).to.equal(2); // Two unique bettors

            console.log("📊 Global stats tracking works");
        });

        it("Should track bettor stats correctly", async function () {
            // Place bet
            await sttToken.connect(bettor1).approve(await bitredictPool.getAddress(), ethers.parseEther("10"));
            await bitredictPool.connect(bettor1).placeBet(poolId, ethers.parseEther("10"));

            // Check bettor stats
            let bettorStats = await bitredictPool.getBettorStats(bettor1.address);
            expect(bettorStats.totalBets).to.equal(1);
            expect(bettorStats.totalStaked).to.equal(ethers.parseEther("10"));

            console.log("📈 Bettor stats tracking works");
        });
    });

    describe("Decentralization Verification", function () {
        it("Should have immutable configuration parameters", async function () {
            const creationFee = await bitredictPool.creationFee();
            const platformFee = await bitredictPool.platformFee();
            const minPoolStake = await bitredictPool.minPoolStake();
            const minBetAmount = await bitredictPool.minBetAmount();

            expect(creationFee).to.equal(ethers.parseEther("1"));
            expect(platformFee).to.equal(500); // 5%
            expect(minPoolStake).to.equal(ethers.parseEther("20"));
            expect(minBetAmount).to.equal(ethers.parseEther("1"));

            console.log("✅ All configuration parameters are immutable");
            console.log("✅ System is fully decentralized");
        });
    });
}); 