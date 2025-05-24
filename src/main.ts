import { time } from 'console';
import { initServer } from './api/index';
import { BlockProvider } from './evm-listener/block-provider';
import { BlockScanner } from './evm-listener/block-scanner';
import { BitcoinNode } from './btc-listener/bitcoin-node';
import { BtcBlockScanner } from './btc-listener/btc-block-scanner';
import { BlockDb } from './db/block-db';
import { EventWriter } from './evm-listener/event-writer';

async function main() {
	try {
		console.log('Starting the HTTP server...');
		initServer();

		const blockDb = new BlockDb();

		// Initialize and run the BlockScanner
		console.log('Starting the BlockScanner...');
		const provider = new BlockProvider();
		const eventWriter = new EventWriter();
		const blockScanner = new BlockScanner(blockDb, provider, eventWriter);
		blockScanner.run();

		// Initialize and run the BtcBlockScanner
		console.log('Starting the BtcBlockScanner...');
		const btcNode = new BitcoinNode();
		const btcBlockScanner = new BtcBlockScanner(blockDb, btcNode);

		btcBlockScanner.run();

		console.log('All processes are running...');
	} catch (error) {
		console.error('Error starting the application:', error);
		process.exit(1); // Exit the process with an error code
	}
}

main();
