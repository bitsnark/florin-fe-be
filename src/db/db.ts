import { Pool } from 'pg';
import { config } from '../common/config';

export class Db {
    pool: Pool;

    constructor(url?: string) {
        this.pool = new Pool({
            connectionString: url ?? config.dbUrl,
            allowExitOnIdle: true
        });
    }
}
