import { BlockScanner } from "../src/block-scanner";
import { IBlockDb } from "../src/db/block-db";
import { IBlockProvider } from "../src/block-provider";
import { IEventWriter } from "../src/event-writer";
import { config } from "../src/common/config";
import { Finality } from "../src/common/types";
import { jest, describe, beforeEach, it, expect } from "@jest/globals";

jest.mock("../src/db/block-db");
jest.mock("../src/block-provider");
jest.mock("../src/event-writer");
jest.mock("../src/common/config");

describe("BlockScanner", () => {
    let blockDb: jest.Mocked<IBlockDb>;
    let provider: jest.Mocked<IBlockProvider>;
    let eventWriter: jest.Mocked<IEventWriter>;
    let blockScanner: BlockScanner;

    beforeEach(() => {
        blockDb = {
            getHighestFinalBlock: jest.fn(),
            create: jest.fn(),
            getBlocksByFinality: jest.fn(),
            updateFinality: jest.fn(),
        } as unknown as jest.Mocked<IBlockDb>;

        provider = {
            getBlockNumber: jest.fn(),
            getBlockByHeight: jest.fn(),
            getBlockByHash: jest.fn(),
            getParsedLogs: jest.fn(),
        } as unknown as jest.Mocked<IBlockProvider>;

        eventWriter = {
            parseEvent: jest.fn(),
        } as unknown as jest.Mocked<IEventWriter>;

        blockScanner = new BlockScanner(blockDb, provider, eventWriter);
    });

    describe("processEvents", () => {
        it("should process parsed logs and call eventWriter.parseEvent", async () => {
            const blockNumber = 1;
            const blockHash = "0x123";
            const logs = [
                {
                    name: "event1",
                    topic: "topic1",
                    args: []
                },
                {
                    name: "event2",
                    topic: "topic2",
                    args: []
                },
            ];

            provider.getParsedLogs.mockResolvedValue(logs as any);

            await blockScanner.processEvents(blockNumber, blockHash);

            expect(provider.getParsedLogs).toHaveBeenCalledWith(blockNumber);
            expect(eventWriter.parseEvent).toHaveBeenCalledTimes(logs.length);
            logs.forEach((log, index) => {
                expect(eventWriter.parseEvent).toHaveBeenNthCalledWith(
                    index + 1,
                    blockNumber,
                    blockHash,
                    log
                );
            });
        });
    });

    describe("processNewBlocks", () => {
        it("should process new blocks and save them to the database", async () => {
            const highestFinalBlock = { blockNumber: 5, blockHash: "0x123", chainId: 2002, finality: Finality.UNKNOWN };
            const currentBlockNumber = 10;
            const evmBlock = { hash: "0xabc" };

            blockDb.getHighestFinalBlock.mockResolvedValue(highestFinalBlock);
            provider.getBlockNumber.mockResolvedValue(currentBlockNumber);
            provider.getBlockByHeight.mockResolvedValue(evmBlock as any);
            provider.getParsedLogs.mockResolvedValue([]);

            await blockScanner.processNewBlocks();

            expect(blockDb.getHighestFinalBlock).toHaveBeenCalledWith(config.chainId);
            expect(provider.getBlockNumber).toHaveBeenCalled();
            for (let blockNumber = 6; blockNumber <= currentBlockNumber; blockNumber++) {
                expect(provider.getBlockByHeight).toHaveBeenCalledWith(blockNumber);
                expect(blockDb.create).toHaveBeenCalledWith({
                    blockHash: evmBlock.hash,
                    chainId: config.chainId,
                    blockNumber,
                    finality: Finality.UNKNOWN,
                });
            }
        });

        it("should throw an error if a block is not found", async () => {
            const highestFinalBlock = { blockNumber: 5, blockHash: "0x123", chainId: 2002, finality: Finality.UNKNOWN };
            const currentBlockNumber = 10;

            blockDb.getHighestFinalBlock.mockResolvedValue(highestFinalBlock);
            provider.getBlockNumber.mockResolvedValue(currentBlockNumber);
            provider.getBlockByHeight.mockResolvedValue(null);

            await expect(blockScanner.processNewBlocks()).rejects.toThrow(
                "Block at height 6 not found"
            );
        });
    });

    describe("finalizeBlocks", () => {
        it("should finalize blocks and update their finality in the database", async () => {
            config.finalityBlocks = 5;
            const highestBlockNumber = 20;
            const blocks = [
                { blockNumber: 10, blockHash: "0x123", finality: Finality.UNKNOWN },
                { blockNumber: 11, blockHash: "0x456", finality: Finality.UNKNOWN },
                { blockNumber: 11, blockHash: "0x457", finality: Finality.UNKNOWN },
            ];

            provider.getBlockNumber.mockResolvedValue(highestBlockNumber);
            blockDb.getBlocksByFinality.mockResolvedValue(blocks as any);
            provider.getBlockByHash.mockImplementation(hash => Promise.resolve(
                {
                    "0x123": { number: 10 },
                    "0x456": undefined,
                    "0x457": { number: 11 }
                }[hash] as any
            ));

            await blockScanner.finalizeBlocks();

            expect(blockDb.getBlocksByFinality).toHaveBeenCalledWith(config.chainId, Finality.UNKNOWN);
            expect(provider.getBlockByHash).toHaveBeenCalledTimes(blocks.length);
            expect(blockDb.updateFinality).toHaveBeenCalledWith(blocks[0].blockHash, Finality.FINAL);
            expect(blockDb.updateFinality).toHaveBeenCalledWith(blocks[1].blockHash, Finality.REVERTED);
            expect(blockDb.updateFinality).toHaveBeenCalledWith(blocks[2].blockHash, Finality.FINAL);
        });

        it("should throw an error if no final blocks exist for a height", async () => {
            config.finalityBlocks = 5;
            const highestBlockNumber = 20;
            const blocks = [
                { blockNumber: 10, blockHash: "0x123", finality: Finality.UNKNOWN },
            ];

            provider.getBlockNumber.mockResolvedValue(highestBlockNumber);
            blockDb.getBlocksByFinality.mockResolvedValue(blocks as any);
            provider.getBlockByHash.mockResolvedValue(null);

            await expect(blockScanner.finalizeBlocks()).rejects.toThrow(
                "No final blocks for height: 10"
            );
        });
    });
});