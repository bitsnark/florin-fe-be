import Client from 'bitcoin-core';
import { config } from '../common/config';
import { Block, BlockVerbosity } from '../common/bitcoin-core-types';
import { logger } from '../common/logger';
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

    async getBlockCount(): Promise<number> {
        return await this.client.command('getblockcount');
    }

    async getBlockHash(height: number): Promise<string> {
        return await this.client.command('getblockhash', height);
    }

    async getBlock(hash: string, blockVerbosity: BlockVerbosity): Promise<Block> {
        return await this.client.command('getblock', hash, blockVerbosity);
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
