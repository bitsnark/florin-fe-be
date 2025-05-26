import { ethers } from "ethers";
import { config } from "../common/config";
import { EventsDb } from "../db/events-db";
import { logger } from "../common/logger";

export interface IEventWriter {
    parseEvent(blockNumber: number, blockHash: string, txhash: string, parsedLog: ethers.LogDescription): Promise<void>;
}

export class EventWriter implements IEventWriter {

    db: EventsDb;

    constructor() {
        this.db = new EventsDb();
    }

    private async positionCreatedEvent(blockNumber: number, blockHash: string, txhash: string, args: ethers.Result) {
        const bitcoinAddress = Array.isArray(args[2]) ? args[2].join(",") : args[2];

        await this.db.positionCreated({
            chainId: config.chainId,
            blockNumber: blockNumber,
            blockHash: blockHash,
            txhash,

            positionId: args[0],
            ownerAddress: args[1],
            bitcoinAddress: bitcoinAddress,
            tokenAddress: args[2],
            originalAmount: args[3],
            exchangeRate: args[4],
            partialSettlement: args[5]
        });
    }

    private async positionStateEvent(blockNumber: number, blockHash: string, txhash: string, args: ethers.Result) {
        let index = 0;
        await this.db.positionStateChanged({
            blockNumber: blockNumber,
            blockHash: blockHash,
            txhash,

            positionId: args[index++],
            state: args[index++]
        });
    }

    private async reservationCreatedEvent(blockNumber: number, blockHash: string, txhash: string, args: ethers.Result) {
        let index = 0;
        await this.db.reservationCreated({
            blockNumber: blockNumber,
            blockHash: blockHash,
            txhash,

            reservationId: args[index++],
            positionId: args[index++],
            ownerAddress: args[index++],
            amount: args[index++],
            isInscription: args[index++],
            btcAddress: args[index++],

        });
    }

    private async reservationStateEvent(blockNumber: number, blockHash: string, txhash: string, args: ethers.Result) {
        let index = 0;
        await this.db.reservationStateChanged({
            blockNumber: blockNumber,
            blockHash: blockHash,
            txhash,

            reservationId: args[index++],
            state: args[index++]
        });
    }

    public async parseEvent(blockNumber: number, blockHash: string, txhash: string, parsedLog: ethers.LogDescription) {
        switch (parsedLog.name) {
            case 'PositionCreated':
                this.positionCreatedEvent(blockNumber, blockHash, txhash, parsedLog.args);
                logger.info(`parseEvent: PositionCreated  \n block ${blockNumber}|${blockHash} \n evm txhash ${txhash} \n event params ${parsedLog.args.join(' | ')}`);
                break;
            case 'PositionStatusChanged':
                this.positionStateEvent(blockNumber, blockHash, txhash, parsedLog.args);
                logger.info(`parseEvent: PositionStatusChanged  \n block ${blockNumber}|${blockHash} \n evm txhash ${txhash} \n event params ${parsedLog.args.join(' | ')}`);
                break;
            case 'ReservationCreated':
                this.reservationCreatedEvent(blockNumber, blockHash, txhash, parsedLog.args);
                logger.info(`parseEvent: ReservationCreated  \n block ${blockNumber}|${blockHash} \n evm txhash ${txhash} \n event params ${parsedLog.args.join(' | ')}`);
                break;
            case 'ReservationStatusChanged':
                this.reservationStateEvent(blockNumber, blockHash, txhash, parsedLog.args);
                logger.info(`parseEvent: ReservationStatusChanged  \n block ${blockNumber}|${blockHash} \n evm txhash ${txhash} \n event params ${parsedLog.args.join(' | ')}`);
                break;
        }
    }
}
