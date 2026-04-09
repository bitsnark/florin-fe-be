import { Db } from './db';

export interface UserTransaction {
    txHash: string;
    userAddress: string;
    type: string;
    chainId: number;
    createdAt: Date;
}

export class UserTransactionDb extends Db {

    async insert(txHash: string, userAddress: string, type: string, chainId: number): Promise<void> {
        await this.query(`
            INSERT INTO user_transactions (tx_hash, user_address, type, chain_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (tx_hash) DO NOTHING
        `, [txHash.toLowerCase(), userAddress.toLowerCase(), type, chainId]);
    }

    async getByUser(userAddress: string): Promise<UserTransaction[]> {
        const result = await this.query(`
            SELECT tx_hash, user_address, type, chain_id, created_at
            FROM user_transactions
            WHERE user_address = $1
            ORDER BY created_at DESC
        `, [userAddress.toLowerCase()]);
        return result.rows.map(row => ({
            txHash: row.tx_hash,
            userAddress: row.user_address,
            type: row.type,
            chainId: Number(row.chain_id),
            createdAt: row.created_at,
        }));
    }
}
