

import { HistoryRecord, mapRowsToHistoryRecords, MaterializedHistory } from './materialized-history';

export class MaterializedPosition extends MaterializedHistory {
    constructor() {
        super();
    }

    async getPositionRecord(positionId: string, finalityFlag: boolean): Promise<HistoryRecord> {
        let position = await this.getPositionById(positionId, finalityFlag);
        if (!position) return undefined;

        position.originChain = position.registrationChain;
        position.originTxhash = position.registrationTxhash;
        position.originBlockNumber = position.registrationBlockNumber;
        position.originBlockHash = position.registrationBlockHash;
        position.originFinality = position.registrationFinality;

        const btcTxs = await this.getBtcTxsByPositions([position], finalityFlag);
        if (btcTxs.length === 1) {
            position = {
                ...position,
                ...btcTxs[0]
            }
        }
        return position
    }

    protected async getPositionById(positionId: string, finalityFlag?: boolean): Promise<HistoryRecord> {
        const query = `
        SELECT
            position_id, original_amount,token_address, owner_address, bitcoin_address,
            pc.chain_id as registration_chain, pc.txhash as registration_txhash,
            b.block_number, pc.block_hash as registration_block_hash, finality, b.block_timestamp
        FROM
            position_created_events as pc, blocks as b
        WHERE pc.block_hash = b.block_hash
            AND position_id = $1
            AND partial_settlement = false
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
            `
        const result = await this.query(query, [positionId]);

        if (result.rows.length < 1) return;
        return mapRowsToHistoryRecords(result.rows)[0];
    }


}
