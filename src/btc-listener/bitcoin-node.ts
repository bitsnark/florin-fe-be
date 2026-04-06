import Client from 'bitcoin-core';
import { config } from '../common/config';
import { Block, BlockVerbosity } from '../common/bitcoin-core-types';
import { logger } from '../common/logger';

const REQUEST_TIMEOUT_MS = 20000;

export class BitcoinNode {
    public client;

    constructor() {
        this.client = new Client({
            username: config.btcNodeUsername,
            password: config.btcNodePassword,
            host: config.btcNodeHost
        });
        logger.info('client connect:', this.client.host);
    }

    private withTimeout<T>(promise: Promise<T>): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`BTC node request timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS)
            )
        ]);
    }

    async getBlockCount(): Promise<number> {
        return this.withTimeout(this.client.command('getblockcount'));
    }

    async getBlockHash(height: number): Promise<string> {
        return this.withTimeout(this.client.command('getblockhash', height));
    }

    async getBlock(hash: string, blockVerbosity: BlockVerbosity): Promise<Block> {
        return this.withTimeout(this.client.command('getblock', hash, blockVerbosity));
    }



}

async function main() {
    const node = new BitcoinNode();
    const height = await node.getBlockCount();
    const hash = await node.getBlockHash(height);
    console.log('Last block:', height, hash);
}

if (require.main === module) {
    main();
}
