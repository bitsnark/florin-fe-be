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

const liteforgeAbi = [
    "event Bridged(address indexed l2Recipient, uint256 amount, uint256 messageNum)"
];

export class BlockProvider implements IBlockProvider {

    provider: JsonRpcProvider;
    contractInterface: Interface;
    liteforgeInterface: Interface;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.providerUrl);
        this.contractInterface = new ethers.Interface(exchangeAbi);
        this.liteforgeInterface = new ethers.Interface(liteforgeAbi);
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
        const exchangeFilter: Filter = {
            fromBlock,
            toBlock,
            address: config.contractAddress,
        };
        const exchangeLogs = await this.provider.getLogs(exchangeFilter);
        const result: LogDescriptionWithTxhash[] = exchangeLogs.map(l => ({
            ...this.contractInterface.parseLog(l),
            txhash: l.transactionHash,
            blockNumber: l.blockNumber,
            blockHash: l.blockHash
        }));

        if (config.liteforgeDepositorAddress) {
            const liteforgeFilter: Filter = {
                fromBlock,
                toBlock,
                address: config.liteforgeDepositorAddress,
            };
            const liteforgeLogs = await this.provider.getLogs(liteforgeFilter);
            for (const l of liteforgeLogs) {
                result.push({
                    ...this.liteforgeInterface.parseLog(l),
                    txhash: l.transactionHash,
                    blockNumber: l.blockNumber,
                    blockHash: l.blockHash
                });
            }
        }

        return result;
    }
}
