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

    mmPositionId: string;
    blockStart: number;
    providerUrl: string;
    chainId: number;
    contractAddress: string;
    openPositionInListenerUrl: string;
    finalityBlocks: number;
    loopIntervalMs: number;
    throttleInterval: number;
    retriesOnFail: number;

    btcChainId: number,
    btcBlockStart: number,
    btcFinalityBlocks: number;
    btcNodeUsername: string,
    btcNodePassword: string,
    btcNodeHost: string,

    httpPort: number;
}

export const config: IConfig = {

    postgresUser: parse.string('POSTGRES_USER', 'postgres'),
    postgresHost: parse.string('POSTGRES_HOST', 'localhost'),
    postgresPort: parse.integer('POSTGRES_PORT', 5432),
    postgresDatabase: parse.string('POSTGRES_DATABASE', 'florin_fe_be'),
    postgresPassword: parse.string('POSTGRES_PASSWORD', '1234'),
    postgresKeepAlive: parse.boolean('POSTGRES_KEEP_ALIVE', true),

    mmPositionId: parse.string('MM_POSITION_ID', '1745750236411                                                     '),
    blockStart: parse.integer('BLOCK_START', 0),
    providerUrl: parse.string('PROVIDER_URL', 'http://localhost:8545'),
    chainId: parse.integer('CHAIN_ID', 31337),
    contractAddress: parse.string('CONTRACT_ADDRESS', '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707'),
    openPositionInListenerUrl: parse.string('OPEN_POSITION_IN_LISTENER_URL', 'http://localhost:3000/open-position'),
    finalityBlocks: parse.integer('FINALITY_BLOCKS', 20),
    loopIntervalMs: parse.integer('LOOP_INTERVAL_MS', 1000),
    throttleInterval: parse.integer('THROTTLE_INTERVAL', 300),
    retriesOnFail: parse.integer('RETRIES_ON_FAIL', 2),

    btcChainId: parse.integer('BTC_CHAIN_ID', -1),
    btcBlockStart: parse.integer('BTC_BLOCK_START', 0),
    btcFinalityBlocks: parse.integer('BTC_FINALITY_BLOCKS', 6),
    btcNodeUsername: parse.string('BTC_NODE_USERNAME', ''),
    btcNodePassword: parse.string('BTC_NODE_PASSWORD', ''),
    btcNodeHost: parse.string('BTC_NODE_HOST', ''),

    httpPort: parse.integer('HTTP_PORT', 800),
}
