
import { BalanceFetcher } from '../src/balance-fetcher';
import sinon from 'sinon';
import assert from 'node:assert';
import * as configModule from '../src/common/config';

describe('balanceFetcher', () => {
	let fetcher: BalanceFetcher;

	beforeEach(() => {
		sinon.stub(configModule.config, 'evmMaxAllowedSatTransfer').value(1000);
		sinon.stub(configModule.config, 'btcMaxAllowedSatTransfer').value(500);


		// Cast as any to avoid TypeScript complaining
	});

	afterEach(() => {
		sinon.restore();
	});

	it('should return balances', async () => {
		fetcher = new BalanceFetcher();
		const result = await fetcher.getBalances();

		assert.deepStrictEqual(result, {
			btc: { maxSatAmount: 500 },
			[configModule.config.chainId]: {
				positionId: configModule.config.mmPositionId,
				maxSatAmount: 1000
			}
		});
	});

});



