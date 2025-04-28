import { Finality, Position, PositionState } from '../common/types';
import { Db } from "./db";

export interface PositionFilter {
    isFinality: Boolean;
    positionId?: string;
    address?: string;
    partialSettlement?: boolean;
}


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
        partialSettlement: row.partial_settlement,
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
        AND position_created_events.position_id = $1
        AND
            ( position_state_events.block_hash = blocks.block_hash OR
             position_created_events.block_hash = blocks.block_hash )
        AND ${finalityFlag ? "finality = 'FINAL'" : "finality <> 'REVERTED'"}
        ORDER BY position_state_events.event_id DESC
        `;
        const result = await this.query(query, [positionId]);

        if (!result) return undefined;
        return result.rows[0];
    }

    async getPositionsByOwner(address: string, finalityFlag?: boolean, limit: number = 100): Promise<Position[]> {
        const query = `
        SELECT * FROM position_created_events, position_state_events, blocks
        WHERE
        position_created_events.position_id = position_state_events.position_id
        AND position_created_events.owner_address = $1
        AND
            ( position_state_events.block_hash = blocks.block_hash OR
             position_created_events.block_hash = blocks.block_hash )
        AND ${finalityFlag ? "finality = 'FINAL'" : "finality <> 'REVERTED'"}
        ORDER BY position_state_events.event_id DESC LIMIT $2
        `;
        const result = await this.query(query, [address, limit]);

        if (result.rows.length < 1) return undefined;
        return result.rows.map(r => rowToPosition(r));

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


}
