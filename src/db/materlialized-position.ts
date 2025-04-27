import { Finality, Position, PositionState } from '../common/types';
import { Db } from "./db";

function rowToPosition(row: any): Position {
    return {
        positionId: row.position_id,
        chainId: row.chain_id,
        state: row.state,
        ownerAddress: row.owner_address,
        tokenAddress: row.token_address,
        originalAmount: row.original_amount,
        bitcoinAddress: row.bitcoin_address,
        exchangeRate: row.exchange_rate,
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        finality: row.finality,
        txhash: row.txhash
    };
}

export class MaterializedPosition extends Db {

    constructor() {
        super();
    }

    async getPositionById(positionId: string, finalityFlag?: boolean): Promise<Position> {
        const query = `
        SELECT * FROM position_created_events, position_state_events, blocks
        WHERE
        position_created_events.position_id = position_state_events.position_id
        AND 
            ( position_state_events.block_hash = blocks.block_hash OR 
             position_created_events.block_hash = blocks.block_hash )
        AND position_created_events.position_id = $1
        AND ${finalityFlag ? "blocks.finality = 'FINAL'" : "blocks.finality <> 'REVERTED'"}
        ORDER BY position_state_events.event_id DESC LIMIT 1
        `;
        const result = await this.query(query, [
            positionId
        ]);
        if (result.rows.length < 1) return undefined;
        return rowToPosition(result.rows[0]);
    }

    async getAllPositions(finalityFlag?: boolean): Promise<Position[]> {
        const query = `
        SELECT DISTINCT ON (pce.position_id)
            pce.*,
            pse.state,
            pse.event_id,
            b.finality,
            b.block_number,
            b.chain_id
        FROM position_created_events pce
        JOIN position_state_events pse ON pce.position_id = pse.position_id
        JOIN blocks b ON pse.block_hash = b.block_hash
        WHERE 
        ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
        ORDER BY pce.position_id, pse.event_id DESC;
        `;
        const result = await this.query(query, []);
        return result.rows.map(rowToPosition);
    }

    async getActivePositions(finalityFlag?: boolean): Promise<Position[]> {
        return (await this.getAllPositions(finalityFlag)).filter(p => p.state == PositionState.ACTIVE);
    }

    async getPositionsByOwner(ownerAddress: string, finalityFlag?: boolean): Promise<Position[]> {
        return (await this.getAllPositions(finalityFlag)).filter(p => p.ownerAddress == ownerAddress);
    }
}
