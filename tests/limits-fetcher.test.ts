
import { BalanceFetcher } from '../src/balance-fetcher';
import sinon from 'sinon';
import assert from 'node:assert';
import * as configModule from '../src/common/config';
import { ethers } from 'ethers';

describe('balanceFetcher', () => {
	let fetcher: BalanceFetcher;

	beforeEach(() => {
		sinon.stub(configModule.config, 'providerUrl').value('http://localhost:8545');
		sinon.stub(configModule.config, 'contractAddress').value('0xMockContractAddress');
		sinon.stub(configModule.config, 'mmPositionId').value('1');
		sinon.stub(configModule.config, 'evmMaxAllowedTransfer').value(1000);
		sinon.stub(configModule.config, 'btcMaxAllowedTransfer').value(500);

		sinon.stub(ethers, 'JsonRpcProvider').callsFake(() => {
			return {};
		});

		sinon.stub(ethers, 'Contract').callsFake(() => {
			return {};
		});

		fetcher = new BalanceFetcher();

		// Overwrite exchange with a fake one
		fetcher.exchange = {
			positions: {
				'1': {
					available: 500
				}
			}
		} as any; // Cast as any to avoid TypeScript complaining
	});

	afterEach(() => {
		sinon.restore();
	});

	it('should return balances', async () => {
		const result = await fetcher.getBalances();

		assert.deepStrictEqual(result, {
			btc: { available: 500 },
			eth: {
				position: '1',
				available: 500
			}
		});
	});

	it('should return position max allowed even if more is available', async () => {
		sinon.stub(configModule.config, 'evmMaxAllowedTransfer').value(100);
		const result = await fetcher.getBalances();

		assert.deepStrictEqual(result, {
			btc: { available: 500 },
			eth: {
				position: '1',
				available: 100
			}
		});
	});
});



