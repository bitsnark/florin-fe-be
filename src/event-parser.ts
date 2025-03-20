import { ethers } from "ethers";
import { PositionCreatedEventDb } from "./db/position-created-event-db";
import { PositionState, ReservationState } from "./common/types";
import { PositionStateEventDb } from "./db/position-state-event-db";
import { ReservationCreatedEventDb } from "./db/reservation-created-event-db";
import { ReservationStateEventDb } from "./db/reservation-state-event-db";

export class EventParser {

    async PositionCreatedEvent(args: ethers.Result) {
        const db = new PositionCreatedEventDb();
        await db.create({
            chainId: 0,
            blockNumber: 0,
            blockHash: "",
            positionId: "",
            state: PositionState.ACTIVE,
            ownerAddress: "",
            tokenAddress: "",
            originalAmount: 0n,
            bitcoinAddress: "",
            exchangeRate: 0n,
            eventId: 0
        });
    }

    async PositionStateEvent(args: ethers.Result) {
        const db = new PositionStateEventDb();
        await db.create({
            blockNumber: 0,
            blockHash: "",
            positionId: "",
            state: PositionState.NONE
        });

    }

    async ReservationCreatedEvent(args: ethers.Result) {
        const db = new ReservationCreatedEventDb();
        await db.create({
            blockNumber: 0,
            blockHash: "",
            reservationId: "",
            ownerAddress: "",
            state: ReservationState.NONE,
            positionId: "",
            amount: 0n,
            createdAtBlock: 0
        });
    }

    async ReservationStateEvent(args: ethers.Result) {
        const db = new ReservationStateEventDb();
        await db.create({
            blockNumber: 0,
            blockHash: "",
            reservationId: "",
            state: ReservationState.NONE
        });
    }

    async parseEvent(parsedLog: ethers.LogDescription) {
        if (!this[parsedLog.name]) {
            throw new Error(`Unrecognized event: ${parsedLog.name}`);
        }
        await this[parsedLog.name].apply(this, parsedLog.args);
    }
}
