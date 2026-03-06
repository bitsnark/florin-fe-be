import { BlockDb } from './db/block-db';
import { BlockProvider } from './evm-listener/block-provider';
import { EventWriter } from './evm-listener/event-writer';
import { BlockScanner } from './evm-listener/block-scanner';

const scanner = new BlockScanner(new BlockDb(), new BlockProvider(), new EventWriter());
scanner.run();
