import { ethers, Filter, Interface, JsonRpcProvider } from "ethers";
import { config } from "../common/config";
import { exchangeAbi } from "../abis/exchange";

export interface LogDescriptionWithTxhash extends ethers.LogDescription {
    txhash: string;
    blockNumber: number;
    blockHash: string;
}

export interface IBlockProvider {
    getBlockNumber(): Promise<number>;
    getBlockByHeight(height: number): Promise<ethers.Block>;
    getBlockByHash(hash: string): Promise<ethers.Block>;
    getParsedLogsInRange(fromBlock: number, toBlock: number): Promise<LogDescriptionWithTxhash[]>;
}

export class BlockProvider implements IBlockProvider {

    provider: JsonRpcProvider;
    contractInterface: Interface;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.providerUrl);
        this.contractInterface = new ethers.Interface(exchangeAbi);
    }

    getBlockNumber(): Promise<number> {
        return this.provider.getBlockNumber();
    }

    getBlockByHeight(height: number): Promise<ethers.Block> {
        return this.provider.getBlock(height);
    }

    getBlockByHash(hash: string): Promise<ethers.Block> {
        return this.provider.getBlock(hash);
    }

    async getParsedLogsInRange(fromBlock: number, toBlock: number): Promise<LogDescriptionWithTxhash[]> {
        const filter: Filter = {
            fromBlock,
            toBlock,
            address: config.contractAddress,
        };
        const logs = await this.provider.getLogs(filter);
        return logs.map(l => ({
            ...this.contractInterface.parseLog(l),
            txhash: l.transactionHash,
            blockNumber: l.blockNumber,
            blockHash: l.blockHash
        }));
    }
}
