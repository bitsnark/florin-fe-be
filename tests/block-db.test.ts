import { beforeEach, describe, expect, test } from '@jest/globals';
import { BlockDb } from '../src/db/block-db';
import { Finality } from '../src/common/types';

const fakeBlockHash = `${Date.now()}`;

const fakeBlock = {
    blockHash: fakeBlockHash,
    chainId: 20002,
    blockNumber: 1,
    finality: Finality.UNKNOWN
};

describe('Block DB', () => {

    let db: BlockDb;

    beforeEach(() => {
        db = new BlockDb();
    });

    test('create and read', async () => {
        await db.create(fakeBlock);
        const block = await db.getByHash(fakeBlock.blockHash);
        expect(block).toEqual(block);
    });

    test('update finality', async () => {
        await db.create(fakeBlock);
        await db.updateFinality(fakeBlock.blockHash, Finality.REVERTED);
        const block = await db.getByHash(fakeBlock.blockHash);
        expect(block.finality).toEqual(Finality.REVERTED);
    });
});
