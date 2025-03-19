import { ethers, Interface, JsonRpcProvider } from "ethers";
import { config } from "./common/config";
import { BlockDb } from "./db/block-db";
import { Block, Finality } from './common/types';
import { sleep } from "./common/sleep";
import { exchangeAbi } from "./abis/exchange";
import { EventParser } from "./event-parser";

export class BlockScanner {

    blockDb: BlockDb;
    provider: JsonRpcProvider;
    contractInterface: Interface;

    constructor() {
        this.blockDb = new BlockDb();
        this.provider = new ethers.JsonRpcProvider(config.providerUrl);
        this.contractInterface = new ethers.Interface(exchangeAbi);
    }

    async getLatestBlockNumber(): Promise<number> {
        return await this.provider.getBlockNumber();
    }

    async processEvents(logs: Array<ethers.Log>) {
        const eventParser = new EventParser();
        for (const log of logs) {
            const parsedLog = this.contractInterface.parseLog(log);
            await eventParser.parseEvent(parsedLog);
        }
    }

    async processNewBlocks() {

        let blockStart = config.blockStart;
        const highest = await this.blockDb.getHighestFinalBlock();
        if (highest) blockStart = highest.blockNumber + 1;
        const blockEnd = await this.getLatestBlockNumber();

        for (let blockNumber = blockStart; blockNumber <= blockEnd; blockNumber) {

            const evmBlock = await this.provider.getBlock(blockNumber);

            const filter = {
                address: config.contractAddress,
                fromBlock: blockNumber,
                toBlock: blockNumber,
            };

            const logs = await this.provider.getLogs(filter);
            await this.processEvents(logs);

            await this.blockDb.create({
                blockHash: evmBlock.hash,
                blockNumber: blockNumber,
                finality: Finality.UNKNOWN
            });
        }
    }

    async finalizeBlocks() {
        const highest = await this.getLatestBlockNumber();

        // Get all non-final blocks that are past maturity
        const blocks = (await this.blockDb.getNonFinalBlocks())
            .filter(block => block.blockNumber + config.finalityBlocks < highest);

        // Map them according to height and check if they exist in the node
        const heightMap: { [key: number]: Block[] } = {};
        for (const block of blocks) {
            heightMap[block.blockNumber] = heightMap[block.blockNumber] ?? [];
            heightMap[block.blockNumber].push(block);
            const evmBlock = await this.provider.getBlock(block.blockHash);
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
            if (final != 1) {
                throw new Error(`More than one final blocks for height: ${blockNumber}`);
            }
        }

        // All non-final are reverted
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
