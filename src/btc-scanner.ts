import { BlockDb } from './db/block-db';
import { BitcoinNode } from './btc/bitcoin-node';
import { BtcBlockScanner } from './btc/btc_block_scanner';

const scanner = new BtcBlockScanner(new BlockDb(), new BitcoinNode());
scanner.run();
