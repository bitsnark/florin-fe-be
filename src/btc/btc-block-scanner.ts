import { config } from "../common/config";
import { BlockDb, IBlockDb } from "../db/block-db";
import { Block, Finality } from '../common/types';
import { sleep } from "../common/sleep";
import { BitcoinTxFinder } from "./btc-tx-finder";
import { BitcoinNode } from "./bitcoin-node";
import { BlockVerbosity } from "../common/bitcoin-core-types";

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
		const blockEnd = 4041779 //await this.btcProvider.getBlockCount();

		for (let blockNumber = blockStart; blockNumber <= blockEnd; blockNumber++) {
			const blockHash = await this.btcProvider.getBlockHash(blockNumber);
			const btcBlock = await this.btcProvider.getBlock(blockHash, BlockVerbosity.jsonWithTxs);
			if (!btcBlock) {
				throw new Error(`BTC Block at height ${blockNumber} not found`);
			}

			await this.bitcoinTxFinder.scanBlock(blockNumber, blockHash, btcBlock.time);

			await this.blockDb.create({
				blockHash: btcBlock.hash,
				chainId: config.btcChainId,
				blockNumber,
				finality: Finality.UNKNOWN
			});
		}
	}

	async finalizeBlocks() {
		const highest = 4041779 //await this.btcProvider.getBlockCount();

		// Get all non-final blocks that are past maturity
		const blocks = (await this.blockDb.getBlocksByFinality(config.btcChainId, Finality.UNKNOWN))
			.filter(block => block.blockNumber + config.btcFinalityBlocks <= highest);

		// Map them according to height and check if they exist in the node
		const heightMap: { [key: number]: Block[] } = {};
		for (const block of blocks) {
			heightMap[block.blockNumber] = heightMap[block.blockNumber] ?? [];
			heightMap[block.blockNumber].push(block);
			const btcBlock = await this.btcProvider.getBlock(block.blockHash, BlockVerbosity.json);
			if (btcBlock) {
				block.finality = Finality.FINAL;
				if (btcBlock.height != block.blockNumber) {
					throw new Error(`Block in DB has incorrect height: ${block.blockHash}`);
				}
			}
		}

		// Some sanity
		for (const blockNumber of Object.keys(heightMap)) {
			let final = 0;
			for (const block of heightMap[blockNumber]) {
				final += block.finality == Finality.FINAL ? 1 : 0;
			}
			if (final == 0) {
				throw new Error(`No final blocks for height: ${blockNumber}`);
			}
			if (final > 1) {
				throw new Error(`More than one final block for height: ${blockNumber}`);
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
				console.log(error);
			}
			try {
				await this.finalizeBlocks();
			} catch (error) {
				console.log(error);
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
