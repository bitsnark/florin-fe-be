import { ReservationStateEvent } from "../common/types";
import { Db } from "./db";

export class ReservationStateEventDb extends Db {

    async create(event: Exclude<ReservationStateEvent, 'eventId'>): Promise<number> {
        const query = `
        INSERT INTO reservation_state_events
        (reservation_id, state, block_number, block_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING event_id
      `;
        const result = await this.pool.query(query, [
            event.reservationId,
            event.state,
            event.blockNumber,
            event.blockHash,
        ]);
        const eventId = result.rows[0].event_id;
        return eventId;
    }

    async getById(eventId: number): Promise<ReservationStateEvent | null> {
        const query = `SELECT * FROM reservation_state_events WHERE event_id = $1`;
        const result = await this.pool.query(query, [eventId]);
        if (result.rowCount === 0) return null;
        const row = result.rows[0];
        return {
            eventId: row.event_id,
            reservationId: row.reservation_id,
            state: row.state,
            blockNumber: row.block_number,
            blockHash: row.block_hash
        };
    }
}
