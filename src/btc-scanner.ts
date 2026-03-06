import { BlockDb } from './db/block-db';
import { BitcoinNode } from './btc-listener/bitcoin-node';
import { BtcBlockScanner } from './btc-listener/btc-block-scanner';

const scanner = new BtcBlockScanner(new BlockDb(), new BitcoinNode());
scanner.run();
