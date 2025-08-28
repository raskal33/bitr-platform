const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BitredictPool - Integration & Edge Cases", function () {
    let bitredictPool, sttToken, bitrToken, owner, creator, bettor1, bettor2, lp1, lp2, feeCollector, guidedOracle, optimisticOracle;

    beforeEach(async function () {
        [owner, creator, bettor1, bettor2, lp1, lp2, feeCollector] = await ethers.getSigners();

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

        await sttToken.transfer(creator.address, ethers.parseEther("100000"));
        await sttToken.transfer(bettor1.address, ethers.parseEther("10000"));
        await sttToken.transfer(bettor2.address, ethers.parseEther("10000"));
        await sttToken.transfer(lp1.address, ethers.parseEther("10000"));
        await sttToken.transfer(lp2.address, ethers.parseEther("10000"));
        await bitrToken.transfer(bettor1.address, ethers.parseEther("10000"));
    });

    async function createPool(params) {
        const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
        const defaultParams = {
            predictedOutcome: ethers.keccak256(ethers.toUtf8Bytes("DEFAULT_OUTCOME")),
            odds: 150,
            creatorStake: ethers.parseEther("100"),
            eventStartTime: blockTimestamp + 3600,
            eventEndTime: blockTimestamp + 7200,
            league: "Default League",
            category: "default",
            region: "Global",
            isPrivate: false,
            maxBetPerUser: 0,
            useBitr: false,
            oracleType: 0,
            marketId: ethers.keccak256(ethers.toUtf8Bytes(`market_${Math.random()}`))
        };
        const finalParams = { ...defaultParams, ...params };

        const token = finalParams.useBitr ? bitrToken : sttToken;
        await token.connect(creator).approve(await bitredictPool.getAddress(), finalParams.creatorStake);

        const tx = await bitredictPool.connect(creator).createPool(
            finalParams.predictedOutcome,
            finalParams.odds,
            finalParams.creatorStake,
            finalParams.eventStartTime,
            finalParams.eventEndTime,
            finalParams.league,
            finalParams.category,
            finalParams.region,
            finalParams.isPrivate,
            finalParams.maxBetPerUser,
            finalParams.useBitr,
            finalParams.oracleType,
            finalParams.marketId
        );
        
        const receipt = await tx.wait();
        const poolCreatedEvent = receipt.logs.find(e => e.eventName === 'PoolCreated');
        const poolId = poolCreatedEvent.args[0];
        
        return { poolId, marketId: finalParams.marketId, token };
    }

    it("Should handle pool with multiple participants", async function () {
        const { poolId } = await createPool({ creatorStake: ethers.parseEther("1000") });

        const betAmount = ethers.parseEther("10");
        const accounts = [bettor1, bettor2, lp1, lp2];
        
        for (const account of accounts) {
            await sttToken.connect(account).approve(await bitredictPool.getAddress(), betAmount);
            await bitredictPool.connect(account).placeBet(poolId, betAmount);
        }

        const pool = await bitredictPool.pools(poolId);
        expect(pool.bettorCount).to.equal(accounts.length);
    });

    it("Should handle complex whitelist management", async function () {
        const { poolId } = await createPool({ isPrivate: true });

        const whitelistedUsers = [bettor1.address, bettor2.address];
        await bitredictPool.connect(creator).addToWhitelist(poolId, whitelistedUsers);

        for (const user of whitelistedUsers) {
            expect(await bitredictPool.poolWhitelist(poolId, user)).to.be.true;
        }

        await sttToken.connect(bettor1).approve(await bitredictPool.getAddress(), ethers.parseEther("10"));
        await expect(bitredictPool.connect(bettor1).placeBet(poolId, ethers.parseEther("10"))).to.not.be.reverted;

        await bitredictPool.connect(creator).removeFromWhitelist(poolId, [bettor2.address]);
        expect(await bitredictPool.poolWhitelist(poolId, bettor2.address)).to.be.false;

        await expect(bitredictPool.connect(bettor2).placeBet(poolId, ethers.parseEther("10")))
            .to.be.revertedWith("Not on whitelist");
    });
    
    it("Should handle precision in calculations", async function () {
        const { poolId, marketId, token } = await createPool({ odds: 101 }); // 1.01x odds
        const minBet = ethers.parseEther("1");

        await token.connect(bettor1).approve(await bitredictPool.getAddress(), minBet);
        await bitredictPool.connect(bettor1).placeBet(poolId, minBet);

        await ethers.provider.send("evm_increaseTime", [7201]);
        await ethers.provider.send("evm_mine");

        await guidedOracle.submitOutcome(marketId, ethers.keccak256(ethers.toUtf8Bytes("DIFFERENT")));
        await bitredictPool.settlePool(poolId);
        
        await expect(bitredictPool.connect(bettor1).claim(poolId)).to.not.be.reverted;
    });
}); 