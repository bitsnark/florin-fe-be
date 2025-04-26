import { config } from "../common/config";
import { Finality } from '../common/types';
import { Db } from "./db";

export interface HistoryRecord {
    position_id?: string;
    reservation_id?: string;
    amount?: number;
    token_address?: string;
    btc_address?: string;
    register_chain?: number;
    register_txhash?: string;
    register_block_hash?: string;
    register_finality?: Finality;
    pay_chain?: number;
    pay_txhash?: string;
    pay_block_hash?: string;
    pay_finality?: Finality;
    receive_chain?: number;
    receive_txhash?: string;
    receive_block_hash?: string;
    receive_finality?: Finality;
}

export class MaterializedHistory extends Db {

    constructor() {
        super();
    }

    async getOwnerHistory(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const positions = await this.getOwnerPositionHistory(address, finalityFlag, limit);
        const reservations = await this.getOwnerReservationHistory(address, finalityFlag, limit);
        console.log([...positions, ...reservations]);
        return [...positions, ...reservations];
    }

    //----------------------------------------------------------------------------------------
    // Collect owner position history
    protected async getOwnerPositionHistory(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const positions = await this.getOwnerFullPosition(address, finalityFlag, limit);
        if (positions.length < 1) return [];

        const btcTxs = await this.getBtcTxsByPositions(positions, finalityFlag);

        const result: HistoryRecord[] = positions.map(p => {
            const btcTx = btcTxs.find(b => b.position_id === p.position_id);
            return {
                ...p,
                pay_chain: p.register_chain,
                pay_txhash: p.register_txhash,
                pay_block_hash: p.register_block_hash,
                pay_finality: p.register_finality,
                ...btcTx
            }
        })

        return result;
    }

    protected async getOwnerFullPosition(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const query = `
        SELECT
            position_id, original_amount,token_address,  bitcoin_address,
            pc.chain_id as register_chain, pc.txhash as register_txhash,
            pc.block_hash as register_block_hash, finality
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
            position_id: r.position_id,
            amount: r.original_amount,
            token_address: r.token_address,
            btc_address: r.bitcoin_address,
            register_chain: r.register_chain,
            register_txhash: r.register_txhash,
            register_block_hash: r.register_block_hash,
            register_finality: r.finality
        }));
    }

    protected async getBtcTxsByPositions(positions: HistoryRecord[], finalityFlag?: boolean): Promise<HistoryRecord[]> {
        const query = `
        SELECT bt.position_id,b.chain_id as receive_chain,
            bt.txid as receive_txhash, bt.block_hash as receive_txhash, finality
        FROM
            bitcoin_txs as bt , blocks as b
        WHERE bt.block_hash = b.block_hash
            AND position_id = ANY($1)
            AND b.chain_id= $2
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
        `

        const positionIds = positions.map(p => p.position_id);
        const result = await this.query(query, [positionIds, config.btcChainId]);
        if (result.rows.length < 1) return [];
        return result.rows.map(r => ({
            position_id: r.position_id,
            receive_chain: r.receive_chain,
            receive_txhash: r.receive_txhash,
            receive_block_hash: r.receive_block_hash,
            receive_finality: r.finality
        }));
    }
    //----------------------------------------------------------------------------------------
    // Collect owner reservation history
    protected async getOwnerReservationHistory(address: string, finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const reservations = await this.getOwnerCreatedReservations(address, finalityFlag, limit);
        if (reservations.length < 1) return [];

        const payments = await this.getBtcTxsByPositions(reservations, finalityFlag);

        const ReservationsStatus = await this.getReservationLastStatus(reservations[0].reservation_id, finalityFlag);

        const result: HistoryRecord[] = reservations.map(r => {
            const btcTx = payments.find(b => b.position_id === r.position_id);
            const rs = ReservationsStatus.find(rs => rs.reservation_id === r.reservation_id);

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
            reservation_id, amount, btc_address, owner_address,
            b.chain_id as register_chain, rc.txhash as register_txhash,
            rc.block_hash as register_block_hash, finality
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
            reservation_id: r.reservation_id,
            amount: r.amount,
            btc_address: r.btc_address,
            register_chain: r.register_chain,
            register_txhash: r.register_txhash,
            register_block_hash: r.register_block_hash,
            register_finality: r.finality,
            owner_address: r.owner_address
        }));

    }

    protected async getOwnerBtcTransactions(reservations: HistoryRecord[], finalityFlag?: boolean, limit: number = 100): Promise<HistoryRecord[]> {
        const query = `
        SELECT bt.position_id,
            reservation_id,
            b.chain_id as pay_chain,
            bt.txid as pay_txhash,
            bt.block_hash as pay_txhash,
            finality
        FROM
            bitcoin_txs as bt , blocks as b
        WHERE bt.block_hash = b.block_hash
            AND reservation_id = ANY ($1)
            AND b.chain_id=$2
            AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
            `
        const result = await this.query(query, [reservations.map(r => r.reservation_id), config.btcChainId, config.btcChainId]);
        if (result.rows.length < 1) return [];
        return result.rows.map(r => ({
            reservation_id: r.reservation_id,
            pay_chain: r.pay_chain,
            pay_txhash: r.pay_txhash,
            pay_block_hash: r.pay_block_hash,
            pay_finality: r.finality
        }));

    }

    protected async getReservationLastStatus(positionId: string, finalityFlag?: boolean): Promise<HistoryRecord[]> {
        const query = `
        SELECT rs.state,
            b.chain_id as receive_chain,
            rs.txhash as receive_txhash,
            rs.block_hash as receive_block_hash,
            finality
        FROM reservation_state_events as rs, blocks as b
        WHERE rs.block_hash = b.block_hash
            AND reservation_id in ('reservation1')
            AND rs.state <> 'PENDING'
            AND b.finality <> 'REVERTED'
            `
        const result = await this.query(query, [positionId]);
        if (result.rows.length < 1) return [];
        return result.rows.map(r => ({
            reservation_id: r.reservation_id,
            state: r.state,
            receive_chain: r.receive_chain,
            receive_txhash: r.receive_txhash,
            receive_block_hash: r.receive_block_hash,
            receive_finality: r.finality
        }));
    }


}
