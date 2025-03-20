import { ethers } from "ethers";
import { config } from "./common/config";
import { EventsDb } from "./db/events-db";

export interface IEventWriter {
    parseEvent(blockNumber: number, blockHash: string, parsedLog: ethers.LogDescription);
}

export class EventWriter implements IEventWriter {

    db: EventsDb;

    constructor() {
        this.db = new EventsDb();
    }

    private async positionCreatedEvent(blockNumber: number, blockHash: string, args: ethers.Result) {
        let index = 0;
        await this.db.positionCreated({
            chainId: config.chainId,
            blockNumber: blockNumber,
            blockHash: blockHash,

            positionId: args[index++],
            ownerAddress: args[index++],
            tokenAddress: args[index++],
            originalAmount: args[index++],
            bitcoinAddress: args[index++],
            exchangeRate: args[index++]
        });
    }

    private async positionStateEvent(blockNumber: number, blockHash: string, args: ethers.Result) {
        let index = 0;
        await this.db.positionStateChanged({
            blockNumber: blockNumber,
            blockHash: blockHash,

            positionId: args[index++],
            state: args[index++]
        });

    }

    private async reservationCreatedEvent(blockNumber: number, blockHash: string, args: ethers.Result) {
        let index = 0;
        await this.db.reservationCreated({
            blockNumber: blockNumber,
            blockHash: blockHash,

            reservationId: args[index++],
            ownerAddress: args[index++],
            positionId: args[index++],
            amount: args[index++]
        });
    }

    private async reservationStateEvent(blockNumber: number, blockHash: string, args: ethers.Result) {
        let index = 0;
        await this.db.reservationStateChanged({
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
