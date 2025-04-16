import { Finality, Position, PositionState, Reservation, ReservationState } from '../common/types';
import { Db } from "./db";

function rowToReservation(row: any): Reservation {
    return {
        positionId: row.position_id,
        state: row.state,
        ownerAddress: row.owner_address,
        blockNumber: 0,
        blockHash: '',
        reservationId: '',
        amount: 0n,
        finality: row.finality
    };
}

export class MaterializedReservation extends Db {

    constructor() {
        super();
    }

    async getReservationById(reservationId: string, finalityFlag?: boolean): Promise<Reservation> {
        const query = `
        SELECT * from reservation_created_event, reservation_state_event, blocks
        WHERE
        reservation_created_event.reservation_id = reservation_state_event.reservation_id
        AND position_state_event.block_hash = blocks.block_hash
        AND reservation_id = $1
        AND finality IN $2
        ORDER BY reservation_state_event.event_id DESC LIMIT 1
        `;
        const result = await this.query<any>(query, [
            reservationId,
            finalityFlag ? [Finality.FINAL] : [Finality.FINAL, Finality.UNKNOWN]
        ]);
        if (result.rows.length == 1) return undefined;
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
        FROM reservation_created_events rce
        JOIN reservation_state_events rse ON pce.reservation_id = pse.reservation_id
        JOIN blocks b ON rse.block_hash = b.block_hash
        WHERE b.finality IN $1
        ORDER BY rce.reservation_id, rse.event_id DESC;
        `;
        const result = await this.query<any>(query, [
            finalityFlag ? [Finality.FINAL] : [Finality.FINAL, Finality.UNKNOWN]
        ]);
        return result.rows.map(rowToReservation);
    }

    async getReservationsByState(reservationState: ReservationState, finalityFlag?: boolean): Promise<Reservation[]> {
        const query = `
        SELECT DISTINCT ON (rce.reservation_id)
            rce.*,
            rse.state,
            rse.event_id,
            b.finality,
            b.block_number,
            b.chain_id
        FROM reservation_created_events rce
        JOIN reservation_state_events rse ON pce.reservation_id = pse.reservation_id
        JOIN blocks b ON rse.block_hash = b.block_hash
        WHERE b.finality IN $1
        AND rse.state IN $2
        ORDER BY rce.reservation_id, rse.event_id DESC;
        `;
        const result = await this.query<any>(query, [
            finalityFlag ? [Finality.FINAL] : [Finality.FINAL, Finality.UNKNOWN],
            [reservationState],
        ]);
        return result.rows.map(rowToReservation);
    }

    async getReservationByOwner(ownerAddress: string, finalityFlag?: boolean): Promise<Reservation[]> {
        return (await this.getAllReservations(finalityFlag)).filter(r => r.ownerAddress == ownerAddress);
    }
}
