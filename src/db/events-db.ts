import { PositionCreatedEvent, PositionStateEvent, ReservationCreatedEvent, ReservationStateEvent } from "../common/types";
import { Db } from "./db";

export class EventsDb extends Db {

  async positionCreated(event: Exclude<PositionCreatedEvent, 'eventId'>): Promise<number> {
    const query = `
            INSERT INTO position_created_events
            (position_id, chain_id, owner_address, token_address, original_amount, bitcoin_address, exchange_rate, block_number, block_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (position_id) DO NOTHING
            RETURNING event_id
          `;
    const result = await this.query(query, [
      event.positionId,
      event.chainId,
      event.ownerAddress,
      event.tokenAddress,
      event.originalAmount,
      event.bitcoinAddress,
      event.exchangeRate,
      event.blockNumber,
      event.blockHash
    ]);
    return result.rows[0];
  }

  async positionStateChanged(event: Exclude<PositionStateEvent, 'eventId'>): Promise<number> {
    const query = `
        INSERT INTO position_state_events
        (position_id, state, block_number, block_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING event_id
      `;
    const result = await this.query(query, [
      event.positionId,
      event.state,
      event.blockNumber,
      event.blockHash,
    ]);
    return result.rows[0];
  }

  async reservationCreated(event: Exclude<ReservationCreatedEvent, 'eventId'>): Promise<number> {
    const query = `
      INSERT INTO reservation_created_events
      (reservation_id, owner_address, position_id, amount, block_number, block_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (reservation_id) DO NOTHING
      RETURNING event_id
    `;
    const result = await this.query(query, [
      event.reservationId,
      event.ownerAddress,
      event.positionId,
      String(event.amount),
      event.blockNumber,
      event.blockHash,
    ]);
    return result.rows[0];
  }

  async reservationStateChanged(event: Exclude<ReservationStateEvent, 'eventId'>): Promise<number> {
    const query = `
    INSERT INTO reservation_state_events
    (reservation_id, state, block_number, block_hash)
    VALUES ($1, $2, $3, $4)
    RETURNING event_id
  `;
    const result = await this.query(query, [
      event.reservationId,
      event.state,
      event.blockNumber,
      event.blockHash,
    ]);
    return result.rows[0];
  }
}