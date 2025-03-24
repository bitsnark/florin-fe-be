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
        blockNumber: 0,
        blockHash: '',
        finality: row.finality
    };
}

export class MaterializedPosition extends Db {

    constructor() {
        super();
    }

    async getPositionById(positionId: string, finalityFlag?: boolean): Promise<Position> {
        const query = `
        SELECT * from position_created_event, position_state_event, blocks
        WHERE
        position_created_event.position_id = position_state_event.position_id
        AND position_state_event.block_hash = blocks.block_hash
        AND position_id = $1
        AND finality IN $2
        ORDER BY position_state_event.event_id DESC LIMIT 1
        `;
        const result = await this.query<any>(query, [
            positionId,
            finalityFlag ? [Finality.FINAL] : [Finality.FINAL, Finality.UNKNOWN]
        ]);
        if (result.rows.length == 1) return undefined;
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
        WHERE b.finality IN $1
        ORDER BY pce.position_id, pse.event_id DESC;
        `;
        const result = await this.query<any>(query, [
            finalityFlag ? [Finality.FINAL] : [Finality.FINAL, Finality.UNKNOWN]
        ]);
        return result.rows.map(rowToPosition);
    }

    async getActivePositions(finalityFlag?: boolean): Promise<Position[]> {
        return (await this.getAllPositions(finalityFlag)).filter(p => p.state == PositionState.ACTIVE);
    }

    async getPositionsByOwner(ownerAddress: string, finalityFlag?: boolean): Promise<Position[]> {
        return (await this.getAllPositions(finalityFlag)).filter(p => p.ownerAddress == ownerAddress);
    }
}
