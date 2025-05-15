import { Db } from "./db";

export interface ReservationBtcTx {
  txid: string;
  blockHash: string;
  blockHeight: number;
  targetChainId: number;
  reservationId: string;
  positionId: string;
  amount: bigint;
}

export class BtcTxDb extends Db {

  async insertTx(tx: ReservationBtcTx): Promise<void> {
    const query = `
        INSERT INTO bitcoin_txs (txid, block_hash, block_height, target_chain_id, reservation_id, position_id,sat_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (txid, block_hash) DO NOTHING
      `;
    await this.query(query, [tx.txid, tx.blockHash, tx.blockHeight, tx.targetChainId, tx.reservationId, tx.positionId, tx.amount]);
  }

}
