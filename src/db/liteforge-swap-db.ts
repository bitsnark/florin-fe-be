import { Db } from './db';

export interface LiteforgeSwap {
    l2TxHash: string;
    l2BlockHash: string;
    l2BlockNumber: number;
    userAddress: string;
    ltcAddress: string;
    amount: bigint;
    messageNum: bigint;
    state: string;
}

export class LiteforgeSwapDb extends Db {

    async insert(swap: Omit<LiteforgeSwap, 'state'>): Promise<void> {
        await this.query(`
            INSERT INTO liteforge_swaps
            (l2_tx_hash, l2_block_hash, l2_block_number, user_address, ltc_address, amount, message_num, state)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
            ON CONFLICT (l2_tx_hash, l2_block_hash) DO NOTHING
        `, [
            swap.l2TxHash,
            swap.l2BlockHash,
            swap.l2BlockNumber,
            swap.userAddress.toLowerCase(),
            swap.ltcAddress,
            String(swap.amount),
            String(swap.messageNum),
        ]);
    }

    async getByTxHash(txHash: string): Promise<LiteforgeSwap | null> {
        const result = await this.query(`
            SELECT * FROM liteforge_swaps
            WHERE l2_tx_hash = $1
            LIMIT 1
        `, [txHash]);
        if (result.rows.length === 0) return null;
        const row = result.rows[0];
        return {
            l2TxHash: row.l2_tx_hash,
            l2BlockHash: row.l2_block_hash,
            l2BlockNumber: Number(row.l2_block_number),
            userAddress: row.user_address,
            ltcAddress: row.ltc_address,
            amount: BigInt(row.amount),
            messageNum: BigInt(row.message_num),
            state: row.state,
        };
    }
}
