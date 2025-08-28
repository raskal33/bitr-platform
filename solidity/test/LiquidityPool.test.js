const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Liquidity Pool System - Creator vs Bettors", function () {
    let bitredictPool, bitrToken, sttToken, discountToken, owner, creator, lp1, lp2, bettor1, bettor2, feeCollector, oracleSigner, guidedOracle, optimisticOracle, currentTime;

    beforeEach(async function () {
        [owner, creator, lp1, lp2, bettor1, bettor2, feeCollector, oracleSigner] = await ethers.getSigners();

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        sttToken = await MockERC20.deploy("STT Token", "STT", 18, ethers.parseEther("10000000"));
        discountToken = await MockERC20.deploy("Predinex Token", "PDX", 18, ethers.parseEther("1000000"));
        bitrToken = await MockERC20.deploy("Bitredict Token", "BITR", 18, ethers.parseEther("10000000"));

        // Deploy BitredictPool
        const BitredictPool = await ethers.getContractFactory("BitredictPool");
        // Deploy mock oracles
        const MockGuidedOracle = await ethers.getContractFactory("MockGuidedOracle");
        const MockOptimisticOracle = await ethers.getContractFactory("MockOptimisticOracle");
        guidedOracle = await MockGuidedOracle.deploy();
        optimisticOracle = await MockOptimisticOracle.deploy();

        bitredictPool = await BitredictPool.deploy(
            await sttToken.getAddress(),
            await bitrToken.getAddress(),
            feeCollector.address,
            await guidedOracle.getAddress(),
            await optimisticOracle.getAddress()
        );

        // Add oracle signer
        // Note: Oracle signer functionality moved to external oracle contracts

        // Distribute tokens
        await sttToken.transfer(creator.address, ethers.parseEther("10000"));
        await sttToken.transfer(lp1.address, ethers.parseEther("10000"));
        await sttToken.transfer(lp2.address, ethers.parseEther("10000"));
        await sttToken.transfer(bettor1.address, ethers.parseEther("10000"));
        await sttToken.transfer(bettor2.address, ethers.parseEther("10000"));
        await bitrToken.transfer(creator.address, ethers.parseEther("50000"));

        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        currentTime = blockBefore.timestamp;
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

        await sttToken.connect(creator).approve(await bitredictPool.getAddress(), finalParams.creatorStake);
        const tx = await bitredictPool.connect(creator).createPool(...Object.values(finalParams));
        const receipt = await tx.wait();
        const poolCreatedEvent = receipt.logs.find(e => e.eventName === 'PoolCreated');
        return { poolId: poolCreatedEvent.args[0], marketId: finalParams.marketId };
    }

    describe("Chelsea vs Fulham - Correct Betting Logic", function () {
        let poolId = 0;
        let chelseaWinOutcome, fulhamWinOutcome, drawOutcome;

        beforeEach(async function () {
            // Create pool: Creator believes Chelsea WON'T win
            chelseaWinOutcome = ethers.keccak256(ethers.toUtf8Bytes("CHELSEA_WIN"));
            fulhamWinOutcome = ethers.keccak256(ethers.toUtf8Bytes("FULHAM_WIN"));
            drawOutcome = ethers.keccak256(ethers.toUtf8Bytes("DRAW"));

            const odds = 150; // 1.5x
            const creatorStake = ethers.parseEther("100");
            const eventStartTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
            const eventEndTime = eventStartTime + 7200; // 4 hours from now

            await sttToken.connect(creator).approve(await bitredictPool.getAddress(), ethers.parseEther("101"));
            await bitredictPool.connect(creator).createPool(
                chelseaWinOutcome, // Creator predicts this WON'T happen
                odds,
                creatorStake,
                eventStartTime,
                eventEndTime,
                "Premier League",
                "football",
                "England",
                false,
                0
            );

            console.log("🎯 Pool created:");
            console.log("   Creator believes: Chelsea WON'T win");
            console.log("   Creator stakes: 100 STT");
            console.log("   Odds: 1.5x");
        });

        it("Should allow liquidity providers to join creator's side", async function () {
            const { poolId } = await createPool();
            const lpAmount = ethers.parseEther("50");
            await sttToken.connect(lp1).approve(await bitredictPool.getAddress(), lpAmount);
            await bitredictPool.connect(lp1).addLiquidity(poolId, lpAmount);

            const pool = await bitredictPool.pools(poolId);
            expect(pool.totalCreatorSideStake).to.equal(ethers.parseEther("150"));
        });

        it("Should allow bettors to bet ON Chelsea winning", async function () {
            // Add some liquidity first
            await sttToken.connect(lp1).approve(await bitredictPool.getAddress(), ethers.parseEther("50"));
            await bitredictPool.connect(lp1).addLiquidity(poolId, ethers.parseEther("50"));

            // Bettors think Chelsea WILL win, bet on it
            const bet1Amount = ethers.parseEther("60");
            const bet2Amount = ethers.parseEther("90");
            
            await sttToken.connect(bettor1).approve(await bitredictPool.getAddress(), bet1Amount);
            await sttToken.connect(bettor2).approve(await bitredictPool.getAddress(), bet2Amount);
            
            await expect(
                bitredictPool.connect(bettor1).placeBet(poolId, bet1Amount)
            ).to.emit(bitredictPool, "BetPlaced")
            .withArgs(poolId, bettor1.address, bet1Amount, true);

            await bitredictPool.connect(bettor2).placeBet(poolId, bet2Amount);

            console.log("🎲 Bets placed:");
            console.log("   Bettor1: 60 STT (believes Chelsea WILL win)");
            console.log("   Bettor2: 90 STT (believes Chelsea WILL win)");
            console.log("   Total bettor side: 150 STT");

            // Check bettor stakes
            expect(await bitredictPool.getBettorStake(poolId, bettor1.address)).to.equal(bet1Amount);
            expect(await bitredictPool.getBettorStake(poolId, bettor2.address)).to.equal(bet2Amount);

            const status = await bitredictPool.getPoolStatus(poolId);
            expect(status.totalBettorStaked).to.equal(ethers.parseEther("150"));
        });

        it("Creator side wins when Chelsea DOESN'T win (Fulham wins)", async function () {
            // Set up the complete scenario
            await sttToken.connect(lp1).approve(await bitredictPool.getAddress(), ethers.parseEther("50"));
            await bitredictPool.connect(lp1).addLiquidity(poolId, ethers.parseEther("50"));
            
            await sttToken.connect(lp2).approve(await bitredictPool.getAddress(), ethers.parseEther("30"));
            await bitredictPool.connect(lp2).addLiquidity(poolId, ethers.parseEther("30"));

            await sttToken.connect(bettor1).approve(await bitredictPool.getAddress(), ethers.parseEther("60"));
            await bitredictPool.connect(bettor1).placeBet(poolId, ethers.parseEther("60"));
            
            await sttToken.connect(bettor2).approve(await bitredictPool.getAddress(), ethers.parseEther("90"));
            await bitredictPool.connect(bettor2).placeBet(poolId, ethers.parseEther("90"));

            console.log("\n📊 Pool setup complete:");
            console.log("   Creator side: 180 STT (Creator: 100, LP1: 50, LP2: 30)");
            console.log("   Bettor side: 150 STT (Bettor1: 60, Bettor2: 90)");
            console.log("   Total pool: 330 STT");

            // Fast forward past event end
            await ethers.provider.send("evm_increaseTime", [14400]); // 4 hours
            await ethers.provider.send("evm_mine");

            // Oracle reports: Fulham wins (Chelsea didn't win)
            const messageHash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32"], [poolId, fulhamWinOutcome])
            );
            const signature = await oracleSigner.signMessage(ethers.getBytes(messageHash));

            await bitredictPool.settlePoolWithSignature(poolId, fulhamWinOutcome, signature);

            const pool = await bitredictPool.getPool(poolId);
            expect(pool.creatorSideWon).to.be.true; // Creator was right, Chelsea didn't win

            console.log("\n🏆 Result: Fulham wins");
            console.log("   Creator side was CORRECT (Chelsea didn't win)");
            console.log("   Creator side gets everything!");

            // Creator claims proportional share
            const creatorBalanceBefore = await sttToken.balanceOf(creator.address);
            await bitredictPool.connect(creator).claim(poolId);
            const creatorBalanceAfter = await sttToken.balanceOf(creator.address);
            
            // Creator's share: 100/180 = 55.56% of total
            const creatorShare = (100n * 10000n) / 180n; // 5555 basis points
            const creatorReward = 100n + ((150n * creatorShare) / 10000n); // ~183.33 STT
            expect(creatorBalanceAfter - creatorBalanceBefore).to.be.closeTo(
                ethers.parseEther("183.333333333333333333"), 
                ethers.parseEther("0.001")
            );

            console.log(`   Creator gets: ${ethers.formatEther(creatorBalanceAfter - creatorBalanceBefore)} STT`);

            // LP1 claims proportional share
            const lp1BalanceBefore = await sttToken.balanceOf(lp1.address);
            await bitredictPool.connect(lp1).claim(poolId);
            const lp1BalanceAfter = await sttToken.balanceOf(lp1.address);
            
            // LP1's share: 50/180 = 27.78% of total
            const lp1Share = (50n * 10000n) / 180n; // 2777 basis points
            const lp1Reward = 50n + ((150n * lp1Share) / 10000n); // ~91.67 STT
            expect(lp1BalanceAfter - lp1BalanceBefore).to.be.closeTo(
                ethers.parseEther("91.666666666666666666"),
                ethers.parseEther("0.001")
            );

            console.log(`   LP1 gets: ${ethers.formatEther(lp1BalanceAfter - lp1BalanceBefore)} STT`);

            // Bettors should have nothing to claim (they lost)
            await expect(
                bitredictPool.connect(bettor1).claim(poolId)
            ).to.be.revertedWith("No bet placed");

            console.log("   Bettors get: NOTHING (they lost)");
        });

        it("Bettors win when Chelsea actually wins", async function () {
            // Set up the scenario
            await sttToken.connect(lp1).approve(await bitredictPool.getAddress(), ethers.parseEther("50"));
            await bitredictPool.connect(lp1).addLiquidity(poolId, ethers.parseEther("50"));

            await sttToken.connect(bettor1).approve(await bitredictPool.getAddress(), ethers.parseEther("60"));
            await bitredictPool.connect(bettor1).placeBet(poolId, ethers.parseEther("60"));

            // Fast forward past event end
            await ethers.provider.send("evm_increaseTime", [14400]);
            await ethers.provider.send("evm_mine");

            // Oracle reports: Chelsea wins
            const messageHash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32"], [poolId, chelseaWinOutcome])
            );
            const signature = await oracleSigner.signMessage(ethers.getBytes(messageHash));

            await bitredictPool.settlePoolWithSignature(poolId, chelseaWinOutcome, signature);

            const pool = await bitredictPool.getPool(poolId);
            expect(pool.creatorSideWon).to.be.false; // Creator was wrong, Chelsea did win

            console.log("\n💥 Result: Chelsea wins");
            console.log("   Creator side was WRONG (Chelsea did win)");
            console.log("   Bettors win everything!");

            // Bettor1 claims winnings
            const bettor1BalanceBefore = await sttToken.balanceOf(bettor1.address);
            await bitredictPool.connect(bettor1).claim(poolId);
            const bettor1BalanceAfter = await sttToken.balanceOf(bettor1.address);
            
            // Bettor1 gets: 60 * 1.5 = 90 STT (minus platform fee)
            const expectedPayout = (60n * 150n) / 100n; // 90 STT
            const profit = expectedPayout - 60n; // 30 STT profit
            const feeRate = await bitredictPool.adjustedFeeRate(bettor1.address);
            const fee = (profit * feeRate) / 10000n;
            const finalPayout = expectedPayout - fee;
            
            expect(bettor1BalanceAfter - bettor1BalanceBefore).to.equal(finalPayout);

            console.log(`   Bettor1 gets: ${ethers.formatEther(bettor1BalanceAfter - bettor1BalanceBefore)} STT`);

            // Creator and LPs should have nothing to claim (they lost everything)
            await expect(
                bitredictPool.connect(creator).claim(poolId)
            ).to.be.revertedWith("No liquidity provided");

            await expect(
                bitredictPool.connect(lp1).claim(poolId)
            ).to.be.revertedWith("No liquidity provided");

            console.log("   Creator & LPs get: NOTHING (they lost everything)");
        });
    });

    describe("Dynamic Pool Capacity", function () {
        it("Should increase bettor capacity as liquidity is added", async function () {
            const { poolId } = await createPool({ odds: 200 }); // 2x odds
            let pool = await bitredictPool.pools(poolId);
            const initialMaxStake = pool.maxBettorStake;

            const lpAmount = ethers.parseEther("100");
            await sttToken.connect(lp1).approve(await bitredictPool.getAddress(), lpAmount);
            await bitredictPool.connect(lp1).addLiquidity(poolId, lpAmount);

            pool = await bitredictPool.pools(poolId);
            const newMaxStake = pool.maxBettorStake;
            expect(newMaxStake).to.be.gt(initialMaxStake);
            expect(newMaxStake).to.equal(ethers.parseEther("200")); // (100 creator + 100 LP) / (2 - 1)
        });
    });
}); 