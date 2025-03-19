import { Block, Finality } from "../common/types";
import { Db } from "./db";

export class BlockDb extends Db {

  async create(block: Block): Promise<void> {
    const query = `
        INSERT INTO blocks (block_hash, block_number, finality)
        VALUES ($1, $2, $3)
        ON CONFLICT (block_hash) DO NOTHING
      `;
    await this.pool.query(query, [block.blockHash, block.blockNumber, block.finality]);
    this.pool
  }

  async getByHash(blockHash: string): Promise<Block | null> {
    const query = `SELECT * FROM blocks WHERE block_hash = $1`;
    const result = await this.pool.query(query, [blockHash]);
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return { blockHash: row.block_hash, blockNumber: row.block_number, finality: row.finality };
  }

  async updateFinality(blockHash: string, finality: Finality) {
    const query = `
    UPDATE blocks
    SET finality = $2
    WHERE block_hash = $1
  `;
    await this.pool.query(query, [blockHash, finality]);
  }

  async getNonFinalBlocks(): Promise<Block[]> {
    const query = `SELECT * FROM blocks WHERE finality = $1`;
    const result = await this.pool.query(query, [Finality.UNKNOWN]);
    return result.rows.map(row => ({
      blockHash: row.block_hash,
      blockNumber: row.block_number,
      finality: row.finality
    }));
  }

  async getHighestFinalBlock(): Promise<Block> {
    const query = `SELECT * FROM blocks WHERE finality = $1 ORDER BY block_number DESC LIMIT 1`;
    const result = await this.pool.query(query, [Finality.FINAL]);
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return { blockHash: row.block_hash, blockNumber: row.block_number, finality: row.finality };
  }
}
