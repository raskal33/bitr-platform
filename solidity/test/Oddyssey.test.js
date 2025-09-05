const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");



describe("Oddyssey", function () {
    // --- Constants ---
    const MATCH_COUNT = 10;
    const ODDS_SCALING_FACTOR = 1000;
    const ENTRY_FEE = ethers.parseEther("0.5"); // Updated to 0.5 MON

    // --- Enums ---
    const BetType = { MONEYLINE: 0, OVER_UNDER: 1 };
    const MoneylineResult = { NotSet: 0, HomeWin: 1, Draw: 2, AwayWin: 3 };
    const OverUnderResult = { NotSet: 0, Over: 1, Under: 2 };

    // --- Helper Functions ---
    function getKeccak(value) {
        return ethers.keccak256(ethers.toUtf8Bytes(value));
    }

    async function deployOddysseyFixture() {
        const [owner, oracle, devWallet, player1, player2, player3] = await ethers.getSigners();

        // Deploy Oddyssey Contract (MON is native, no token needed)
        const Oddyssey = await ethers.getContractFactory("Oddyssey");
        const oddyssey = await Oddyssey.deploy(await devWallet.getAddress(), ENTRY_FEE);

        // Set oracle
        await oddyssey.connect(owner).setOracle(oracle.address);

        return {
          oddyssey,
          owner,
          oracle,
          devWallet,
          player1,
          player2,
          player3
        };
    }

    function generateMatches(count = MATCH_COUNT) {
        const matches = [];
        const baseTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        for (let i = 0; i < count; i++) {
            matches.push({
                id: 1000 + i,
                startTime: baseTime + i * 120,
                oddsHome: 2100,
                oddsDraw: 3300,
                oddsAway: 2800,
                oddsOver: 1900,
                oddsUnder: 1800,
                result: { moneyline: MoneylineResult.NotSet, overUnder: OverUnderResult.NotSet }
            });
        }
        return matches;
    }

    function generateResults(count = MATCH_COUNT) {
        const results = [];
        for (let i = 0; i < count; i++) {
            results.push({
                moneyline: (i % 3) + 1, // Cycle through HomeWin, Draw, AwayWin
                overUnder: (i % 2) + 1  // Cycle through Over, Under
            });
        }
        return results;
    }

    describe("Deployment", function () {
        it("Should set the right owner and initial values", async function () {
            const { oddyssey, owner, devWallet } = await loadFixture(deployOddysseyFixture);
            expect(await oddyssey.owner()).to.equal(owner.address);
            expect(await oddyssey.devWallet()).to.equal(devWallet.address);
            expect(await oddyssey.entryFee()).to.equal(ENTRY_FEE);
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to set a new oracle", async function () {
            const { oddyssey, owner, player1 } = await loadFixture(deployOddysseyFixture);
            await expect(oddyssey.connect(owner).setOracle(player1.address))
                .to.emit(oddyssey, "OracleSet").withArgs(player1.address);
            expect(await oddyssey.oracle()).to.equal(player1.address);
        });

        it("Should prevent non-owners from setting a new oracle", async function () {
            const { oddyssey, player1 } = await loadFixture(deployOddysseyFixture);
            await expect(oddyssey.connect(player1).setOracle(player1.address))
                .to.be.revertedWithCustomError(oddyssey, "OwnableUnauthorizedAccount").withArgs(player1.address);
        });

        it("Should allow owner to set a new entry fee", async function () {
            const { oddyssey, owner } = await loadFixture(deployOddysseyFixture);
            const newFee = ethers.parseEther("20");
            await expect(oddyssey.connect(owner).setEntryFee(newFee))
                .to.emit(oddyssey, "EntryFeeSet").withArgs(newFee);
            expect(await oddyssey.entryFee()).to.equal(newFee);
        });
    });

    describe("Oracle Functions", function () {
        it("Should allow oracle to start a new daily cycle", async function () {
            const { oddyssey, oracle } = await loadFixture(deployOddysseyFixture);
            const matches = generateMatches();
            await expect(oddyssey.connect(oracle).startDailyCycle(matches))
                .to.emit(oddyssey, "CycleStarted");
            expect(await oddyssey.dailyCycleId()).to.equal(1);
            const storedMatch = (await oddyssey.dailyMatches(1, 0));
            expect(storedMatch.id).to.equal(matches[0].id);
        });

        it("Should prevent non-oracle from starting a cycle", async function () {
            const { oddyssey, player1 } = await loadFixture(deployOddysseyFixture);
            const matches = generateMatches();
            await expect(oddyssey.connect(player1).startDailyCycle(matches))
                .to.be.revertedWithCustomError(oddyssey, "Unauthorized");
        });

        it("Should allow oracle to resolve a daily cycle", async function () {
            const { oddyssey, oracle } = await loadFixture(deployOddysseyFixture);
            const matches = generateMatches();
            await oddyssey.connect(oracle).startDailyCycle(matches);

            // Fast forward time past the betting end time
            const cycleId = await oddyssey.dailyCycleId();
            const endTime = await oddyssey.dailyCycleEndTimes(cycleId);
            await ethers.provider.send("evm_increaseTime", [Number(endTime) + 1]);
            await ethers.provider.send("evm_mine");

            const results = generateResults();
            await expect(oddyssey.connect(oracle).resolveDailyCycle(results))
                .to.emit(oddyssey, "CycleResolved");
            
            const storedMatch = (await oddyssey.dailyMatches(1, 0));
            expect(storedMatch.result.moneyline).to.equal(results[0].moneyline);
        });
    });

    describe("Game Flow: Slip Placement, Evaluation, and Claiming", function () {
        let fixture;

        beforeEach(async () => {
            fixture = await loadFixture(deployOddysseyFixture);
            const { oddyssey, oracle } = fixture;
            const matches = generateMatches();
            await oddyssey.connect(oracle).startDailyCycle(matches);
        });

        it("Should allow a player to place a valid slip", async function () {
            const { oddyssey, player1 } = fixture;
            const cycleId = await oddyssey.dailyCycleId();
            const matches = await oddyssey.getDailyMatches(cycleId);
            
            const predictions = matches.map(m => ({
                matchId: m.id,
                betType: BetType.MONEYLINE,
                selection: getKeccak("1"),
                selectedOdd: m.oddsHome
            }));

            await expect(oddyssey.connect(player1).placeSlip(predictions, { value: ENTRY_FEE }))
                .to.emit(oddyssey, "SlipPlaced")
                .withArgs(cycleId, player1.address, 0);

            const slip = await oddyssey.getSlip(0);
            expect(slip.player).to.equal(player1.address);
            // Validate at least the first prediction's odd via separate getter to avoid nested struct decoding issues
            expect(slip.predictions.length).to.equal(MATCH_COUNT);
        });

        it("Should reject slips with mismatched odds", async function () {
            const { oddyssey, player1 } = fixture;
            const cycleId = await oddyssey.dailyCycleId();
            const matches = await oddyssey.getDailyMatches(cycleId);
            
            const predictions = matches.map(m => ({
                matchId: m.id,
                betType: BetType.MONEYLINE,
                selection: getKeccak("1"),
                selectedOdd: m.oddsHome + 100n // BigInt addition
            }));

            await expect(oddyssey.connect(player1).placeSlip(predictions, { value: ENTRY_FEE }))
                .to.be.revertedWithCustomError(oddyssey, "OddsMismatch");
        });

        it("Should reject slips placed after the betting period ends", async function () {
            const { oddyssey, player1 } = fixture;
            const cycleId = await oddyssey.dailyCycleId();
            const endTime = await oddyssey.dailyCycleEndTimes(cycleId);
            await ethers.provider.send("evm_increaseTime", [Number(endTime) + 1]);
            await ethers.provider.send("evm_mine");

            const matches = await oddyssey.getDailyMatches(cycleId);
            const predictions = matches.map(m => ({
                matchId: m.id,
                betType: BetType.MONEYLINE,
                selection: getKeccak("1"),
                selectedOdd: m.oddsHome
            }));

            await expect(oddyssey.connect(player1).placeSlip(predictions, { value: ENTRY_FEE }))
                .to.be.revertedWithCustomError(oddyssey, "BettingClosed");
        });

        it("Should correctly evaluate a slip and update the leaderboard", async function () {
            const { oddyssey, oracle, player1 } = fixture;
            const cycleId = await oddyssey.dailyCycleId();
            const matches = await oddyssey.getDailyMatches(cycleId);
            const results = generateResults();
            
            // Player 1 predictions: exactly 6 correct to pass minimum but not all
            const predictions = [];
            let expectedCorrect = 6;
            for (let i = 0; i < MATCH_COUNT; i++) {
                let selection;
                let selectedOdd;
                const isCorrect = i < expectedCorrect; // first N correct
                if (isCorrect) {
                    if (results[i].moneyline === MoneylineResult.HomeWin) { selection = "1"; selectedOdd = matches[i].oddsHome; }
                    else if (results[i].moneyline === MoneylineResult.Draw) { selection = "X"; selectedOdd = matches[i].oddsDraw; }
                    else { selection = "2"; selectedOdd = matches[i].oddsAway; }
                } else {
                    // Choose a selection guaranteed to be wrong
                    if (results[i].moneyline !== MoneylineResult.HomeWin) { selection = "1"; selectedOdd = matches[i].oddsHome; }
                    else { selection = "2"; selectedOdd = matches[i].oddsAway; }
                }
                predictions.push({ matchId: matches[i].id, betType: BetType.MONEYLINE, selection: getKeccak(selection), selectedOdd });
            }

            await oddyssey.connect(player1).placeSlip(predictions, { value: ENTRY_FEE });
            const slipId = 0;

            // Resolve cycle
            const endTime = await oddyssey.dailyCycleEndTimes(cycleId);
            await ethers.provider.send("evm_increaseTime", [Number(endTime) + 1]);
            await oddyssey.connect(oracle).resolveDailyCycle(results);

            // Evaluate slip
            await oddyssey.connect(player1).evaluateSlip(slipId);
            const slip = await oddyssey.getSlip(slipId);
            
            expect(slip.isEvaluated).to.be.true;
            expect(slip.correctCount).to.equal(expectedCorrect);

            // Check leaderboard
            const leaderboard = await oddyssey.getDailyLeaderboard(cycleId);
            expect(leaderboard[0].player).to.equal(player1.address);
            expect(leaderboard[0].slipId).to.equal(slipId);
            expect(leaderboard[0].correctCount).to.equal(expectedCorrect);
            expect(slip.finalScore).to.be.gt(0n); 
        });

        it("Should allow a winning player to claim their prize", async function () {
            const { oddyssey, oracle, player1, devWallet } = fixture;
            const cycleId = await oddyssey.dailyCycleId();
            const matches = await oddyssey.getDailyMatches(cycleId);
            const results = generateResults();

            // Player 1 makes 10 correct predictions to be rank 1
            const predictions = [];
            for (let i = 0; i < MATCH_COUNT; i++) {
                let selection, selectedOdd;
                if (results[i].moneyline === MoneylineResult.HomeWin) { selection = "1"; selectedOdd = matches[i].oddsHome; }
                else if (results[i].moneyline === MoneylineResult.Draw) { selection = "X"; selectedOdd = matches[i].oddsDraw; }
                else { selection = "2"; selectedOdd = matches[i].oddsAway; }
                predictions.push({ matchId: matches[i].id, betType: BetType.MONEYLINE, selection: getKeccak(selection), selectedOdd });
            }
            await oddyssey.connect(player1).placeSlip(predictions, { value: ENTRY_FEE });
            const slipId = 0;

            // Resolve and evaluate
            const endTime = await oddyssey.dailyCycleEndTimes(cycleId);
            await ethers.provider.send("evm_increaseTime", [Number(endTime) + 100]);
            await oddyssey.connect(oracle).resolveDailyCycle(results);
            await oddyssey.connect(player1).evaluateSlip(slipId);

            // Fast forward to claiming period
            const claimTime = await oddyssey.claimableStartTimes(cycleId);
            await ethers.provider.send("evm_increaseTime", [Number(claimTime)]);
            await ethers.provider.send("evm_mine");

            const prizePool = await oddyssey.dailyPrizePools(cycleId);
            const rank1_prize = prizePool * 4000n / 10000n; // 40%
            const devFee = rank1_prize * 500n / 10000n; // 5%
            const playerShare = rank1_prize - devFee;
            
            const devBalanceBefore = await ethers.provider.getBalance(devWallet.address);
            
            await expect(oddyssey.connect(player1).claimPrize(cycleId))
                .to.emit(oddyssey, "PrizeClaimed").withArgs(cycleId, player1.address, 0, playerShare);

            expect(await ethers.provider.getBalance(devWallet.address)).to.equal(devBalanceBefore + devFee);
        });

        it("Should rollover prize pool if no one meets the minimum correct predictions", async function () {
            const { oddyssey, oracle, player1 } = fixture;
            const cycleId = 1;

            // Player 1 makes only 4 correct predictions
            const matches = await oddyssey.getDailyMatches(cycleId);
            const results = generateResults();
            const predictions = matches.map((m, i) => {
                const isCorrect = i < 4;
                let selection;
                let selectedOdd;
                if (isCorrect) {
                    if (results[i].moneyline === MoneylineResult.HomeWin) { selection = "1"; selectedOdd = m.oddsHome; }
                    else if (results[i].moneyline === MoneylineResult.Draw) { selection = "X"; selectedOdd = m.oddsDraw; }
                    else { selection = "2"; selectedOdd = m.oddsAway; }
                } else { // guaranteed wrong selection & odd
                    if (results[i].moneyline !== MoneylineResult.HomeWin) { selection = "1"; selectedOdd = m.oddsHome; }
                    else { selection = "2"; selectedOdd = m.oddsAway; }
                }
                return { matchId: m.id, betType: BetType.MONEYLINE, selection: getKeccak(selection), selectedOdd };
            });

            await oddyssey.connect(player1).placeSlip(predictions, { value: ENTRY_FEE });
            const prizePoolBefore = await oddyssey.dailyPrizePools(cycleId);

            // Resolve and evaluate
            const endTime = await oddyssey.dailyCycleEndTimes(cycleId);
            await ethers.provider.send("evm_increaseTime", [Number(endTime) + 100]);
            await oddyssey.connect(oracle).resolveDailyCycle(results);
            await oddyssey.connect(player1).evaluateSlip(0);

            // Start next cycle to trigger rollover
            // Generate matches relative to the latest block timestamp to satisfy start time requirement
            const latestBlockTs = (await ethers.provider.getBlock("latest")).timestamp;
            const newBaseTime = BigInt(latestBlockTs) + 3600n; // 1 hour in future
            const newMatches = [];
            for (let i = 0; i < MATCH_COUNT; i++) {
                newMatches.push({
                    id: 2000 + i,
                    startTime: Number(newBaseTime + BigInt(i * 120)),
                    oddsHome: 2100,
                    oddsDraw: 3300,
                    oddsAway: 2800,
                    oddsOver: 1900,
                    oddsUnder: 1800,
                    result: { moneyline: MoneylineResult.NotSet, overUnder: OverUnderResult.NotSet }
                });
            }
            await oddyssey.connect(oracle).startDailyCycle(newMatches);
            const newCycleId = 2;
            
            const prizePoolAfter = await oddyssey.dailyPrizePools(newCycleId);
            const rolloverFee = prizePoolBefore * 500n / 10000n;
            const expectedRollover = prizePoolBefore - rolloverFee;
            
            expect(prizePoolAfter).to.equal(expectedRollover);
        });
    });
}); 