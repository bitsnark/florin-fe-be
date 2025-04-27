import { createBlock, createPosition, createReservation, createBtcTx, reservationStateChanged } from './utils';

import request from 'supertest';
import { EventsDb } from '../src/db/events-db';
import { BlockDb } from '../src/db/block-db';
import { BtcTxDb } from '../src/db/btc-tx-db';
import { MaterializedHistory } from '../src/db/materialized-history';
import { config } from '../src/common/config';
import { Block } from '../src/common/bitcoin-core-types';
import { PositionState, ReservationState } from '../src/common/types';

describe('History API Test', () => {
	let eventsDb: EventsDb;
	let blockDb: BlockDb;
	let btcTxDb: BtcTxDb;
	let historyDb: MaterializedHistory

	beforeEach(() => {
		eventsDb = new EventsDb();
		blockDb = new BlockDb();
		btcTxDb = new BtcTxDb();
		historyDb = new MaterializedHistory();
	});

	it('should return the reservation in the history record', async () => {
		// Step 1: Get the highest block for chain 1 and chain 10011
		let highestEvmBlock: any = await blockDb.getHighestBlock(config.chainId); // finalityFlag = false, chain = 1
		let highestBtcBlock: any = await blockDb.getHighestBlock(config.btcChainId); // finalityFlag = false, chain = 10011

		if (!highestEvmBlock) highestEvmBlock = { blockNumber: config.blockStart }
		if (!highestBtcBlock) highestBtcBlock = { blockNumber: config.btcBlockStart }

		// Step 2: Create new blocks
		const evmBlock0 = highestEvmBlock.blockNumber + 1;
		const evmBlock1 = highestEvmBlock.blockNumber + 2;
		const evmBlock2 = highestEvmBlock.blockNumber + 3;
		const btcBlock0 = highestBtcBlock.blockNumber + 1;

		await createBlock({ chainId: config.chainId, blockHash: '0xhashBlock' + config.chainId + evmBlock0, blockNumber: evmBlock0 });
		await createBlock({ chainId: config.chainId, blockHash: '0xhashBlock' + config.chainId + evmBlock1, blockNumber: evmBlock1 });
		await createBlock({ chainId: config.chainId, blockHash: '0xhashBlock' + config.chainId + evmBlock2, blockNumber: evmBlock2 });
		await createBlock({ chainId: config.btcChainId, blockHash: 'hashBlock' + btcBlock0, blockNumber: btcBlock0 });

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
		const ownerAddress = `0xadd${fakeReservationId}`;
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
		expect(history).toHaveLength(1);

		const record = history[0];
		expect(record.reservation_id.trim()).toBe(fakeReservationId);
		expect(record.register_chain).toBe(config.chainId);
		expect(record.register_block_hash.trim()).toBe(`0xhashBlock${config.chainId}${evmBlock1}`);
		expect(record.pay_chain).toBe(config.btcChainId);
		expect(record.pay_block_hash.trim()).toBe(`hashBlock${btcBlock0}`);
		expect(record.receive_chain).toBe(config.chainId);
		expect(record.receive_block_hash.trim()).toBe(`0xhashBlock${config.chainId}${evmBlock2}`);
	});
});
