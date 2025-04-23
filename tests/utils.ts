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
        blockHash: fakeBlockHash,
        txhash: '0x00000',
        partialSettlement: position.partialSettlement
    });

    await eventsDb.positionStateChanged({
        positionId: position.positionId,
        state: position.state,
        blockNumber: fakeBlockNumber,
        blockHash: fakeBlockHash,
        txhash: '0x00000'
    });
    const blockDb = new BlockDb();
    await blockDb.create({
        blockHash: fakeBlockHash,
        chainId: position.chainId,
        blockNumber: fakeBlockNumber,
        finality: Finality.FINAL,
    });
}

export async function createReservation(reservation: any) {
    const eventsDb = new EventsDb();
    await eventsDb.reservationCreated({
        positionId: reservation.positionId,
        reservationId: reservation.reservationId,
        ownerAddress: reservation.ownerAddress,
        blockNumber: fakeBlockNumber,
        blockHash: fakeBlockHash,
        amount: reservation.amount,
        txhash: '0x00000',
        btcAddress: reservation.btcAddress,
        isInscription: reservation.isInscription
    });
    await eventsDb.reservationStateChanged({
        reservationId: reservation.reservationId,
        state: reservation.state,
        blockNumber: fakeBlockNumber,
        blockHash: fakeBlockHash,
        txhash: '0x00000'
    });
}
