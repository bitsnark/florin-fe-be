import { convertBytes32ToP2TRAddress } from '../common/bech32';
import { config } from '../common/config';
import { Finality, Position, PositionState, Reservation, ReservationState } from '../common/types';
import { Db } from "./db";

function rowToReservation(row: any): Reservation {
    return {
        positionId: row.position_id,
        state: row.state,
        ownerAddress: row.owner_address,
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        reservationId: row.reservation_id,
        amount: row.amount,
        finality: row.finality,
        txhash: row.txhash,
        btcAddress: row.bitcoin_address, // format?
        isInscription: row.is_inscription,
        chainId: row.chain_id,
    };
}

export interface OpenReservation {
    reservationId: string,
    bitcoinAddress: string,
    amount: bigint,
    isInscription: boolean,
    txid: string,
    positionId: string
}


export class MaterializedReservation extends Db {

    constructor() {
        super();
    }

    async getReservationById(reservationId: string, finalityFlag?: boolean): Promise<Reservation> {
        const query = `
        SELECT * from reservation_created_events, reservation_state_events, blocks
        WHERE
        reservation_created_events.reservation_id = reservation_state_events.reservation_id
        AND
            ( reservation_created_events.block_hash = blocks.block_hash OR
             reservation_state_events.block_hash = blocks.block_hash )
        AND reservation_created_events.reservation_id = $1
        AND ${finalityFlag ? "blocks.finality = 'FINAL'" : "blocks.finality <> 'REVERTED'"}
        ORDER BY reservation_state_events.event_id DESC LIMIT 1
        `;
        const result = await this.query(query, [reservationId]);
        if (result.rows.length != 1) return undefined;
        return rowToReservation(result.rows[0]);
    }

    async getAllReservations(finalityFlag?: boolean): Promise<Reservation[]> {
        const query = `
        SELECT DISTINCT ON (rce.reservation_id)
            rce.*,
            rse.state,
            rse.event_id,
            b.finality,
            b.block_number,
            b.chain_id
        FROM reservation_created_events rce, reservation_state_events rse, blocks b
        WHERE
        rce.reservation_id = rse.reservation_id
        AND rse.block_hash = b.block_hash
        AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
        ORDER BY rce.reservation_id, rse.event_id DESC;
        `;
        const result = await this.query(query, []);
        return result.rows.map(rowToReservation);
    }

    async getReservationsByState(reservationState: ReservationState, finalityFlag?: boolean): Promise<Reservation[]> {
        return (await this.getAllReservations(finalityFlag)).filter(r => r.state == reservationState);
    }

    async getReservationByOwner(ownerAddress: string, finalityFlag?: boolean): Promise<Reservation[]> {
        return (await this.getAllReservations(finalityFlag)).filter(r => r.ownerAddress == ownerAddress);
    }

    async getUnfulfilledReservations(): Promise<OpenReservation[]> {
        const query = `
        SELECT DISTINCT ON (rce.reservation_id)
            rce.reservation_id,
			rce.bitcoin_address,
			rce.amount,
			rce.is_inscription,
            rce.position_id,
			btc.txid
        FROM reservation_created_events rce
		inner join blocks br
		ON rce.block_hash = br.block_hash
		left outer join
		(select bb.finality btc_finality,
            bb.block_number,
            bb.chain_id,
		txid,
		reservation_id
		from bitcoin_txs bt  , blocks bb
        where bt.block_hash = bb.block_hash) as btc
		ON rce.reservation_id = btc.reservation_id
        WHERE br.chain_id =$1
        AND btc_finality <> 'REVERTED' OR btc_finality IS NULL
	    AND br.finality <> 'REVERTED'
        ORDER BY rce.reservation_id DESC;`
        const result = await this.query(query, [config.chainId]);
        return result.rows.map(row => ({
            reservationId: row.reservation_id,
            bitcoinAddress: convertBytes32ToP2TRAddress(row.bitcoin_address),
            amount: row.amount,
            isInscription: row.is_inscription,
            txid: row.txid,
            positionId: row.position_id
        }));
    }
}
