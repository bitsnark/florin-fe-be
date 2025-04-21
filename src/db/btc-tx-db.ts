import { Block, Finality } from "../common/types";
import { Db } from "./db";


export interface reservationBtcTx {
  txid: string;
  blockHash: string;
  blockHeight: number;
  targetChainId: number;
  reservationId: string;
}
export class BtcTxDb extends Db {

  async insertTx(tx: reservationBtcTx): Promise<void> {
    const query = `
        INSERT INTO blocks (txid, block_hash, block_height, target_chain_id, reservation_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (txid, block_hash) DO NOTHING
      `;
    await this.query(query, [tx.txid, tx.blockHash, tx.blockHeight, tx.targetChainId, tx.reservationId]);
  }

}
