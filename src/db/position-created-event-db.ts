import { PositionCreatedEvent } from "../common/types";
import { Db } from "./db";

export class PositionCreatedEventDb extends Db {

  async create(event: Exclude<PositionCreatedEvent, 'eventId'>): Promise<void> {
    const query = `
        INSERT INTO position_created_events
        (position_id, chain_id, state, owner_address, token_address, original_amount, bitcoin_address, exchange_rate, block_number, block_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (position_id) DO NOTHING
      `;
    await this.pool.query(query, [
      event.positionId,
      event.chainId,
      event.state,
      event.ownerAddress,
      event.tokenAddress,
      event.originalAmount,
      event.bitcoinAddress,
      event.exchangeRate,
      event.blockNumber,
      event.blockHash
    ]);
  }

  async getByPositionId(positionId: string): Promise<PositionCreatedEvent | null> {
    const query = `SELECT * FROM position_created_events WHERE position_id = $1`;
    const result = await this.pool.query(query, [positionId]);
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      eventId: row.event_id,
      positionId: row.position_id,
      chainId: row.chain_id,
      state: row.state,
      ownerAddress: row.owner_address,
      tokenAddress: row.token_address,
      originalAmount: row.original_amount,
      bitcoinAddress: row.bitcoin_address,
      exchangeRate: row.exchange_rate,
      blockNumber: row.block_number,
      blockHash: row.block_hash
    }
  }
}
