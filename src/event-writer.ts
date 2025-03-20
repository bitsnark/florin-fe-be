import { ethers } from "ethers";
import { PositionCreatedEventDb } from "./db/position-created-event-db";
import { PositionState, ReservationState } from "./common/types";
import { ReservationCreatedEventDb } from "./db/reservation-created-event-db";
import { PositionStateEventDb } from "./db/position-state-event-db";
import { ReservationStateEventDb } from "./db/reservation-state-event-db";
import { config } from "./common/config";

export interface IEventWriter {
    parseEvent(blockNumber: number, blockHash: string, parsedLog: ethers.LogDescription);
}

export class EventWriter implements IEventWriter {

    constructor() { }

    private async positionCreatedEvent(blockNumber: number, blockHash: string, args: ethers.Result) {
        const db = new PositionCreatedEventDb();
        let index = 0;
        await db.create({
            chainId: config.chainId,
            blockNumber: blockNumber,
            blockHash: blockHash,
            state: PositionState.ACTIVE,

            positionId: args[index++],
            ownerAddress: args[index++],
            tokenAddress: args[index++],
            originalAmount: args[index++],
            bitcoinAddress: args[index++],
            exchangeRate: args[index++]
        });
    }

    private async positionStateEvent(blockNumber: number, blockHash: string, args: ethers.Result) {
        const db = new PositionStateEventDb();
        let index = 0;
        await db.create({
            blockNumber: blockNumber,
            blockHash: blockHash,

            positionId: args[index++],
            state: args[index++]
        });

    }

    private async reservationCreatedEvent(blockNumber: number, blockHash: string, args: ethers.Result) {
        const db = new ReservationCreatedEventDb();
        let index = 0;
        await db.create({
            blockNumber: blockNumber,
            blockHash: blockHash,
            state: ReservationState.PENDING,

            reservationId: args[index++],
            ownerAddress: args[index++],
            positionId: args[index++],
            amount: args[index++]
        });
    }

    private async reservationStateEvent(blockNumber: number, blockHash: string, args: ethers.Result) {
        const db = new ReservationStateEventDb();
        let index = 0;
        await db.create({
            blockNumber: blockNumber,
            blockHash: blockHash,

            reservationId: args[index++],
            state: args[index++]
        });
    }

    public async parseEvent(blockNumber: number, blockHash: string, parsedLog: ethers.LogDescription) {
        switch (parsedLog.name) {
            case 'positionCreatedEvent':
                this.positionCreatedEvent(blockNumber, blockHash, parsedLog.args);
                break;
            case 'positionStateEvent':
                this.positionStateEvent(blockNumber, blockHash, parsedLog.args);
                break;
            case 'reservationCreatedEvent':
                this.reservationCreatedEvent(blockNumber, blockHash, parsedLog.args);
                break;
            case 'reservationStateEvent':
                this.reservationStateEvent(blockNumber, blockHash, parsedLog.args);
                break;
        }
    }
}
