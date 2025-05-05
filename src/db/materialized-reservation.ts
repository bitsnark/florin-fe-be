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
        btcAddress: row.bitcoin_address,
        isInscription: row.is_inscription,
        chainId: row.chain_id,
    };
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
}
