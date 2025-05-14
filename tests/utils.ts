import { EventsDb } from "../src/db/events-db";
import { BlockDb } from '../src/db/block-db';
import { Finality } from "../src/common/types";
import { BtcTxDb } from "../src/db/btc-tx-db";

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
        blockNumber: position.blockNumber ? position.blockNumber : fakeBlockNumber,
        blockHash: position.blockHash ? position.blockHash : fakeBlockHash,
        txhash: '0x00000CreatePos' + position.positionId,
        partialSettlement: position.partialSettlement
    });

    await positionStateChanged(position)

    const blockDb = new BlockDb();
    await blockDb.create({
        blockHash: fakeBlockHash,
        chainId: position.chainId,
        blockNumber: position.blockNumber ? position.blockNumber : fakeBlockNumber,
        finality: Finality.FINAL,
        blockTimestamp: new Date().toISOString()
    });
}

export async function createReservation(reservation: any) {
    const eventsDb = new EventsDb();
    await eventsDb.reservationCreated({
        positionId: reservation.positionId,
        reservationId: reservation.reservationId,
        ownerAddress: reservation.ownerAddress,
        blockNumber: reservation.blockNumber ? reservation.blockNumber : fakeBlockNumber,
        blockHash: reservation.blockHash ? reservation.blockHash : fakeBlockHash,
        amount: reservation.amount,
        txhash: '0x00000createRes' + reservation.reservationId,
        btcAddress: reservation.btcAddress,
        isInscription: reservation.isInscription
    });
    await reservationStateChanged(reservation);
}

export async function positionStateChanged(stateEvent: any) {
    const eventsDb = new EventsDb();
    await eventsDb.positionStateChanged({
        positionId: stateEvent.positionId,
        state: stateEvent.state,
        blockNumber: stateEvent.blockNumber ? stateEvent.blockNumber : fakeBlockNumber,
        blockHash: stateEvent.blockHash ? stateEvent.blockHash : fakeBlockHash,
        txhash: '0x00000posStateEvent' + stateEvent.positionId
    });
}

export async function reservationStateChanged(stateEvent: any) {
    const eventsDb = new EventsDb();
    await eventsDb.reservationStateChanged({
        reservationId: stateEvent.reservationId,
        state: stateEvent.state,
        blockNumber: stateEvent.blockNumber ? stateEvent.blockNumber : fakeBlockNumber,
        blockHash: stateEvent.blockHash ? stateEvent.blockHash : fakeBlockHash,
        txhash: '0x00000resStateEvent' + stateEvent.reservationId
    });
}


export async function createBlock(block: any) {
    const blockDb = new BlockDb();
    await blockDb.create({
        blockHash: block.blockHash,
        chainId: block.chainId,
        blockNumber: block.blockNumber ? block.blockNumber : fakeBlockNumber,
        finality: Finality.FINAL,
        blockTimestamp: new Date().toISOString()
    });

}

export interface ReservationBtcTx {
    txid: string;
    blockHash: string;
    blockHeight: number;
    targetChainId: number;
    reservationId: string;
    positionId: string;
}

export async function createBtcTx(btcTx: any) {
    const btcTxDb = new BtcTxDb()
    await btcTxDb.insertTx({
        txid: btcTx.txid,
        blockHash: btcTx.blockHash,
        blockHeight: btcTx.blockNumber,
        targetChainId: btcTx.targetChainId,
        reservationId: btcTx.reservationId,
        positionId: btcTx.positionId
    });

}
