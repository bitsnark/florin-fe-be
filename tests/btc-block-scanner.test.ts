import { BtcBlockScanner } from '../src/btc-listener/btc-block-scanner';
import { IBlockDb } from '../src/db/block-db';
import { BitcoinNode } from '../src/btc-listener/bitcoin-node';
import { Finality } from '../src/common/types';
import { config } from '../src/common/config';
import { sleep } from '../src/common/sleep';

jest.mock('../src/db/block-db');
jest.mock('../src/btc-listener/bitcoin-node');
jest.mock('../src/btc-listener/btc-tx-finder');
jest.mock("../src/common/config");
jest.mock('../src/common/sleep', () => ({
	sleep: jest.fn(),
}));

describe('BtcBlockScanner', () => {
	let blockDbMock: jest.Mocked<IBlockDb>;
	let bitcoinNodeMock: jest.Mocked<BitcoinNode>;
	let btcBlockScanner: BtcBlockScanner;

	beforeEach(() => {
		blockDbMock = {
			getHighestBlock: jest.fn(),
			create: jest.fn(),
			getBlocksByFinality: jest.fn(),
			updateFinality: jest.fn(),
			getByHash: jest.fn(),
			getByHeight: jest.fn()
		} as unknown as jest.Mocked<IBlockDb>;

		bitcoinNodeMock = {
			getBlockCount: jest.fn(),
			getBlockHash: jest.fn(),
			getBlock: jest.fn()
		} as unknown as jest.Mocked<BitcoinNode>;

		btcBlockScanner = new BtcBlockScanner(blockDbMock, bitcoinNodeMock);
	});

	describe('processNewBlocks', () => {
		it('should process new blocks and save them to the database', async () => {
			blockDbMock.getHighestBlock.mockResolvedValue({ blockNumber: 100 } as any);
			bitcoinNodeMock.getBlockCount.mockResolvedValue(105);
			bitcoinNodeMock.getBlockHash.mockResolvedValue('mockBlockHash');
			bitcoinNodeMock.getBlock.mockResolvedValue({ hash: 'mockBlockHash' } as any);

			await btcBlockScanner.processNewBlocks();

			expect(blockDbMock.getHighestBlock).toHaveBeenCalledWith(config.btcChainId, true);
			expect(bitcoinNodeMock.getBlockCount).toHaveBeenCalled();
			expect(bitcoinNodeMock.getBlockHash).toHaveBeenCalledTimes(5);
			expect(bitcoinNodeMock.getBlock).toHaveBeenCalledTimes(5);
			expect(blockDbMock.create).toHaveBeenCalledTimes(5);
		});

		it('should throw an error if a block is not found', async () => {
			blockDbMock.getHighestBlock.mockResolvedValue({ blockNumber: 100 } as any);
			bitcoinNodeMock.getBlockCount.mockResolvedValue(105);
			bitcoinNodeMock.getBlockHash.mockResolvedValue('mockBlockHash');
			bitcoinNodeMock.getBlock.mockResolvedValue(null);

			await expect(btcBlockScanner.processNewBlocks()).rejects.toThrow(
				'BTC Block at height 101 not found'
			);
		});
	});

	describe('finalizeBlocks', () => {
		it('should finalize blocks and update their finality in the database', async () => {
			bitcoinNodeMock.getBlockCount.mockResolvedValue(200);
			blockDbMock.getBlocksByFinality.mockResolvedValue([
				{ blockNumber: 190, blockHash: 'mockBlockHash1', finality: Finality.UNKNOWN } as any,
				{ blockNumber: 191, blockHash: 'mockBlockHash2', finality: Finality.UNKNOWN } as any,
			]);
			bitcoinNodeMock.getBlock.mockResolvedValueOnce({ height: 190 } as any);
			bitcoinNodeMock.getBlock.mockResolvedValueOnce({ height: 191 } as any);


			await btcBlockScanner.finalizeBlocks();

			expect(blockDbMock.getBlocksByFinality).toHaveBeenCalledWith(config.chainId, Finality.UNKNOWN);
			expect(bitcoinNodeMock.getBlock).toHaveBeenCalledTimes(2);
			expect(blockDbMock.updateFinality).toHaveBeenCalledTimes(2);
		});

		it('should throw an error if no final blocks exist for a height', async () => {
			bitcoinNodeMock.getBlockCount.mockResolvedValue(200);
			blockDbMock.getBlocksByFinality.mockResolvedValue([
				{ blockNumber: 190, blockHash: 'mockBlockHash1', finality: Finality.UNKNOWN } as any,
			]);
			bitcoinNodeMock.getBlock.mockResolvedValue(null);

			await expect(btcBlockScanner.finalizeBlocks()).rejects.toThrow(
				'No final blocks for height: 190'
			);
		});
	});

});
