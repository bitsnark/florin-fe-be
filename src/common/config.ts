
export interface IConfig {

    dbUrl: string;
    blockStart: number,
    providerUrl: string,
    chainId: number,
    contractAddress: string,
    finalityBlocks: number,
    loopIntervalMs: number
}

export const config: IConfig = {
    dbUrl: process.env.DATABASE_URL || 'postgresql://postgres:1234@localhost:5432/florin_fe_be',
    blockStart: 0,
    providerUrl: process.env.ETH_PROVIDER_URL || 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID',
    chainId: 20002,
    contractAddress: '0x000000',
    finalityBlocks: 20,
    loopIntervalMs: 1000
}
