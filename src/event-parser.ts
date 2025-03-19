import { ethers } from "ethers";
import { PositionCreatedEventDb } from "./db/position-created-event-db";
import { PositionStatus, ReservationStatus } from "./common/types";
import { PositionStatusEventDb } from "./db/position-status-event-db";
import { ReservationCreatedEventDb } from "./db/reservation-created-event-db";
import { ReservationStatusEventDb } from "./db/reservation-status-event-db";

export class EventParser {

    async PositionCreatedEvent(args: ethers.Result) {
        const db = new PositionCreatedEventDb();
        await db.create({
            chainId: 0,
            blockNumber: 0,
            blockHash: "",
            positionId: "",
            status: PositionStatus.ACTIVE,
            ownerAddress: "",
            tokenAddress: "",
            originalAmount: 0n,
            bitcoinAddress: "",
            exchangeRate: 0n,
            eventId: 0
        });
    }

    async PositionStatusEvent(args: ethers.Result) {
        const db = new PositionStatusEventDb();
        await db.create({
            blockNumber: 0,
            blockHash: "",
            positionId: "",
            status: PositionStatus.NONE
        });

    }

    async ReservationCreatedEvent(args: ethers.Result) {
        const db = new ReservationCreatedEventDb();
        await db.create({
            blockNumber: 0,
            blockHash: "",
            reservationId: "",
            ownerAddress: "",
            status: ReservationStatus.NONE,
            positionId: "",
            amount: 0n,
            createdAtBlock: 0
        });
    }

    async ReservationStatusEvent(args: ethers.Result) {
        const db = new ReservationStatusEventDb();
        await db.create({
            blockNumber: 0,
            blockHash: "",
            reservationId: "",
            status: ReservationStatus.NONE
        });
    }

    async parseEvent(parsedLog: ethers.LogDescription) {
        if (!this[parsedLog.name]) {
            throw new Error(`Unrecognized event: ${parsedLog.name}`);
        }
        await this[parsedLog.name].apply(this, parsedLog.args);
    }
}
