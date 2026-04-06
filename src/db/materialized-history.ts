import { config } from "../common/config";
import { Finality } from '../common/types';
import { Db } from "./db";





export interface HistoryRecord {
    positionId?: string;
    reservationId?: string;
    amount?: string;
    tokenAddress?: string;
    ownerAddress?: string;
    bitcoinAddress?: string;
    registrationChain?: number;
    registrationTxhash?: string;
    registrationBlockHash?: string;
    registrationBlockNumber?: string;
    registrationFinality?: Finality;
    originChain?: number;
    originTxhash?: string;
    originBlockHash?: string;
    originBlockNumber?: string;
    originFinality?: Finality;
    originAmount?: string;
    targetChain?: number;
    targetTxhash?: string;
    targetBlockHash?: string;
    targetBlockNumber?: number;
    targetFinality?: Finality;
    state?: string;
    registrationTimestamp?: string;
    liteforgeTxhash?: string;
}

export function mapRowsToHistoryRecords(rows: any[]): HistoryRecord[] {
    return rows.map((row) => {
        const mappedRow: any = {};
        for (const key in row) {
            if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null) {
                // Convert '_x' to 'X'
                const convertedKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
                mappedRow[convertedKey] = row[key];
            }
        }
        return mappedRow as HistoryRecord;
    });
}
export class MaterializedHistory extends Db {

    constructor() {
        super();
    }

    async getOwnerHistory(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const positions = await this.getOwnerPositionHistory(address, finalityFlag, limit);
        const reservations = await this.getOwnerReservationHistory(address, finalityFlag, limit);

        return [...positions, ...reservations];
    }

    //----------------------------------------------------------------------------------------
    // Collect owner position history
    protected async getOwnerPositionHistory(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const positions = await this.getOwnerFullPositions(address, finalityFlag, limit);
        if (positions.length < 1) return [];

        const [btcTxs, positionStates] = await Promise.all([
            this.getBtcTxsByPositions(positions, finalityFlag),
            this.getPositionLastStatus(positions, finalityFlag),
        ]);

        const result: HistoryRecord[] = positions.map(p => {
            const btcTx = btcTxs.find(b => b.positionId === p.positionId);
            const posState = positionStates.find(s => s.positionId === p.positionId);
            return {
                ...p,
                originChain: p.registrationChain,
                originTxhash: p.registrationTxhash,
                originBlockNumber: p.registrationBlockNumber,
                originBlockHash: p.registrationBlockHash,
                originFinality: p.registrationFinality,
                originAmount: p.amount,
                ...btcTx,
                state: posState?.state,
            }
        })

        return result;
    }

    protected async getPositionLastStatus(positions: HistoryRecord[], finalityFlag?: boolean): Promise<HistoryRecord[]> {
        const query = `
        SELECT DISTINCT ON (ps.position_id)
            ps.position_id, ps.state
        FROM position_state_events ps, blocks b
        WHERE ps.block_hash = b.block_hash
            AND ps.position_id = ANY($1)
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
        ORDER BY ps.position_id, ps.event_id DESC
        `;
        const result = await this.query(query, [positions.map(p => p.positionId)]);
        if (result.rows.length < 1) return [];
        return mapRowsToHistoryRecords(result.rows);
    }



    protected async getOwnerFullPositions(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const query = `
        SELECT
            position_id, original_amount as amount,token_address, owner_address, bitcoin_address,
            pc.chain_id as registration_chain, pc.txhash as registration_txhash,
            b.block_number as registration_block_number, pc.block_hash as registration_block_hash, finality, b.block_timestamp
        FROM
            position_created_events as pc, blocks as b
        WHERE pc.block_hash = b.block_hash
            AND lower(owner_address)= lower($1)
            AND partial_settlement = false
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
            ORDER BY pc.event_id DESC LIMIT $2
    `
        const result = await this.query(query, [address, limit]);

        if (result.rows.length < 1) return [];
        return mapRowsToHistoryRecords(result.rows);
    }

