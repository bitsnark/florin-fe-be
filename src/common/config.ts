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
}

export const config: IConfig = {

    postgresUser: parse.string('POSTGRES_USER', 'postgres'),
    postgresHost: parse.string('POSTGRES_HOST', 'localhost'),
    postgresPort: parse.integer('POSTGRES_PORT', 5432),
    postgresDatabase: parse.string('POSTGRES_DATABASE', 'florin_fe_be'),
    postgresPassword: parse.string('POSTGRES_PASSWORD', '1234'),
    postgresKeepAlive: parse.boolean('POSTGRES_KEEP_ALIVE', true),

    blockStart: 0,
    providerUrl: process.env.ETH_PROVIDER_URL || 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID',
    chainId: 20002,
    contractAddress: '0x000000',
    finalityBlocks: 20,
    loopIntervalMs: 1000
}
