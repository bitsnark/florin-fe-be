import { ReservationCreatedEvent } from "../common/types";
import { Db } from "./db";

export class ReservationCreatedEventDb extends Db {

    async create(event: Exclude<ReservationCreatedEvent, 'eventId'>): Promise<void> {
        const query = `
        INSERT INTO reservation_created_events
        (reservation_id, owner_address, state, position_id, amount, state_block, block_number, block_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (reservation_id) DO NOTHING
      `;
        await this.pool.query(query, [
            event.eventId,
            event.reservationId,
            event.ownerAddress,
            event.state,
            event.positionId,
            event.amount,
            event.blockNumber,
            event.blockHash,
        ]);
    }

    async getById(reservationId: string): Promise<ReservationCreatedEvent | null> {
        const query = `SELECT * FROM reservation_created_events WHERE reservation_id = $1`;
        const result = await this.pool.query(query, [reservationId]);
        if (result.rowCount === 0) return null;
        const row = result.rows[0];
        return {
            eventId: row.event_id,
            reservationId: row.reservation_id,
            ownerAddress: row.owner_address,
            state: row.state,
            positionId: row.position_id,
            amount: row.amount,
            blockNumber: row.block_number,
            blockHash: row.block_hash
        };
    }
}