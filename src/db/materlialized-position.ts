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
        const result = await this.getPositionByFilter({ positionId, isFinality: finalityFlag });

        if (!result) return undefined;
        return result[0];
    }

    async getPositionsByOwner(address: string, finalityFlag?: boolean, limit?: number): Promise<Position[]> {
        return await this.getPositionByFilter({ address, isFinality: finalityFlag }, limit);
    }

    async getFullPositionsByOwner(address: string, finalityFlag?: boolean, limit?: number): Promise<Position[]> {
        return await this.getPositionByFilter({ address, isFinality: finalityFlag, partialSettlement: false }, limit);
    }

    async getPositionByFilter(filter: PositionFilter, limit: number = 100): Promise<Position[]> {
        let condition: string = '';
        const params: any[] = [];

        // Convert filter keys to SQL condition additions
        for (const [k, v] of Object.entries(filter)) {
            if (k === 'isFinality') {
                condition = condition + ` AND ${v ? FilterKeysToFields(k) + " = 'FINAL'" : FilterKeysToFields(k) + " <> 'REVERTED'"
                    }`
            }

            else if (k == 'positionId' || k == 'address') {
                condition = condition + ` AND ${FilterKeysToFields(k)} = $${params.length + 1}`;
                params.push(v);
            }


        }
        params.push(limit);


        function FilterKeysToFields(filterKey: string): string {
            if (filterKey == 'positionId')
                return 'position_created_events.position_id'
            if (filterKey == 'address')
                return 'position_created_events.owner_address'
            if (filterKey == 'isFinality')
                return 'blocks.finality'
        }

        const query = `
        SELECT * FROM position_created_events, position_state_events, blocks
        WHERE
        position_created_events.position_id = position_state_events.position_id
        AND
            ( position_state_events.block_hash = blocks.block_hash OR
             position_created_events.block_hash = blocks.block_hash )
        ${condition}
        ORDER BY position_state_events.event_id DESC LIMIT $${params.length}
        `;
        const result = await this.query(query, params);

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
