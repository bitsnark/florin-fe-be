import { config } from "../common/config";
import { BlockDb, IBlockDb } from "../db/block-db";
import { Block, Finality } from '../common/types';
import { sleep } from "../common/sleep";
import { EventWriter, IEventWriter } from "./event-writer";
import { BlockProvider, IBlockProvider } from "./block-provider";

export class BlockScanner {

    blockDb: IBlockDb;
    provider: IBlockProvider;
    eventWriter: IEventWriter;

    constructor(blockDb: IBlockDb, provider: IBlockProvider, eventWriter: IEventWriter) {
        this.blockDb = blockDb;
        this.provider = provider;
        this.eventWriter = eventWriter;
    }

    async processEvents(blockNumber: number, blockHash: string, timestamp?: number) {
        const parsedLogs = await this.provider.getParsedLogs(blockNumber);
        for (const log of parsedLogs) {
            await this.eventWriter.parseEvent(blockNumber, blockHash, log.txhash, log);
        }
    }

    async processNewBlocks() {

        let blockStart = config.blockStart;
        const highest = await this.blockDb.getHighestBlock(config.chainId, true);
        if (highest) blockStart = highest.blockNumber + 1;
        const blockEnd = await this.provider.getBlockNumber();

        for (let blockNumber = blockStart; blockNumber <= blockEnd; blockNumber++) {

            const evmBlock = await this.provider.getBlockByHeight(blockNumber);
            if (!evmBlock) {
                throw new Error(`Block at height ${blockNumber} not found`);
            }

            await this.processEvents(blockNumber, evmBlock.hash, evmBlock.timestamp);

            await this.blockDb.create({
                blockHash: evmBlock.hash,
                chainId: config.chainId,
                blockNumber,
                finality: Finality.UNKNOWN
            });
        }
    }

    async finalizeBlocks() {
        const highest = await this.provider.getBlockNumber();

        // Get all non-final blocks that are past maturity
        const blocks = (await this.blockDb.getBlocksByFinality(config.chainId, Finality.UNKNOWN))
            .filter(block => block.blockNumber + config.finalityBlocks <= highest);

        // Map them according to height and check if they exist in the node
        const heightMap: { [key: number]: Block[] } = {};
        for (const block of blocks) {
            heightMap[block.blockNumber] = heightMap[block.blockNumber] ?? [];
            heightMap[block.blockNumber].push(block);
            const evmBlock = await this.provider.getBlockByHash(block.blockHash);
            if (evmBlock) {
                block.finality = Finality.FINAL;
                if (evmBlock.number != block.blockNumber) {
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
    const provider = new BlockProvider();
    const eventWriter = new EventWriter();

    const scanner = new BlockScanner(blockDb, provider, eventWriter);
    scanner.run();
}
