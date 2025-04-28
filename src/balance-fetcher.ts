import { config } from './common/config';

export class BalanceFetcher {

	constructor() { }

	async getBalances() {
		return {
			btc: { maxSatAmount: config.btcMaxAllowedSatTransfer },
			[config.chainId]: {
				positionId: config.mmPositionId,
				maxSatAmount: config.evmMaxAllowedSatTransfer
			}
		}
	}
}
