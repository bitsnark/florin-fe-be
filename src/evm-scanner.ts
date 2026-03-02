import { BlockDb } from './db/block-db';
import { BlockProvider } from './block-provider';
import { EventWriter } from './event-writer';
import { BlockScanner } from './block-scanner';

const scanner = new BlockScanner(new BlockDb(), new BlockProvider(), new EventWriter());
scanner.run();
