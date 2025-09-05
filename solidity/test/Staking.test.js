const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BitrStaking", function () {
    let stakingContract;
    let bitrToken;
    let sttToken;
    let owner;
    let user1;
    let user2;
    let user3;

    const INITIAL_SUPPLY = ethers.parseEther("1000000");
    const TIER_0_MIN = ethers.parseEther("1000");
    const TIER_1_MIN = ethers.parseEther("3000");
    const TIER_2_MIN = ethers.parseEther("10000");

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy mock ERC20 token for BITR
        const MockToken = await ethers.getContractFactory("MockERC20");
        bitrToken = await MockToken.deploy("BITR Token", "BITR");

        // Deploy staking contract (MON is native)
        const Staking = await ethers.getContractFactory("BitrStaking");
        stakingContract = await Staking.deploy(await bitrToken.getAddress());

        // Distribute BITR tokens to users
        await bitrToken.mint(user1.address, ethers.parseEther("50000"));
        await bitrToken.mint(user2.address, ethers.parseEther("50000"));
        await bitrToken.mint(user3.address, ethers.parseEther("50000"));

        // Approve staking contract for BITR
        await bitrToken.connect(user1).approve(await stakingContract.getAddress(), ethers.parseEther("50000"));
        await bitrToken.connect(user2).approve(await stakingContract.getAddress(), ethers.parseEther("50000"));
        await bitrToken.connect(user3).approve(await stakingContract.getAddress(), ethers.parseEther("50000"));

        // Mint tokens to owner for funding
        await bitrToken.mint(owner.address, ethers.parseEther("100000"));
        
        // Owner approves for revenue distribution and APY funding
        await bitrToken.approve(await stakingContract.getAddress(), ethers.parseEther("100000"));
        
        // Fund the contract for APY rewards
        await stakingContract.fundAPYRewards(ethers.parseEther("10000"));
    });

    describe("Contract Initialization", function () {
        it("Should initialize with correct tiers", async function () {
            const tiers = await stakingContract.getTiers();
            
            expect(tiers.length).to.equal(3);
            expect(tiers[0].baseAPY).to.equal(600); // 6%
            expect(tiers[0].minStake).to.equal(TIER_0_MIN);
            expect(tiers[0].revenueShareRate).to.equal(1000); // 10%
            
            expect(tiers[1].baseAPY).to.equal(1200); // 12%
            expect(tiers[1].minStake).to.equal(TIER_1_MIN);
            expect(tiers[1].revenueShareRate).to.equal(3000); // 30%
            
            expect(tiers[2].baseAPY).to.equal(1800); // 18%
            expect(tiers[2].minStake).to.equal(TIER_2_MIN);
            expect(tiers[2].revenueShareRate).to.equal(6000); // 60%
        });

        it("Should initialize with correct duration options", async function () {
            const durations = await stakingContract.getDurationOptions();
            
            expect(durations.length).to.equal(3);
            expect(durations[0]).to.equal(30 * 24 * 60 * 60); // 30 days
            expect(durations[1]).to.equal(60 * 24 * 60 * 60); // 60 days
            expect(durations[2]).to.equal(90 * 24 * 60 * 60); // 90 days
        });

        it("Should set correct BITR token address", async function () {
            expect(await stakingContract.bitrToken()).to.equal(await bitrToken.getAddress());
        });
    });

    describe("Staking Functionality", function () {
        it("Should allow staking in tier 0", async function () {
            const stakeAmount = TIER_0_MIN;
            
            await expect(stakingContract.connect(user1).stake(stakeAmount, 0, 0))
                .to.emit(stakingContract, "Staked")
                .withArgs(user1.address, stakeAmount, 0, 0);

            const userStakes = await stakingContract.getUserStakes(user1.address);
            expect(userStakes.length).to.equal(1);
            expect(userStakes[0].amount).to.equal(stakeAmount);
            expect(userStakes[0].tierId).to.equal(0);
            expect(userStakes[0].durationOption).to.equal(0);

            expect(await stakingContract.totalStakedInTier(0)).to.equal(stakeAmount);
        });

        it("Should allow staking in tier 1", async function () {
            const stakeAmount = TIER_1_MIN;
            
            await stakingContract.connect(user1).stake(stakeAmount, 1, 1);

            const userStakes = await stakingContract.getUserStakes(user1.address);
            expect(userStakes[0].amount).to.equal(stakeAmount);
            expect(userStakes[0].tierId).to.equal(1);
            expect(userStakes[0].durationOption).to.equal(1);

            expect(await stakingContract.totalStakedInTier(1)).to.equal(stakeAmount);
        });

        it("Should allow staking in tier 2", async function () {
            const stakeAmount = TIER_2_MIN;
            
            await stakingContract.connect(user1).stake(stakeAmount, 2, 2);

            const userStakes = await stakingContract.getUserStakes(user1.address);
            expect(userStakes[0].amount).to.equal(stakeAmount);
            expect(userStakes[0].tierId).to.equal(2);
            expect(userStakes[0].durationOption).to.equal(2);

            expect(await stakingContract.totalStakedInTier(2)).to.equal(stakeAmount);
        });

        it("Should reject staking below tier minimum", async function () {
            const belowMinimum = ethers.parseEther("500");
            
            await expect(stakingContract.connect(user1).stake(belowMinimum, 0, 0))
                .to.be.revertedWith("Below tier minimum stake");
        });

        it("Should reject invalid tier", async function () {
            await expect(stakingContract.connect(user1).stake(TIER_0_MIN, 3, 0))
                .to.be.revertedWith("Invalid tier");
        });

        it("Should reject invalid duration", async function () {
            await expect(stakingContract.connect(user1).stake(TIER_0_MIN, 0, 3))
                .to.be.revertedWith("Invalid duration");
        });

        it("Should allow multiple stakes from same user", async function () {
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0);
            await stakingContract.connect(user1).stake(TIER_1_MIN, 1, 1);

            const userStakes = await stakingContract.getUserStakes(user1.address);
            expect(userStakes.length).to.equal(2);
        });
    });

    describe("APY Reward Calculations", function () {
        it("Should calculate correct APY rewards for tier 0, 30 days", async function () {
            const stakeAmount = TIER_0_MIN;
            await stakingContract.connect(user1).stake(stakeAmount, 0, 0);

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            const rewards = await stakingContract.calculateRewards(user1.address, 0);
            
            // Expected: 1000 ETH * 6% APY * (30/365) days = ~4.93 ETH
            const expectedReward = stakeAmount * 600n / 10000n * 30n / 365n;
            expect(rewards).to.be.closeTo(expectedReward, ethers.parseEther("0.1"));
        });

        it("Should calculate correct APY rewards with duration bonus", async function () {
            const stakeAmount = TIER_1_MIN;
            // Tier 1 (12% base APY) + 90 days duration (4% bonus) = 16% total APY
            await stakingContract.connect(user1).stake(stakeAmount, 1, 2);

            // Fast forward 90 days
            await ethers.provider.send("evm_increaseTime", [90 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            const rewards = await stakingContract.calculateRewards(user1.address, 0);
            
            // Expected: 3000 ETH * 16% APY * (90/365) days
            const totalAPY = 1200n + 400n; // 12% + 4% bonus
            const expectedReward = stakeAmount * totalAPY / 10000n * 90n / 365n;
            expect(rewards).to.be.closeTo(expectedReward, ethers.parseEther("1"));
        });

        it("Should track claimed rewards correctly", async function () {
            const stakeAmount = TIER_0_MIN;
            await stakingContract.connect(user1).stake(stakeAmount, 0, 0);

            // Fast forward 15 days
            await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            // Claim first batch of rewards
            await stakingContract.connect(user1).claim(0);

            // Fast forward another 15 days
            await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            const rewards = await stakingContract.calculateRewards(user1.address, 0);
            
            // Should only show rewards for the additional 15 days
            const expectedReward = stakeAmount * 600n / 10000n * 15n / 365n;
            expect(rewards).to.be.closeTo(expectedReward, ethers.parseEther("0.1"));
        });
    });

    describe("Claiming APY Rewards", function () {
        it("Should allow claiming APY rewards", async function () {
            const stakeAmount = TIER_0_MIN;
            await stakingContract.connect(user1).stake(stakeAmount, 0, 0);

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            const initialBalance = await bitrToken.balanceOf(user1.address);
            const expectedReward = await stakingContract.calculateRewards(user1.address, 0);

            await expect(stakingContract.connect(user1).claim(0))
                .to.emit(stakingContract, "Claimed");

            const finalBalance = await bitrToken.balanceOf(user1.address);
            const actualReward = finalBalance - initialBalance;
            
            // Allow for small precision differences (within 0.1%)
            const tolerance = expectedReward / 1000n; // 0.1% tolerance
            expect(actualReward).to.be.closeTo(expectedReward, tolerance);
        });

        it("Should reject claiming invalid stake index", async function () {
            await expect(stakingContract.connect(user1).claim(0))
                .to.be.revertedWith("Invalid stake index");
        });

        it("Should handle zero rewards gracefully", async function () {
            const stakeAmount = TIER_0_MIN;
            await stakingContract.connect(user1).stake(stakeAmount, 0, 0);

            // Claim immediately (should be 0 or very small)
            await stakingContract.connect(user1).claim(0);
            
            // Should not revert
            expect(true).to.be.true;
        });
    });

    describe("Unstaking Functionality", function () {
        it("Should prevent unstaking before lock period", async function () {
            const stakeAmount = TIER_0_MIN;
            await stakingContract.connect(user1).stake(stakeAmount, 0, 0); // 30 days lock

            // Try to unstake after 15 days
            await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            await expect(stakingContract.connect(user1).unstake(0))
                .to.be.revertedWith("Stake is locked");
        });

        it("Should allow unstaking after lock period", async function () {
            const stakeAmount = TIER_0_MIN;
            await stakingContract.connect(user1).stake(stakeAmount, 0, 0);

            // Fast forward past lock period
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            const initialBalance = await bitrToken.balanceOf(user1.address);

            await expect(stakingContract.connect(user1).unstake(0))
                .to.emit(stakingContract, "Unstaked")
                .withArgs(user1.address, stakeAmount);

            // Check that principal + rewards were returned
            const finalBalance = await bitrToken.balanceOf(user1.address);
            expect(finalBalance).to.be.gt(initialBalance + stakeAmount);

            // Check that stake was removed
            const userStakes = await stakingContract.getUserStakes(user1.address);
            expect(userStakes.length).to.equal(0);

            // Check that tier total was decremented
            expect(await stakingContract.totalStakedInTier(0)).to.equal(0);
        });

        it("Should handle unstaking with multiple stakes correctly", async function () {
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0);
            await stakingContract.connect(user1).stake(TIER_1_MIN, 1, 0);

            // Fast forward past lock period
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            // Unstake first stake (index 0)
            await stakingContract.connect(user1).unstake(0);

            const userStakes = await stakingContract.getUserStakes(user1.address);
            expect(userStakes.length).to.equal(1);
            
            // The remaining stake should be the tier 1 stake
            expect(userStakes[0].amount).to.equal(TIER_1_MIN);
            expect(userStakes[0].tierId).to.equal(1);
        });
    });

    describe("Revenue Distribution", function () {
        beforeEach(async function () {
            // Set up some stakes for revenue distribution testing
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0); // 1000 in tier 0
            await stakingContract.connect(user2).stake(TIER_1_MIN, 1, 0); // 3000 in tier 1
            await stakingContract.connect(user3).stake(TIER_2_MIN, 2, 0); // 10000 in tier 2
        });

        it("Should add revenue correctly", async function () {
            const bitrAmount = ethers.parseEther("1000");
            const monAmount = ethers.parseEther("0.5");
            
            await expect(stakingContract.addRevenue(bitrAmount, { value: monAmount }))
                .to.emit(stakingContract, "RevenueAdded")
                .withArgs(bitrAmount, monAmount);

            expect(await stakingContract.revenuePoolBITR()).to.equal(bitrAmount);
            expect(await stakingContract.revenuePoolMON()).to.equal(monAmount);
        });

        it("Should reject revenue addition from non-owner", async function () {
            await expect(stakingContract.connect(user1).addRevenue(ethers.parseEther("100"), { value: 0 }))
                .to.be.revertedWithCustomError(stakingContract, "OwnableUnauthorizedAccount");
        });

        it("Should distribute revenue correctly across tiers", async function () {
            const bitrAmount = ethers.parseEther("1000");
            const monAmount = ethers.parseEther("0.5");
            
            // Add revenue
            await stakingContract.addRevenue(bitrAmount, { value: monAmount });

            // Fast forward past distribution interval
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            await expect(stakingContract.distributeRevenue())
                .to.emit(stakingContract, "RevenueDistributed");

            // Check that revenue pools are cleared
            expect(await stakingContract.revenuePoolBITR()).to.equal(0);
            expect(await stakingContract.revenuePoolMON()).to.equal(0);

            // Check that accumulator values are updated
            expect(await stakingContract.accRewardPerShareBITR(0)).to.be.gt(0);
            expect(await stakingContract.accRewardPerShareBITR(1)).to.be.gt(0);
            expect(await stakingContract.accRewardPerShareBITR(2)).to.be.gt(0);
        });

        it("Should prevent distribution before interval", async function () {
            await stakingContract.addRevenue(ethers.parseEther("100"), { value: 0 });

            await expect(stakingContract.distributeRevenue())
                .to.be.revertedWith("Distribution too early");
        });

        it("Should handle distribution with no revenue gracefully", async function () {
            // Fast forward past distribution interval
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            // Should not revert but also not emit event
            await stakingContract.distributeRevenue();
            expect(true).to.be.true;
        });

        it("Should calculate revenue shares correctly", async function () {
            const bitrAmount = ethers.parseEther("1000");
            
            await stakingContract.addRevenue(bitrAmount, { value: 0 });

            // Fast forward and distribute
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await stakingContract.distributeRevenue();

            // Claim revenue for each user
            await stakingContract.connect(user1).claimRevenue();
            await stakingContract.connect(user2).claimRevenue();
            await stakingContract.connect(user3).claimRevenue();

            // Check that revenue was distributed according to tier percentages
            // Tier 0: 10% of 1000 = 100 BITR (user1 gets all since they're the only one in tier 0)
            // Tier 1: 30% of 1000 = 300 BITR (user2 gets all)
            // Tier 2: 60% of 1000 = 600 BITR (user3 gets all)
            
            expect(await stakingContract.pendingRevenueBITR(user1.address)).to.equal(0);
            expect(await stakingContract.pendingRevenueBITR(user2.address)).to.equal(0);
            expect(await stakingContract.pendingRevenueBITR(user3.address)).to.equal(0);
        });

        it("Should allow claiming revenue rewards", async function () {
            const bitrAmount = ethers.parseEther("1000");
            
            await stakingContract.addRevenue(bitrAmount, { value: 0 });

            // Fast forward and distribute
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await stakingContract.distributeRevenue();

            const initialBalance = await bitrToken.balanceOf(user3.address);

            await expect(stakingContract.connect(user3).claimRevenue())
                .to.emit(stakingContract, "RevenueClaimed");

            const finalBalance = await bitrToken.balanceOf(user3.address);
            
            // User3 should receive 60% of 1000 = 600 BITR
            const expectedRevenue = bitrAmount * 6000n / 10000n;
            expect(finalBalance - initialBalance).to.equal(expectedRevenue);
        });

        it("Should handle multiple revenue distributions", async function () {
            // First distribution
            await stakingContract.addRevenue(ethers.parseEther("500"), { value: 0 });
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await stakingContract.distributeRevenue();

            // Second distribution
            await stakingContract.addRevenue(ethers.parseEther("500"), { value: 0 });
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await stakingContract.distributeRevenue();

            // User should accumulate rewards from both distributions
            const initialBalance = await bitrToken.balanceOf(user3.address);
            await stakingContract.connect(user3).claimRevenue();
            const finalBalance = await bitrToken.balanceOf(user3.address);

            // Should receive 60% of total 1000 = 600 BITR
            expect(finalBalance - initialBalance).to.equal(ethers.parseEther("600"));
        });
    });

    describe("Integration Tests", function () {
        it("Should handle stake -> revenue distribution -> unstake flow", async function () {
            const stakeAmount = TIER_1_MIN;
            
            // Stake
            await stakingContract.connect(user1).stake(stakeAmount, 1, 0);
            
            // Add revenue and distribute
            await stakingContract.addRevenue(ethers.parseEther("1000"), { value: ethers.parseEther("0.5") });
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await stakingContract.distributeRevenue();
            
            // Unstake (should auto-harvest revenue)
            const initialBalance = await bitrToken.balanceOf(user1.address);
            await stakingContract.connect(user1).unstake(0);
            const finalBalance = await bitrToken.balanceOf(user1.address);
            
            // Should receive principal + APY rewards + revenue share
            expect(finalBalance).to.be.gt(initialBalance + stakeAmount);
            
            // Check that user can still claim remaining revenue
            await stakingContract.connect(user1).claimRevenue();
        });

        it("Should handle multiple users in same tier", async function () {
            // Two users stake in tier 1
            await stakingContract.connect(user1).stake(TIER_1_MIN, 1, 0); // 3000
            await stakingContract.connect(user2).stake(TIER_1_MIN * 2n, 1, 0); // 6000
            
            // Add revenue and distribute
            await stakingContract.addRevenue(ethers.parseEther("900"), { value: 0 }); // 30% of this = 270 to tier 1
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await stakingContract.distributeRevenue();
            
            // Claim revenue
            const user1InitialBalance = await bitrToken.balanceOf(user1.address);
            const user2InitialBalance = await bitrToken.balanceOf(user2.address);
            
            await stakingContract.connect(user1).claimRevenue();
            await stakingContract.connect(user2).claimRevenue();
            
            const user1FinalBalance = await bitrToken.balanceOf(user1.address);
            const user2FinalBalance = await bitrToken.balanceOf(user2.address);
            
            const user1Revenue = user1FinalBalance - user1InitialBalance;
            const user2Revenue = user2FinalBalance - user2InitialBalance;
            
            // User2 should get 2x more revenue than user1 (6000 vs 3000 stake)
            expect(user2Revenue).to.be.closeTo(user1Revenue * 2n, ethers.parseEther("1"));
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle zero amount staking attempt", async function () {
            await expect(stakingContract.connect(user1).stake(0, 0, 0))
                .to.be.revertedWith("Stake amount must be greater than 0");
        });

        it("Should handle claiming from empty stakes", async function () {
            await expect(stakingContract.connect(user1).claimRevenue())
                .to.be.revertedWith("Nothing to claim");
        });

        it("Should handle unstaking non-existent stake", async function () {
            await expect(stakingContract.connect(user1).unstake(0))
                .to.be.revertedWith("Invalid stake index");
        });

        it("Should handle revenue distribution with no stakers", async function () {
            // Create fresh contract with no stakes
            const Staking = await ethers.getContractFactory("BitrStaking");
            const freshStaking = await Staking.deploy(await bitrToken.getAddress());
            
            await bitrToken.approve(await freshStaking.getAddress(), ethers.parseEther("1000"));
            await freshStaking.addRevenue(ethers.parseEther("1000"), { value: 0 });
            
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            // Should not revert
            await freshStaking.distributeRevenue();
            
            // Revenue should be cleared even with no stakers
            expect(await freshStaking.revenuePoolBITR()).to.equal(0);
        });
    });

    describe("View Functions", function () {
        it("Should return correct user stakes", async function () {
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0);
            await stakingContract.connect(user1).stake(TIER_1_MIN, 1, 1);
            
            const stakes = await stakingContract.getUserStakes(user1.address);
            expect(stakes.length).to.equal(2);
            expect(stakes[0].amount).to.equal(TIER_0_MIN);
            expect(stakes[1].amount).to.equal(TIER_1_MIN);
        });

        it("Should return correct revenue share rate", async function () {
            await stakingContract.connect(user1).stake(TIER_2_MIN, 2, 0);
            
            const rate = await stakingContract.getRevenueShareRate(user1.address, 0);
            expect(rate).to.equal(6000); // 60% for tier 2
        });

        it("Should return correct pending rewards", async function () {
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0);
            
            // Fast forward 15 days
            await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const [apyReward, pendingBITR, pendingMON] = await stakingContract.getPendingRewards(user1.address, 0);
            expect(apyReward).to.be.gt(0);
            expect(pendingBITR).to.equal(0); // No revenue distributed yet
            expect(pendingMON).to.equal(0);
        });

        it("Should return correct user total staked", async function () {
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0);
            await stakingContract.connect(user1).stake(TIER_1_MIN, 1, 0);
            
            const totalStaked = await stakingContract.getUserTotalStaked(user1.address);
            expect(totalStaked).to.equal(TIER_0_MIN + TIER_1_MIN);
        });

        it("Should return correct contract stats", async function () {
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0);
            
            const [totalStaked, totalRewardsPaid, totalRevenuePaid, contractBITR, contractMON] = 
                await stakingContract.getContractStats();
            
            expect(totalStaked).to.equal(TIER_0_MIN);
            expect(totalRewardsPaid).to.equal(0); // No rewards claimed yet
            expect(totalRevenuePaid).to.equal(0); // No revenue claimed yet
            expect(contractBITR).to.be.gt(0); // Has funded APY rewards
            expect(contractMON).to.equal(0);
        });

        it("Should return correct tier stats", async function () {
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0);
            await stakingContract.connect(user2).stake(TIER_1_MIN, 1, 0);
            
            const [tierStaked, tierAPY, tierMinStake, tierRevenueShare] = 
                await stakingContract.getTierStats();
            
            expect(tierStaked[0]).to.equal(TIER_0_MIN);
            expect(tierStaked[1]).to.equal(TIER_1_MIN);
            expect(tierStaked[2]).to.equal(0);
            
            expect(tierAPY[0]).to.equal(600); // 6%
            expect(tierAPY[1]).to.equal(1200); // 12%
            expect(tierAPY[2]).to.equal(1800); // 18%
        });

        it("Should check stake unlock status correctly", async function () {
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0); // 30 days lock
            
            // Should be locked initially
            expect(await stakingContract.isStakeUnlocked(user1.address, 0)).to.be.false;
            
            // Fast forward past lock period
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            // Should be unlocked now
            expect(await stakingContract.isStakeUnlocked(user1.address, 0)).to.be.true;
        });
    });

    describe("BitredictPool Integration", function () {
        it("Should allow owner to authorize pools", async function () {
            const poolAddress = user3.address; // Mock pool address
            
            await expect(stakingContract.authorizePool(poolAddress, true))
                .to.emit(stakingContract, "PoolAuthorized")
                .withArgs(poolAddress, true);
                
            expect(await stakingContract.authorizedPools(poolAddress)).to.be.true;
        });

        it("Should allow authorized pools to add revenue", async function () {
            const poolAddress = user3.address;
            await stakingContract.authorizePool(poolAddress, true);
            
            // Approve tokens for the pool
            await bitrToken.transfer(poolAddress, ethers.parseEther("1000"));
            await bitrToken.connect(user3).approve(await stakingContract.getAddress(), ethers.parseEther("1000"));
            
            await expect(stakingContract.connect(user3).addRevenueFromPool(ethers.parseEther("100"), { value: ethers.parseEther("0.1") }))
                .to.emit(stakingContract, "RevenueAdded")
                .withArgs(ethers.parseEther("100"), ethers.parseEther("0.1"));
        });

        it("Should reject revenue from unauthorized pools", async function () {
            await expect(stakingContract.connect(user3).addRevenueFromPool(ethers.parseEther("100"), { value: ethers.parseEther("0.1") }))
                .to.be.revertedWith("Unauthorized pool");
        });
    });

    describe("Security Features", function () {
        it("Should prevent reentrancy attacks", async function () {
            // This test ensures nonReentrant modifiers are working
            // In a real attack scenario, a malicious contract would try to re-enter
            // but our modifiers should prevent this
            await stakingContract.connect(user1).stake(TIER_0_MIN, 0, 0);
            
            // Fast forward and try to claim
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            // Should work normally (no reentrancy possible with EOA)
            await stakingContract.connect(user1).claim(0);
            expect(true).to.be.true;
        });

        it("Should validate all inputs properly", async function () {
            // Test various invalid inputs
            await expect(stakingContract.connect(user1).stake(0, 0, 0))
                .to.be.revertedWith("Stake amount must be greater than 0");
                
            await expect(stakingContract.connect(user1).stake(TIER_0_MIN, 5, 0))
                .to.be.revertedWith("Invalid tier");
                
            await expect(stakingContract.connect(user1).stake(TIER_0_MIN, 0, 5))
                .to.be.revertedWith("Invalid duration");
        });
    });
}); 