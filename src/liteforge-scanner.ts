import { BlockDb } from './db/block-db';
import { L2BlockProvider } from './liteforge-listener/block-provider';
import { LiteforgeSwapDb } from './db/liteforge-swap-db';
import { LiteforgeBlockScanner } from './liteforge-listener/block-scanner';

const scanner = new LiteforgeBlockScanner(new BlockDb(), new L2BlockProvider(), new LiteforgeSwapDb());
scanner.run();
