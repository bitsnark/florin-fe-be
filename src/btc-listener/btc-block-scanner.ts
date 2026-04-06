import { config } from "../common/config";
import { BlockDb, IBlockDb } from "../db/block-db";
import { Block, Finality } from '../common/types';
import { sleep } from "../common/sleep";
import { BitcoinTxFinder } from "./btc-tx-finder";
import { BitcoinNode } from "./bitcoin-node";
import { BlockVerbosity } from "../common/bitcoin-core-types";
import { throttle } from "../common/throttle";
import { logger } from "../common/logger";

export class BtcBlockScanner {

	blockDb: IBlockDb;
	btcProvider: BitcoinNode;
	bitcoinTxFinder: BitcoinTxFinder;

	constructor(blockDb: IBlockDb, provider: BitcoinNode) {
		this.blockDb = blockDb;
		this.btcProvider = provider;
		this.bitcoinTxFinder = new BitcoinTxFinder();
	}

	async processNewBlocks() {
		let blockStart = config.btcBlockStart;
		const highest = await this.blockDb.getHighestBlock(config.btcChainId, true);
		if (highest) blockStart = highest.blockNumber + 1;
		const blockEnd = await this.btcProvider.getBlockCount();
		const firstUnknown = blockEnd - config.btcFinalityBlocks;
		const evmLatestTimestamp = await this.getEvmLatestBlockTimestamp();

		for (let blockNumber = blockStart; blockNumber <= blockEnd; blockNumber++) {
			const blockHash = await this.btcProvider.getBlockHash(blockNumber);
			const btcBlock = await this.btcProvider.getBlock(blockHash, BlockVerbosity.jsonWithTxs);

			if (!btcBlock) throw new Error(`BTC Block at height ${blockNumber} not found`);
			if (BigInt(btcBlock.time) > evmLatestTimestamp + BigInt(config.evmTimestampSafetyMarginSec)) return;

			await this.bitcoinTxFinder.scanBlock(blockNumber, blockHash);

			await this.blockDb.create({
				blockHash: btcBlock.hash,
				chainId: config.btcChainId,
				blockNumber,
				finality: blockNumber < firstUnknown ? Finality.FINAL : Finality.UNKNOWN,
				blockTimestamp: BigInt(btcBlock.time)
			});
		}
	}

	private async getEvmLatestBlockTimestamp(): Promise<bigint> {
		// get the latest chain block timestamp from the database
		const evmLatestTimestamp = await this.blockDb.getHighestBlock(config.chainId);
		if (evmLatestTimestamp) return evmLatestTimestamp.blockTimestamp;
		// if the database has no evm blocks, do not start the btc scanner
		return 0n;
	}

	async finalizeBlocks() {
		const highest = await this.btcProvider.getBlockCount();

		// Get all non-final blocks that are past maturity
		const blocks = (await this.blockDb.getBlocksByFinality(config.btcChainId, Finality.UNKNOWN))
			.filter(block => block.blockNumber + config.btcFinalityBlocks <= highest);

		// Map them according to height
		const heightMap: { [key: number]: Block[] } = {};
		for (const block of blocks) {
			heightMap[block.blockNumber] = heightMap[block.blockNumber] ?? [];
			heightMap[block.blockNumber].push(block);
		}

		// For each height, fetch the canonical hash and mark the matching block FINAL
		for (const blockNumber of Object.keys(heightMap)) {
			const canonicalHash = await this.btcProvider.getBlockHash(Number(blockNumber));
			for (const block of heightMap[Number(blockNumber)]) {
				if (block.blockHash === canonicalHash) block.finality = Finality.FINAL;
			}
		}

		// All non-final blocks are reverted
		// Write them to DB
		for (const block of blocks) {
			block.finality = block.finality == Finality.FINAL ? Finality.FINAL : Finality.REVERTED;
			await this.blockDb.updateFinality(block.blockHash, block.finality);
		}
	}

	async run() {
		while (true) {
			try {
				await this.processNewBlocks();
			} catch (error) {
				logger.error(`BtcBlockScanner processNewBlocks ${error}`);
			}
			try {
				await this.finalizeBlocks();
			} catch (error) {
				logger.error(`BtcBlockScanner finalizeBlocks ${error}`);
			}
			await sleep(config.loopIntervalMs);
		}
	}
}

if (module === require.main) {
	const blockDb = new BlockDb();
	const btcNode = new BitcoinNode();

	const scanner = new BtcBlockScanner(blockDb, btcNode);
	scanner.run();
}