    protected async getBtcTxsByPositions(positions: HistoryRecord[], finalityFlag?: boolean): Promise<HistoryRecord[]> {
        const query = `
        SELECT bt.position_id, b.chain_id as target_chain, bt.txid as target_txhash,
            b.block_number as target_block_number, bt.block_hash as target_block_hash, finality
        FROM
            bitcoin_txs as bt , blocks as b
        WHERE bt.block_hash = b.block_hash
            AND position_id = ANY($1)
            AND b.chain_id= $2
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
        `

        const positionIds = positions.map(p => p.positionId);
        const result = await this.query(query, [positionIds, config.btcChainId]);
        if (result.rows.length < 1) return [];
        return mapRowsToHistoryRecords(result.rows);
    }
    //----------------------------------------------------------------------------------------
    // Collect owner reservation history
    protected async getOwnerReservationHistory(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const [reservations, liteforgeReservations] = await Promise.all([
            this.getOwnerCreatedReservations(address, finalityFlag, limit),
            this.getLiteforgeReservationsForUser(address, finalityFlag, limit),
        ]);
        const allReservations = [...reservations, ...liteforgeReservations];
        if (allReservations.length < 1) return [];

        const payments = await this.getOwnerBtcTransactions(allReservations, finalityFlag);

        const ReservationsStatus = await this.getReservationLastStatus(allReservations, finalityFlag);

        return allReservations.map(r => {
            const btcTx = payments.find(p => p.reservationId === r.reservationId);
            const rs = ReservationsStatus.find(rs => rs.reservationId === r.reservationId);
            return { ...r, ...btcTx, ...rs };
        });
    }

    protected async getLiteforgeReservationsForUser(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        if (!config.liteforgeDepositorAddress) return [];
        // Join on liteforge_reserved_events (populated at reservation creation time)
        // so reservations appear immediately, before the Bridged event fires.
        // Optionally pick up liteforgeTxhash if the bridge event has already been indexed.
        const query = `
        SELECT DISTINCT ON (rc.reservation_id)
            rc.reservation_id, rc.amount, rc.bitcoin_address, rc.owner_address,
            b.chain_id as registration_chain, rc.txhash as registration_txhash,
            b.block_number as registration_block_number, rc.block_hash as registration_block_hash,
            b.finality, b.block_timestamp,
            (
                SELECT lb.txhash
                FROM liteforge_bridge_events lb
                JOIN blocks lb_b ON lb.block_hash = lb_b.block_hash
                WHERE lower(lb.l2_recipient) = lower(lre.l2_recipient)
                    AND lb.block_number > rc.block_number
                    AND ${finalityFlag ? "lb_b.finality = 'FINAL'" : "lb_b.finality <> 'REVERTED'"}
                ORDER BY lb.block_number ASC
                LIMIT 1
            ) as liteforge_txhash
        FROM reservation_created_events rc
        JOIN blocks b ON rc.block_hash = b.block_hash
        JOIN liteforge_reserved_events lre ON lre.reservation_id = rc.reservation_id
        WHERE lower(lre.l2_recipient) = lower($1)
            AND rc.is_inscription = false
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
        ORDER BY rc.reservation_id, rc.event_id DESC
        LIMIT $2
        `;
        const result = await this.query(query, [address, limit]);
        if (result.rows.length < 1) return [];
        return mapRowsToHistoryRecords(result.rows);
    }

    protected async getOwnerCreatedReservations(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const query = `
        SELECT
            reservation_id, amount, bitcoin_address, owner_address,
            b.chain_id as registration_chain, rc.txhash as registration_txhash,
            b.block_number as registration_block_number, rc.block_hash as registration_block_hash,
            finality, b.block_timestamp
        FROM
            reservation_created_events as rc, blocks as b
        WHERE rc.block_hash = b.block_hash
            AND lower(owner_address)= lower($1)
            AND is_inscription = false
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
            ORDER BY rc.event_id DESC LIMIT $2
            `
        const result = await this.query(query, [address, limit]);
        if (result.rows.length < 1) return [];
        return mapRowsToHistoryRecords(result.rows);

    }

    protected async getOwnerBtcTransactions(reservations: HistoryRecord[], finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const query = `
        SELECT bt.position_id,
            reservation_id,
            b.chain_id as origin_chain,
            bt.txid as origin_txhash,
            b.block_number as origin_block_number,
            bt.block_hash as origin_block_hash,
            bt.sat_amount as origin_amount,
            finality
        FROM
            bitcoin_txs as bt , blocks as b
        WHERE bt.block_hash = b.block_hash
            AND reservation_id = ANY ($1)
            AND b.chain_id=$2
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
            `
        const result = await this.query(query, [reservations.map(r => r.reservationId), config.btcChainId]);
        if (result.rows.length < 1) return [];
        return mapRowsToHistoryRecords(result.rows);

    }

    protected async getReservationLastStatus(reservations: HistoryRecord[], finalityFlag?: boolean): Promise<HistoryRecord[]> {
        const query = `
        SELECT rs.state,
            rs.reservation_id,
            b.chain_id as target_chain,
            rs.txhash as target_txhash,
            b.block_number as target_block_number,
            rs.block_hash as target_block_hash,
            finality
        FROM reservation_state_events as rs, blocks as b
        WHERE rs.block_hash = b.block_hash
            AND reservation_id = ANY($1)
            AND rs.state <> '1'
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
            `
        const result = await this.query(query, [reservations.map(r => r.reservationId)]);
        if (result.rows.length < 1) return [];
        return mapRowsToHistoryRecords(result.rows);
    }


}
