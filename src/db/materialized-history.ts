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
    targetChain?: number;
    targetTxhash?: string;
    targetBlockHash?: string;
    targetBlockNumber?: number;
    targetFinality?: Finality;
    state?: string;
    registrationTimestamp?: string;
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
        const positions = await this.getOwnerFullPosition(address, finalityFlag, limit);
        if (positions.length < 1) return [];

        const btcTxs = await this.getBtcTxsByPositions(positions, finalityFlag);

        const result: HistoryRecord[] = positions.map(p => {
            const btcTx = btcTxs.find(b => b.positionId === p.positionId);
            return {
                ...p,
                originChain: p.registrationChain,
                originTxhash: p.registrationTxhash,
                originBlockNumber: p.registrationBlockNumber,
                originBlockHash: p.registrationBlockHash,
                originFinality: p.registrationFinality,
                ...btcTx
            }
        })

        return result;
    }

    protected async getOwnerFullPosition(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const query = `
        SELECT
            position_id, original_amount,token_address, owner_address, bitcoin_address,
            pc.chain_id as registration_chain, pc.txhash as registration_txhash,
            b.block_number, pc.block_hash as registration_block_hash, finality, b.block_timestamp
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
        return result.rows.map(r => ({
            positionId: r.position_id,
            amount: r.original_amount.toString(),
            tokenAddress: r.token_address,
            ownerAddress: r.owner_address,
            bitcoinAddress: r.bitcoin_address,
            registrationChain: r.registration_chain,
            registrationTxhash: r.registration_txhash,
            registrationBlockHash: r.registration_block_hash,
            registrationBlockNumber: r.block_number,
            registrationFinality: r.finality,
            registrationTimestamp: r.block_timestamp
        }));
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
        return result.rows.map(r => ({
            positionId: r.position_id,
            targetChain: r.target_chain,
            targetTxhash: r.target_txhash,
            targetBlockHash: r.target_block_hash,
            targetBlockNumber: r.target_block_number,
            targetFinality: r.finality
        }));
    }
    //----------------------------------------------------------------------------------------
    // Collect owner reservation history
    protected async getOwnerReservationHistory(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const reservations = await this.getOwnerCreatedReservations(address, finalityFlag, limit);
        if (reservations.length < 1) return [];

        const payments = await this.getOwnerBtcTransactions(reservations, finalityFlag);

        const ReservationsStatus = await this.getReservationLastStatus(reservations, finalityFlag);

        const result: HistoryRecord[] = reservations.map(r => {
            const btcTx = payments.find(p => p.reservationId === r.reservationId);
            const rs = ReservationsStatus.find(rs => rs.reservationId === r.reservationId);

            return {
                ...r,
                ...btcTx,
                ...rs
            }
        })

        return result;
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
        return result.rows.map(r => ({
            reservationId: r.reservation_id,
            amount: r.amount.toString(),
            bitcoinAddress: r.bitcoin_address,
            ownerAddress: r.owner_address,
            registrationChain: r.registration_chain,
            registrationTxhash: r.registration_txhash,
            registrationBlockNumber: r.registration_block_number,
            registrationBlockHash: r.registration_block_hash,
            registrationFinality: r.finality,
            registrationTimestamp: r.block_timestamp
        }));

    }

    protected async getOwnerBtcTransactions(reservations: HistoryRecord[], finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const query = `
        SELECT bt.position_id,
            reservation_id,
            b.chain_id as origin_chain,
            bt.txid as origin_txhash,
            b.block_number as origin_block_number,
            bt.block_hash as origin_block_hash,
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
        return result.rows.map(r => ({
            reservationId: r.reservation_id,
            originChain: r.origin_chain,
            originTxhash: r.origin_txhash,
            originBlockHash: r.origin_block_hash,
            originBlockNumber: r.origin_block_number,
            originFinality: r.finality
        }));

    }

    protected async getReservationLastStatus(reservations: HistoryRecord[], finalityFlag?: boolean): Promise<HistoryRecord[]> {
        const query = `
        SELECT rs.state,
            rs.reservation_id,
            b.chain_id as target_chain,
            rs.txhash as target_txhash,
            b.block_number as target_block_eight,
            rs.block_hash as target_block_hash,
            finality
        FROM reservation_state_events as rs, blocks as b
        WHERE rs.block_hash = b.block_hash
            AND reservation_id = ANY($1)
            AND rs.state <> 'PENDING'
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
            `
        const result = await this.query(query, [reservations.map(r => r.reservationId)]);
        if (result.rows.length < 1) return [];
        return result.rows.map(r => ({
            reservationId: r.reservation_id,
            state: r.state,
            targetChain: r.target_chain,
            targetTxhash: r.target_txhash,
            targetBlockHash: r.target_block_hash,
            targetBlockNumber: r.target_block_eight,
            targetFinality: r.finality
        }));
    }


}
