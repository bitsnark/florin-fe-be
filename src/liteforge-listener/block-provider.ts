import { ethers, Filter, Interface, JsonRpcProvider } from "ethers";
import { config } from "../common/config";
import { liteforgeSwapAbi } from "../abis/liteforge-swap";

export interface SwapLog {
    txHash: string;
    blockNumber: number;
    blockHash: string;
    userAddress: string;
    ltcAddress: string;
    amount: bigint;
    messageNum: bigint;
}

export interface IL2BlockProvider {
    getBlockNumber(): Promise<number>;
    getBlockByHeight(height: number): Promise<ethers.Block>;
    getBlockByHash(hash: string): Promise<ethers.Block>;
    getSwapLogsInRange(fromBlock: number, toBlock: number): Promise<SwapLog[]>;
}

export class L2BlockProvider implements IL2BlockProvider {

    provider: JsonRpcProvider;
    swapInterface: Interface;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.liteforgeL2RpcUrl);
        this.swapInterface = new ethers.Interface(liteforgeSwapAbi);
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

    async getSwapLogsInRange(fromBlock: number, toBlock: number): Promise<SwapLog[]> {
        const filter: Filter = {
            fromBlock,
            toBlock,
            address: config.liteforgeSwapAddress,
        };
        const logs = await this.provider.getLogs(filter);
        return logs.map(l => {
            const parsed = this.swapInterface.parseLog(l);
            return {
                txHash: l.transactionHash,
                blockNumber: l.blockNumber,
                blockHash: l.blockHash,
                userAddress: parsed.args[0] as string,
                ltcAddress: parsed.args[1] as string,
                amount: parsed.args[2] as bigint,
                messageNum: parsed.args[3] as bigint,
            };
        });
    }
}
