import { createBlock, createPosition, createReservation, createBtcTx, reservationStateChanged, positionStateChanged } from './utils';
import { Finality, PositionState, ReservationState } from '../src/common/types';
import { MaterializedHistory } from '../src/db/materialized-history';
import { BlockDb } from '../src/db/block-db';
import { config } from '../src/common/config';

describe('History API Test', () => {
	let blockDb = new BlockDb();
	let historyDb = new MaterializedHistory();
	let evmBlock0: number, evmBlock1: number, evmBlock2: number, btcBlock0: number;

	const ownerAddress = '0xevmOwnerAddress';

	beforeAll(async () => {
		// Step 1: Get the highest block for chain 1 and chain 10011
		let highestEvmBlock: any = await blockDb.getHighestBlock(config.chainId);
		let highestBtcBlock: any = await blockDb.getHighestBlock(config.btcChainId);

		if (!highestEvmBlock) highestEvmBlock = { blockNumber: config.blockStart }
		if (!highestBtcBlock) highestBtcBlock = { blockNumber: config.btcBlockStart }

		// Step 2: Create new blocks
		evmBlock0 = highestEvmBlock.blockNumber + 1;
		evmBlock1 = highestEvmBlock.blockNumber + 2;
		evmBlock2 = highestEvmBlock.blockNumber + 3;
		btcBlock0 = highestBtcBlock.blockNumber + 1;

		await createBlock({ chainId: config.chainId, blockHash: '0xhashBlock' + config.chainId + evmBlock0, blockNumber: evmBlock0 });
		await createBlock({ chainId: config.chainId, blockHash: '0xhashBlock' + config.chainId + evmBlock1, blockNumber: evmBlock1 });
		await createBlock({ chainId: config.chainId, blockHash: '0xhashBlock' + config.chainId + evmBlock2, blockNumber: evmBlock2 });
		await createBlock({ chainId: config.btcChainId, blockHash: 'hashBlock' + btcBlock0, blockNumber: btcBlock0 });
	});

	beforeEach(() => {

	});

	it('should return the reservation in the history record', async () => {


		// Step 3: Create a new position
		const fakePositionId = `${Date.now()}`;


		await createPosition({
			chainId: config.chainId,
			positionId: fakePositionId,
			partialSettlement: true,
			originalAmount: 1000000,
			blockNumber: evmBlock0,
			blockHash: `0xhashBlock${config.chainId}${evmBlock0}`,
			ownerAddress: '0xMMOwnerAddress',
			tokenAddress: `0xtoken${fakePositionId}`,
			bitcoinAddress: `btcAddress${fakePositionId}`,
			exchangeRate: 1,
			state: PositionState.ACTIVE
		});


		// Step 4: Create a reservation
		const fakeReservationId = `${Date.now()}`;

		await createReservation({
			chainId: config.chainId,
			reservationId: fakeReservationId,
			positionId: fakePositionId,
			blockNumber: evmBlock1,
			blockHash: `0xhashBlock${config.chainId}${evmBlock1}`,
			isInscription: false,
			ownerAddress,
			amount: 2000,
			btcAddress: `btcAddress${fakeReservationId}`,
			state: ReservationState.PENDING
		});

		// Step 5: Create a BTC transaction
		await createBtcTx({
			reservationId: fakeReservationId,
			positionId: fakePositionId,
			txid: `txid${fakeReservationId}`,
			blockNumber: btcBlock0,
			blockHash: `hashBlock${btcBlock0}`,
			targetChainId: config.chainId
		});

		// Step 6: Create a state event for the reservation
		await reservationStateChanged({
			reservationId: fakeReservationId,
			chainId: config.chainId,
			state: ReservationState.SETTLED,
			block: evmBlock2,
			blockHash: `0xhashBlock${config.chainId}${evmBlock2}`,
		});

		// Step 7: Test the history API
		const history = await historyDb.getOwnerHistory(ownerAddress, false, 1);

		const record = history.find(r => r.reservationId && r.reservationId === fakeReservationId);

		expect(record).toBeTruthy();
		expect(record.reservationId).toBe(fakeReservationId);
		expect(record.registrationChain).toBe(config.chainId);
		expect(record.registrationBlockHash).toBe(`0xhashBlock${config.chainId}${evmBlock1}`);
		expect(record.registrationBlockNumber).toBe(evmBlock1);
		expect(record.originChain).toBe(config.btcChainId);
		expect(record.originBlockHash).toBe(`hashBlock${btcBlock0}`);
		expect(record.originBlockNumber).toBe(btcBlock0);
		expect(record.targetChain).toBe(config.chainId);
		expect(record.targetBlockHash).toBe(`0xhashBlock${config.chainId}${evmBlock2}`);
		expect(record.targetBlockNumber).toBe(evmBlock2);
		expect(record.state).toBe(ReservationState.SETTLED);
	});

	it('should return the positions in the history record', async () => {

		// Step 1: Create user new position
		const fakePositionId = `${Date.now()}`;
		await createPosition({
			chainId: config.chainId,
			positionId: fakePositionId,
			partialSettlement: false,
			originalAmount: 2000,
			blockNumber: evmBlock0,
			blockHash: `0xhashBlock${config.chainId}${evmBlock0}`,
			ownerAddress: ownerAddress,
			tokenAddress: ownerAddress,
			bitcoinAddress: `btcAddress${fakePositionId}`,
			exchangeRate: 1,
			state: PositionState.ACTIVE
		});


		// Step 2: Create a reservation is (skip reservation itself)
		const fakeReservationId = `${Date.now()}`;


		// Step 3: Create a BTC transaction (MM payment)
		await createBtcTx({
			reservationId: fakeReservationId,
			positionId: fakePositionId,
			txid: `txid${fakePositionId}`,
			blockNumber: btcBlock0,
			blockHash: `hashBlock${btcBlock0}`,
			targetChainId: config.chainId
		});

		// Step 4: Create a state event for the reservation
		await positionStateChanged({
			positionId: fakePositionId,
			chainId: config.chainId,
			state: PositionState.CLOSED,
			block: evmBlock2,
			blockHash: `0xhashBlock${config.chainId}${evmBlock2}`,
		});

		// Step 5: Test the history API
		const history = await historyDb.getOwnerHistory(ownerAddress, false, 100);

		const record = history.find(r => r.positionId && r.positionId === fakePositionId);

		expect(record).toBeTruthy();
		expect(record.positionId).toBe(fakePositionId);
		expect(record.registrationChain).toBe(config.chainId);
		expect(record.registrationBlockHash).toBe(`0xhashBlock${config.chainId}${evmBlock0}`);
		expect(record.registrationBlockNumber).toBe(evmBlock0);
		expect(record.originChain).toBe(config.chainId);
		expect(record.originBlockHash).toBe(`0xhashBlock${config.chainId}${evmBlock0}`);
		expect(record.originBlockNumber).toBe(evmBlock0);
		expect(record.targetChain).toBe(config.btcChainId);
		expect(record.targetBlockHash).toBe(`hashBlock${btcBlock0}`);
		expect(record.targetBlockNumber).toBe(btcBlock0);
	});


});
