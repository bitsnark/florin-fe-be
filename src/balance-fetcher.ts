import { config } from './common/config';
import { ethers } from 'ethers';
import * as AMMExchangeABI from "./abis/AMMExchange.json";


export class BalanceFetcher {
	exchange: ethers.Contract;

	constructor() { }

	static create() {
		const bf = new BalanceFetcher();
		const provider = new ethers.JsonRpcProvider(config.providerUrl);
		bf.exchange = new ethers.Contract(config.contractAddress, AMMExchangeABI.abi, provider);
		return bf;
	}

	private async getBtcAvailable() {
		// Temporery - to be replaced with a real call
		return { available: config.btcMaxAllowedTransfer };
	}

	private async getEvmAvailable() {
		const position = await this.exchange.positions[config.mmPositionId]

		return {
			position: config.mmPositionId,
			available: position.available < config.evmMaxAllowedTransfer ? position.available : config.evmMaxAllowedTransfer
		}
	}

	async getBalances() {
		const btcAvailable = await this.getBtcAvailable();
		const evmAvailable = await this.getEvmAvailable();

		return {
			btc: btcAvailable,
			eth: evmAvailable
		}
	}
}
