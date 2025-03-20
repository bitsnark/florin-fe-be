import { parse } from './env-parser';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.test', '.env.local', '.env'] });

export interface IConfig {

    postgresUser: string;
    postgresHost: string;
    postgresDatabase: string;
    postgresPort: number;
    postgresPassword: string;
    postgresKeepAlive: boolean;

    blockStart: number;
    providerUrl: string;
    chainId: number;
    contractAddress: string;
    finalityBlocks: number;
    loopIntervalMs: number;

    httpPort: number;
    httpsPort: number;
}

export const config: IConfig = {

    postgresUser: parse.string('POSTGRES_USER', 'postgres'),
    postgresHost: parse.string('POSTGRES_HOST', 'localhost'),
    postgresPort: parse.integer('POSTGRES_PORT', 5432),
    postgresDatabase: parse.string('POSTGRES_DATABASE', 'florin_fe_be'),
    postgresPassword: parse.string('POSTGRES_PASSWORD', '1234'),
    postgresKeepAlive: parse.boolean('POSTGRES_KEEP_ALIVE', true),

    blockStart: parse.integer('BLOCK_START', 0),
    providerUrl: parse.string('PROVIDER_URL', 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID'),
    chainId: parse.integer('CHAIN_ID', 20002),
    contractAddress: parse.string('CONTRACT_ADDRESS', '0x000000'),
    finalityBlocks: parse.integer('FINALITY_BLOCKS', 20),
    loopIntervalMs: parse.integer('LOOP_INTERVAL_MS', 1000),

    httpPort: parse.integer('HTTP_PORT', 800),
    httpsPort: parse.integer('HTTPS_PORT', 4430)
}
