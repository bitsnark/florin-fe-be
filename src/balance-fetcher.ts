import { config } from './common/config';
import { ethers } from 'ethers';
import * as AMMExchangeABI from "./abis/AMMExchange.json";


export async function getBalances() {
	const btcAvailable = await checkBtcAvilable();
	const evmAvailable = await checkEvmAvailable();

	return {
		btc: btcAvailable,
		eth: evmAvailable
	}
}

async function checkBtcAvilable() {
	// Temporery - to be replaced with a real call
	return { available: config.btcMaxAllowedTransfer };
}

async function checkEvmAvailable() {
	// Temporery - to be replaced with a real call
	//return config.btcMaxAllowedTransfer;

	const provider = new ethers.JsonRpcProvider(config.providerUrl);
	const exchange = new ethers.Contract(config.contractAddress, AMMExchangeABI, provider);

	const position = await exchange.positions[config.mmPositionId]

	return {
		position: config.mmPositionId,
		available: position.available < config.evmMaxAllowedTransfer ? position.available : config.evmMaxAllowedTransfer
	}
}
