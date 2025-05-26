import { config } from '../common/config';
import { connect } from 'ts-postgres';
import { logger } from '../common/logger';

export type DbValue = string | number | boolean | object | null | undefined | bigint;
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
        return await connect({
            user: this.user,
            host: this.host,
            port: this.port,
            password: this.password,
            database: this.database,
            keepAlive: config.postgresKeepAlive,
            bigints: true
        });
    }

    public async query(sql: string, params: any[]) {
        let client;
        try {
            client = await this.connect();
            const result = await client.query(sql, params ?? []);
            const names = result.names;
            const objarray: any[] = [];
            for (let i = 0; i < result.rows.length; i++) {
                const obj: any = {};
                for (let j = 0; j < names.length; j++) {
                    obj[names[j]] = result.rows[i][j];
                }
                objarray.push(obj);
            }
            return { rows: objarray };
        } catch (error) {
            logger.error(`Database query error: ${(error as Error).message} sql: ${sql} params: ${params}`);
            throw error;
        } finally {
            await client.end();
        }
    }

    protected async asTransaction(fn: () => void) {
        const client = await this.connect();
        try {
            await client.query('START');
            await fn();
            await client.query('COMMIT');
        } catch (e) {
            logger.error(`Db asTransaction error ${e}`);
            await client.query('ROLLBACK');
        } finally {
            await client.end();
        }
    }

    protected async runTransaction(queries: Query[]) {
        const client = await this.connect();
        let i = 0;
        try {
            await client.query('BEGIN');

            for (i; i < queries.length; i++) {
                await client.query(queries[i].sql, queries[i].args);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Db runTransaction failed to execute query ${i}: `, (error as { message: string }).message ?? '');
            logger.error(queries[i].sql, queries[i].args);
        } finally {
            await client.end();
        }
    }
}
