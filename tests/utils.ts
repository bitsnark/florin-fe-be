import { EventsDb } from "../src/db/events-db";
import { BlockDb } from '../src/db/block-db';
import { Finality } from "../src/common/types";

const fakeBlockHash = '1234';
const fakeBlockNumber = 1234;

export async function createPosition(position: any) {
    const eventsDb = new EventsDb();
    await eventsDb.positionCreated({
        positionId: position.positionId,
        chainId: position.chainId,
        ownerAddress: position.ownerAddress,
        tokenAddress: position.tokenAddress,
        originalAmount: position.originalAmount,
        bitcoinAddress: position.bitcoinAddress,
        exchangeRate: position.exchangeRate,
        blockNumber: fakeBlockNumber,
        blockHash: fakeBlockHash
    });
    await eventsDb.positionStateChanged({
        positionId: position.positionId,
        state: position.state,
        blockNumber: fakeBlockNumber,
        blockHash: fakeBlockHash
    });
    const blockDb = new BlockDb();
    await blockDb.create({
        blockHash: fakeBlockHash,
        chainId: position.chainId,
        blockNumber: fakeBlockNumber,
        finality: Finality.FINAL,
    });
}

export async function createReservation(resevation: any) {
    const eventsDb = new EventsDb();
    await eventsDb.reservationCreated({
        positionId: resevation.positionId,
        reservationId: resevation.reservationId,
        ownerAddress: resevation.ownerAddress,
        blockNumber: fakeBlockNumber,
        blockHash: fakeBlockHash,
        amount: resevation.amount
    });
    await eventsDb.reservationStateChanged({
        reservationId: resevation.reservationId,
        state: resevation.state,
        blockNumber: fakeBlockNumber,
        blockHash: fakeBlockHash
    });
}
