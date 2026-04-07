import { config } from "../common/config";
import { BlockDb, IBlockDb } from "../db/block-db";
import { Block, Finality } from '../common/types';
import { sleep } from "../common/sleep";
import { EventWriter, IEventWriter } from "./event-writer";
import { BlockProvider, IBlockProvider } from "./block-provider";
import { throttle } from "../common/throttle";
import { logger } from "../common/logger";

export class BlockScanner {

    blockDb: IBlockDb;
    provider: IBlockProvider;
    eventWriter: IEventWriter;

    constructor(blockDb: IBlockDb, provider: IBlockProvider, eventWriter: IEventWriter) {
        this.blockDb = blockDb;
        this.provider = provider;
        this.eventWriter = eventWriter;
    }

    async processNewBlocks() {

        let blockStart = config.blockStart;
        const highest = await this.blockDb.getHighestBlock(config.chainId, true);
        if (highest) blockStart = highest.blockNumber + 1;
        // Subtract 2 to avoid "Unknown block" errors from RPC nodes not yet indexing the latest block
        const blockEnd = (await throttle(this.provider.getBlockNumber.bind(this.provider))) - 2;

        logger.info(`fe-be processNewBlocks of ${config.chainId} blockStart: ${blockStart} blockEnd: ${blockEnd}`);
        const firstUnknown = blockEnd - config.finalityBlocks;
        const SCAN_BATCH_SIZE = 500;

        for (let batchStart = blockStart; batchStart <= blockEnd; batchStart += SCAN_BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + SCAN_BATCH_SIZE - 1, blockEnd);

            const logs = await throttle(this.provider.getParsedLogsInRange.bind(this.provider), batchStart, batchEnd);

            const logsByBlock = new Map<number, typeof logs>();
            for (const log of logs) {
                if (!logsByBlock.has(log.blockNumber)) logsByBlock.set(log.blockNumber, []);
                logsByBlock.get(log.blockNumber)!.push(log);
            }

            for (const [blockNumber, blockLogs] of logsByBlock) {
                const evmBlock = await throttle(this.provider.getBlockByHeight.bind(this.provider), blockNumber);
                if (!evmBlock) {
                    logger.error(`fe-be Block at height ${blockNumber} not found`);
                    throw new Error(`fe-be Block at height ${blockNumber} not found`);
                }
                // Write block first so event foreign key constraints are satisfied
                await this.blockDb.create({
                    blockHash: evmBlock.hash,
                    chainId: config.chainId,
                    blockNumber,
                    finality: blockNumber < firstUnknown ? Finality.FINAL : Finality.UNKNOWN,
                    blockTimestamp: BigInt(evmBlock.timestamp)
                });
                for (const log of blockLogs) {
                    await this.eventWriter.parseEvent(blockNumber, evmBlock.hash, log.txhash, log, log.txFrom);
                }
            }

            // Store batch-end block as progress marker if not already stored as an event block
            if (!logsByBlock.has(batchEnd)) {
                const evmBlock = await throttle(this.provider.getBlockByHeight.bind(this.provider), batchEnd);
                if (!evmBlock) {
                    logger.error(`fe-be Block at height ${batchEnd} not found`);
                    throw new Error(`fe-be Block at height ${batchEnd} not found`);
                }
                await this.blockDb.create({
                    blockHash: evmBlock.hash,
                    chainId: config.chainId,
                    blockNumber: batchEnd,
                    finality: batchEnd < firstUnknown ? Finality.FINAL : Finality.UNKNOWN,
                    blockTimestamp: BigInt(evmBlock.timestamp)
                });
            }
        }
    }

    async finalizeBlocks() {
        const highest = await this.provider.getBlockNumber();

        // Get all non-final blocks that are past maturity
        const blocks = (await this.blockDb.getBlocksByFinality(config.chainId, Finality.UNKNOWN))
            .filter(block => block.blockNumber + config.finalityBlocks < highest);

        logger.info(`fe-be bock-scanner: finalizeBlocks: highest block in DB: ${highest} blocks to finalize: ${blocks.length}`);

        // Map them according to height and check if they exist in the node
        const heightMap: { [key: number]: Block[] } = {};
        for (const block of blocks) {
            heightMap[block.blockNumber] = heightMap[block.blockNumber] ?? [];
            heightMap[block.blockNumber].push(block);
            try {
                // If block does not exists in the node, it will throw
                const evmBlock = await this.provider.getBlockByHash(block.blockHash);
                if (evmBlock) {
                    block.finality = Finality.FINAL;
                    if (evmBlock.number != block.blockNumber) {
                        logger.error(`fe-be Block in DB has incorrect rpcHeight: ${evmBlock.number}  dbHeight: ${block.blockNumber} blockHash: ${block.blockHash}`);
                        throw new Error(`fe-be Block in DB has incorrect height: ${block.blockHash}`);
                    }
                }
            } catch (error) { continue }
        }

        // Some sanity
        for (const blockNumber of Object.keys(heightMap)) {
            let final = 0;
            for (const block of heightMap[Number(blockNumber)]) {
                final += block.finality == Finality.FINAL ? 1 : 0;
            }
            if (final == 0) {
                logger.error(`Evm scanner fe-be sanity No final blocks for height: ${blockNumber}`);
                throw new Error(`fe-be No final blocks for height: ${blockNumber}`);
            }
            if (final > 1) {
                logger.error(`Evm scanner fe-be sanity More than one final block for height: ${blockNumber}`);
                throw new Error(`fe-be More than one final block for height: ${blockNumber}`);
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
                logger.error(`fe-be BlockScanner processNewBlocks error: ${(error as Error).message}`);
                console.log('fe-be BlockScanner processNewBlocks:', error);
            }
            try {
                await this.finalizeBlocks();
            } catch (error) {
                logger.error(`fe-be BlockScanner finalizeBlocks error: ${(error as Error).message}`);
                console.log('fe-be BlockScanner finalizeBlocks:', error);
            }
            await sleep(config.loopIntervalMs);
        }
    }
}


if (module === require.main) {
    const blockDb = new BlockDb();
    const provider = new BlockProvider();
    const eventWriter = new EventWriter();

    const scanner = new BlockScanner(blockDb, provider, eventWriter);
    scanner.run();
}
