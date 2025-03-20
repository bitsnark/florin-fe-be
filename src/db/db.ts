import { config } from '../common/config';
import { Client } from 'pg';

export type DbValue = string | number | boolean | object | null | undefined;
export type QueryArgs = DbValue[];
export interface Query {
    sql: string;
    args: QueryArgs;
}

export class Db {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;

    constructor() {
        this.host = config.postgresHost;
        this.port = Number(config.postgresPort);
        this.user = config.postgresUser;
        this.password = config.postgresPassword;
        this.database = config.postgresDatabase;
    }

    protected async connect() {
        return new Client({
            user: this.user,
            host: this.host,
            port: this.port,
            password: this.password,
            database: this.database,
            keepAlive: config.postgresKeepAlive
        });
    }

    public async query<Row>(sql: string, params: QueryArgs, _client?: Client) {
        const client = _client ? _client : await this.connect();
        try {
            await client.connect();
            return await client.query<Row>(sql, params ?? []);
        } catch (error) {
            console.error(error);
            console.error('SQL: ', sql);
            console.error('params: ', params);
            throw error;
        } finally {
            if (!_client) await client.end();
        }
    }

    protected async asTransaction(fn: () => void) {
        const client = await this.connect();
        try {
            await client.query('START');
            await fn();
            await client.query('COMMIT');
        } catch (e) {
            console.error(e);
            await client.query('ROLLBACK');
        } finally {
            await client.end();
        }
    }
}
