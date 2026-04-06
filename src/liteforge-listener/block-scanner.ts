import { config } from "../common/config";
import { BlockDb, IBlockDb } from "../db/block-db";
import { Block, Finality } from '../common/types';
import { sleep } from "../common/sleep";
import { IL2BlockProvider, L2BlockProvider } from "./block-provider";
import { LiteforgeSwapDb } from "../db/liteforge-swap-db";
import { throttle } from "../common/throttle";
import { logger } from "../common/logger";

const SCAN_BATCH_SIZE = 500;

export class LiteforgeBlockScanner {

    blockDb: IBlockDb;
    provider: IL2BlockProvider;
    swapDb: LiteforgeSwapDb;

    constructor(blockDb: IBlockDb, provider: IL2BlockProvider, swapDb: LiteforgeSwapDb) {
        this.blockDb = blockDb;
        this.provider = provider;
        this.swapDb = swapDb;
    }

    async processNewBlocks() {
        const chainId = config.liteforgeL2ChainId;

        let blockStart = config.liteforgeL2BlockStart;
        const highest = await this.blockDb.getHighestBlock(chainId, true);
        if (highest) blockStart = highest.blockNumber + 1;
        // Subtract 2 to avoid "Unknown block" errors from RPC nodes not yet indexing the latest block
        const blockEnd = (await throttle(this.provider.getBlockNumber.bind(this.provider))) - 2;

        logger.info(`liteforge-scanner processNewBlocks chainId:${chainId} blockStart:${blockStart} blockEnd:${blockEnd}`);

        if (blockStart > blockEnd) return;

        const firstUnknown = blockEnd - config.finalityBlocks;

        for (let batchStart = blockStart; batchStart <= blockEnd; batchStart += SCAN_BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + SCAN_BATCH_SIZE - 1, blockEnd);

            const logs = await throttle(this.provider.getSwapLogsInRange.bind(this.provider), batchStart, batchEnd);

            const logsByBlock = new Map<number, typeof logs>();
            for (const log of logs) {
                if (!logsByBlock.has(log.blockNumber)) logsByBlock.set(log.blockNumber, []);
                logsByBlock.get(log.blockNumber)!.push(log);
            }

            for (const [blockNumber, blockLogs] of logsByBlock) {
                const l2Block = await throttle(this.provider.getBlockByHeight.bind(this.provider), blockNumber);
                if (!l2Block) {
                    logger.error(`liteforge-scanner: Block at height ${blockNumber} not found`);
                    throw new Error(`liteforge-scanner: Block at height ${blockNumber} not found`);
                }
                for (const log of blockLogs) {
                    await this.swapDb.insert({
                        l2TxHash: log.txHash,
                        l2BlockHash: log.blockHash,
                        l2BlockNumber: log.blockNumber,
                        userAddress: log.userAddress,
                        ltcAddress: log.ltcAddress,
                        amount: log.amount,
                        messageNum: log.messageNum,
                    });
                }
                await this.blockDb.create({
                    blockHash: l2Block.hash,
                    chainId,
                    blockNumber,
                    finality: blockNumber < firstUnknown ? Finality.FINAL : Finality.UNKNOWN,
                    blockTimestamp: BigInt(l2Block.timestamp)
                });
            }

            // Store batch-end block as progress marker if not already stored as an event block
            if (!logsByBlock.has(batchEnd)) {
                const l2Block = await throttle(this.provider.getBlockByHeight.bind(this.provider), batchEnd);
                if (!l2Block) {
                    logger.error(`liteforge-scanner: Batch-end block at height ${batchEnd} not found`);
                    throw new Error(`liteforge-scanner: Batch-end block at height ${batchEnd} not found`);
                }
                await this.blockDb.create({
                    blockHash: l2Block.hash,
                    chainId,
                    blockNumber: batchEnd,
                    finality: batchEnd < firstUnknown ? Finality.FINAL : Finality.UNKNOWN,
                    blockTimestamp: BigInt(l2Block.timestamp)
                });
            }
        }
    }

    async finalizeBlocks() {
        const chainId = config.liteforgeL2ChainId;
        const highest = await this.provider.getBlockNumber();

        const blocks = (await this.blockDb.getBlocksByFinality(chainId, Finality.UNKNOWN))
            .filter(block => block.blockNumber + config.finalityBlocks < highest);

        logger.info(`liteforge-scanner finalizeBlocks: highest:${highest} blocks to finalize:${blocks.length}`);

        const heightMap: { [key: number]: Block[] } = {};
        for (const block of blocks) {
            heightMap[block.blockNumber] = heightMap[block.blockNumber] ?? [];
            heightMap[block.blockNumber].push(block);
            try {
                const l2Block = await this.provider.getBlockByHash(block.blockHash);
                if (l2Block) {
                    block.finality = Finality.FINAL;
                    if (l2Block.number != block.blockNumber) {
                        logger.error(`liteforge-scanner: Block in DB has incorrect height: ${block.blockHash}`);
                        throw new Error(`liteforge-scanner: Block in DB has incorrect height: ${block.blockHash}`);
                    }
                }
            } catch (error) { continue; }
        }

        for (const blockNumber of Object.keys(heightMap)) {
            let final = 0;
            for (const block of heightMap[Number(blockNumber)]) {
                final += block.finality == Finality.FINAL ? 1 : 0;
            }
            if (final == 0) {
                logger.error(`liteforge-scanner: No final blocks for height: ${blockNumber}`);
                throw new Error(`liteforge-scanner: No final blocks for height: ${blockNumber}`);
            }
            if (final > 1) {
                logger.error(`liteforge-scanner: More than one final block for height: ${blockNumber}`);
                throw new Error(`liteforge-scanner: More than one final block for height: ${blockNumber}`);
            }
        }

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
                logger.error(`liteforge-scanner processNewBlocks error: ${(error as Error).message}`);
            }
            try {
                await this.finalizeBlocks();
            } catch (error) {
                logger.error(`liteforge-scanner finalizeBlocks error: ${(error as Error).message}`);
            }
            await sleep(config.loopIntervalMs);
        }
    }
}

if (module === require.main) {
    const scanner = new LiteforgeBlockScanner(new BlockDb(), new L2BlockProvider(), new LiteforgeSwapDb());
    scanner.run();
}
