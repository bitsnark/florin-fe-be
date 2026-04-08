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

    /**
     * Convert a bytes32-encoded LTC address to its scriptPubKey hex.
     * P2WPKH (20-byte program, leading zeros): 0014 + last 20 bytes
     * P2TR   (32-byte program, no leading zeros): 5120 + 32 bytes
     */
    private bytes32ToScriptPubKeyHex(bytes32: string): string {
        const hex = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32;
        const trimmed = hex.replace(/^0+/, '');
        if (trimmed.length <= 40) {
            // P2WPKH: 20-byte witness program
            return '0014' + hex.slice(-40);
        }
        // P2TR: 32-byte witness program
        return '5120' + hex;
    }

    async getPendingSwapScripts(): Promise<Map<string, string>> {
        const result = await this.query(`
            SELECT l2_tx_hash, ltc_address FROM liteforge_swaps
            WHERE state = 'ltc_sent'
        `, []);
        const map = new Map<string, string>();
        for (const row of result.rows) {
            const script = this.bytes32ToScriptPubKeyHex(row.ltc_address);
            map.set(script, row.l2_tx_hash);
        }
        return map;
    }

    async updateState(l2TxHash: string, state: string): Promise<void> {
        await this.query(`
            UPDATE liteforge_swaps SET state = $1 WHERE l2_tx_hash = $2
        `, [state, l2TxHash]);
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
