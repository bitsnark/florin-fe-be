import { Block, Finality } from "../common/types";
import { Db } from "./db";

export interface IBlockDb {
  create(block: Block): Promise<void>;
  getByHash(blockHash: string): Promise<Block | null>;
  updateFinality(blockHash: string, finality: Finality);
  getBlocksByFinality(chainId: number, finality: Finality): Promise<Block[]>;
  getHighestFinalBlock(chainId: number): Promise<Block>;
}

export class BlockDb extends Db implements IBlockDb {

  async create(block: Block): Promise<void> {
    const query = `
        INSERT INTO blocks (block_hash, chain_id, block_number, finality)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (block_hash) DO NOTHING
      `;
    await this.query(query, [block.blockHash, block.chainId, block.blockNumber, block.finality]);
  }

  async getByHash(blockHash: string): Promise<Block> {
    const query = `
      SELECT *
      FROM blocks 
      WHERE block_hash = $1
    `;
    const result = await this.query(query, [blockHash]);
    if (result.rows.length < 1) return undefined;
    const row = result.rows[0];
    return {
      blockHash: row.block_hash,
      chainId: row.chain_id,
      blockNumber: row.block_number,
      finality: row.finality
    };
  }

  async updateFinality(blockHash: string, finality: Finality) {
    const query = `
    UPDATE blocks
    SET finality = $2
    WHERE block_hash = $1
  `;
    await this.query(query, [blockHash, finality]);
  }

  async getBlocksByFinality(chainId: number, finality: Finality): Promise<Block[]> {
    const query = `
    SELECT * FROM blocks 
    WHERE finality = $1 AND chain_id = $2
    `;
    const result = await this.query(query, [finality, chainId]);
    return result.rows.map(row => ({
      blockHash: row.block_hash,
      chainId: row.chain_id,
      blockNumber: row.block_number,
      finality: row.finality
    }));
  }

  async getHighestFinalBlock(chainId: number): Promise<Block> {
    const query = `
    SELECT * FROM blocks 
    WHERE finality = $1 AND chain_id = $2
    ORDER BY block_number DESC LIMIT 1
    `;
    const result = await this.query(query, [Finality.FINAL, chainId]);
    if (result.rows.length < 1) return null;
    const row = result.rows[0];
    return { blockHash: row.block_hash, chainId: row.chain_id, blockNumber: row.block_number, finality: row.finality };
  }
}
