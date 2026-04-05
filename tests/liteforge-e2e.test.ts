import { createBlock, createPosition, createReservation, createBtcTx, reservationStateChanged, createLiteforgeBridgeEvent } from './utils';
import { ReservationState, PositionState } from '../src/common/types';
import { MaterializedReservation } from '../src/db/materialized-reservation';
import { BlockDb } from '../src/db/block-db';
import { config } from '../src/common/config';

/**
 * E2E test: LTC payment → Sepolia settlement → Liteforge bridge
 *
 * Simulates the full path a reservation takes:
 *   1. Position created on Sepolia (MM side)
 *   2. Reservation created on Sepolia (user side)
 *   3. LTC payment confirmed on-chain
 *   4. Reservation state → SETTLED on Sepolia
 *   5. LiteforgeDepositor emits Bridged(l2Recipient=ownerAddress, ...)
 *
 * Asserts that GET /reservation/:id (via MaterializedReservation.getReservationRecord)
 * returns liteforgeTxhash once the bridge event is indexed.
 */
describe('Liteforge E2E: LTC → Sepolia → Liteforge', () => {
    const blockDb = new BlockDb();
    const materializedReservation = new MaterializedReservation();

    // Each test uses its own unique owner address to avoid cross-test pollution
    const makeOwner = () => `0xlfe2eowner${Date.now()}${Math.random().toString(36).slice(2)}`.toLowerCase();

    let evmBlock0: number; // position created
    let evmBlock1: number; // reservation created
    let evmBlock2: number; // reservation settled
    let evmBlock3: number; // liteforge bridge
    let ltcBlock0: number; // LTC payment

    beforeAll(async () => {
        let highestEvm: any = await blockDb.getHighestBlock(config.chainId, false);
        let highestLtc: any = await blockDb.getHighestBlock(config.btcChainId, false);

        if (!highestEvm) highestEvm = { blockNumber: config.blockStart + 1, blockTimestamp: 10000n };
        if (!highestLtc) highestLtc = { blockNumber: config.btcBlockStart + 1, blockTimestamp: 10n };

        evmBlock0 = highestEvm.blockNumber + 1;
        evmBlock1 = highestEvm.blockNumber + 2;
        evmBlock2 = highestEvm.blockNumber + 3;
        evmBlock3 = highestEvm.blockNumber + 4;
        ltcBlock0 = highestLtc.blockNumber + 10;

        const evmTs = highestEvm.blockTimestamp;
        await createBlock({ chainId: config.chainId, blockHash: `0xlfHash${config.chainId}${evmBlock0}`, blockNumber: evmBlock0, blockTimestamp: evmTs + 10000n });
        await createBlock({ chainId: config.chainId, blockHash: `0xlfHash${config.chainId}${evmBlock1}`, blockNumber: evmBlock1, blockTimestamp: evmTs + 20000n });
        await createBlock({ chainId: config.chainId, blockHash: `0xlfHash${config.chainId}${evmBlock2}`, blockNumber: evmBlock2, blockTimestamp: evmTs + 30000n });
        await createBlock({ chainId: config.chainId, blockHash: `0xlfHash${config.chainId}${evmBlock3}`, blockNumber: evmBlock3, blockTimestamp: evmTs + 40000n });
        await createBlock({ chainId: config.btcChainId, blockHash: `lfLtcHash${ltcBlock0}`, blockNumber: ltcBlock0, blockTimestamp: highestLtc.blockTimestamp + 1n });
    }, 15000);

    it('liteforgeTxhash is absent before the bridge event is indexed', async () => {
        const ownerAddress = makeOwner();
        const positionId = `lfPos${Date.now()}`;
        const reservationId = `lfRes${Date.now()}`;

        await createPosition({
            chainId: config.chainId,
            positionId,
            partialSettlement: true,
            originalAmount: 1000000,
            blockNumber: evmBlock0,
            blockHash: `0xlfHash${config.chainId}${evmBlock0}`,
            ownerAddress: `0xMMOwner${Date.now()}`,
            tokenAddress: `0xtoken${positionId}`,
            bitcoinAddress: `btcAddr${positionId}`,
            exchangeRate: 1,
            state: PositionState.ACTIVE,
        });

        await createReservation({
            chainId: config.chainId,
            reservationId,
            positionId,
            blockNumber: evmBlock1,
            blockHash: `0xlfHash${config.chainId}${evmBlock1}`,
            isInscription: false,
            ownerAddress,
            amount: 5000,
            btcAddress: `btcAddr${reservationId}`,
            state: ReservationState.PENDING,
        });

        await createBtcTx({
            reservationId,
            positionId,
            txid: `ltcTx${reservationId}`,
            blockNumber: ltcBlock0,
            blockHash: `lfLtcHash${ltcBlock0}`,
            targetChainId: config.chainId,
            amount: 5000n,
        });

        await reservationStateChanged({
            reservationId,
            chainId: config.chainId,
            state: ReservationState.SETTLED,
            block: evmBlock2,
            blockHash: `0xlfHash${config.chainId}${evmBlock2}`,
        });

        const record = await materializedReservation.getReservationRecord(reservationId, false);

        expect(record).toBeTruthy();
        expect(record.reservationId).toBe(reservationId);
        expect(record.state).toBe(ReservationState.SETTLED);
        expect(record.liteforgeTxhash).toBeUndefined();
    }, 15000);

    it('liteforgeTxhash appears after the Bridged event is indexed', async () => {
        const ownerAddress = makeOwner();
        const positionId = `lfPos2${Date.now()}`;
        const reservationId = `lfRes2${Date.now()}`;
        const bridgeTxhash = `0xbridgeTx${Date.now()}`;

        await createPosition({
            chainId: config.chainId,
            positionId,
            partialSettlement: true,
            originalAmount: 1000000,
            blockNumber: evmBlock0,
            blockHash: `0xlfHash${config.chainId}${evmBlock0}`,
            ownerAddress: `0xMMOwner2${Date.now()}`,
            tokenAddress: `0xtoken${positionId}`,
            bitcoinAddress: `btcAddr${positionId}`,
            exchangeRate: 1,
            state: PositionState.ACTIVE,
        });

        await createReservation({
            chainId: config.chainId,
            reservationId,
            positionId,
            blockNumber: evmBlock1,
            blockHash: `0xlfHash${config.chainId}${evmBlock1}`,
            isInscription: false,
            ownerAddress,
            amount: 5000,
            btcAddress: `btcAddr${reservationId}`,
            state: ReservationState.PENDING,
        });

        await createBtcTx({
            reservationId,
            positionId,
            txid: `ltcTx2${reservationId}`,
            blockNumber: ltcBlock0,
            blockHash: `lfLtcHash${ltcBlock0}`,
            targetChainId: config.chainId,
            amount: 5000n,
        });

        await reservationStateChanged({
            reservationId,
            chainId: config.chainId,
            state: ReservationState.SETTLED,
            block: evmBlock2,
            blockHash: `0xlfHash${config.chainId}${evmBlock2}`,
        });

        // Liteforge bridge event: emitted after reservation, l2Recipient = ownerAddress
        await createLiteforgeBridgeEvent({
            txhash: bridgeTxhash,
            blockHash: `0xlfHash${config.chainId}${evmBlock3}`,
            blockNumber: evmBlock3,
            l2Recipient: ownerAddress,
            amount: 5000n,
            messageNum: 1n,
        });

        const record = await materializedReservation.getReservationRecord(reservationId, false);

        expect(record).toBeTruthy();
        expect(record.reservationId).toBe(reservationId);
        expect(record.registrationChain).toBe(config.chainId);
        expect(record.registrationBlockNumber).toBe(evmBlock1);
        expect(record.originChain).toBe(config.btcChainId);
        expect(record.originTxhash).toBe(`ltcTx2${reservationId}`);
        expect(record.state).toBe(ReservationState.SETTLED);
        expect(record.liteforgeTxhash).toBe(bridgeTxhash);
    }, 15000);

    it('bridge event at a block before the reservation is ignored', async () => {
        const ownerAddress = makeOwner();
        const positionId = `lfPos3${Date.now()}`;
        const reservationId = `lfRes3${Date.now()}`;
        const staleBridgeTxhash = `0xstaleBridgeTx${Date.now()}`;

        await createPosition({
            chainId: config.chainId,
            positionId,
            partialSettlement: true,
            originalAmount: 1000000,
            blockNumber: evmBlock0,
            blockHash: `0xlfHash${config.chainId}${evmBlock0}`,
            ownerAddress: `0xMMOwner3${Date.now()}`,
            tokenAddress: `0xtoken${positionId}`,
            bitcoinAddress: `btcAddr${positionId}`,
            exchangeRate: 1,
            state: PositionState.ACTIVE,
        });

        await createReservation({
            chainId: config.chainId,
            reservationId,
            positionId,
            blockNumber: evmBlock1,
            blockHash: `0xlfHash${config.chainId}${evmBlock1}`,
            isInscription: false,
            ownerAddress,
            amount: 5000,
            btcAddress: `btcAddr${reservationId}`,
            state: ReservationState.PENDING,
        });

        await reservationStateChanged({
            reservationId,
            chainId: config.chainId,
            state: ReservationState.SETTLED,
            block: evmBlock2,
            blockHash: `0xlfHash${config.chainId}${evmBlock2}`,
        });

        // Stale bridge event: block_number = evmBlock0 < evmBlock1 (reservation block)
        await createLiteforgeBridgeEvent({
            txhash: staleBridgeTxhash,
            blockHash: `0xlfHash${config.chainId}${evmBlock0}`,
            blockNumber: evmBlock0,
            l2Recipient: ownerAddress,
            amount: 5000n,
            messageNum: 2n,
        });

        const record = await materializedReservation.getReservationRecord(reservationId, false);

        expect(record).toBeTruthy();
        expect(record.state).toBe(ReservationState.SETTLED);
        expect(record.liteforgeTxhash).toBeUndefined();
    }, 15000);
});
