# florin-fe-be

Backend service for the Florin UI. Indexes events from the [AMMExchange](https://github.com/bitsnark/florin/tree/main/packages/contracts) contract on EVM and matches them with Bitcoin/Litecoin payment transactions. Exposes a REST API for querying positions, reservations, and transaction history.

Three independent processes run in parallel:

- **API** — HTTP server for UI queries
- **EVM scanner** — streams AMMExchange contract events into PostgreSQL
- **BTC scanner** — scans Bitcoin/Litecoin blocks for reservation payment transactions

## Setup

```sh
npm install
```

Start a local PostgreSQL instance (Docker):

```sh
npm run postgres
```

Initialize the schema:

```sh
psql -U postgres -d florin_fe_be -f db/schema.sql
```

Copy `sample.env` to `.env` and fill in the values (see [Environment Variables](#environment-variables)).

## Running

Run all three services together:

```sh
npm start
```

Or run each service independently:

```sh
npm run start:evm-scanner
npm run start:btc-scanner
npm run start:server
```

In production, each service is managed by PM2 using the shell scripts `run-api.sh`, `run-evm-scanner.sh`, and `run-btc-scanner.sh`.

## Environment Variables

See `sample.env` for a complete template.

### PostgreSQL

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_HOST` | `localhost` | DB host |
| `POSTGRES_PORT` | `5432` | DB port |
| `POSTGRES_DATABASE` | `florin_fe_be` | DB name |
| `POSTGRES_USER` | `postgres` | DB user |
| `POSTGRES_PASSWORD` | `1234` | DB password |
| `POSTGRES_KEEP_ALIVE` | `false` | Keep TCP connection alive |

### EVM

| Variable | Description |
| --- | --- |
| `PROVIDER_URL` | EVM JSON-RPC endpoint |
| `CHAIN_ID` | EVM chain ID (e.g. `11155111` for Sepolia) |
| `CONTRACT_ADDRESS` | AMMExchange contract address |
| `MM_POSITION_ID` | Market maker position ID (bytes32 hex) |
| `BLOCK_START` | First block to scan (use contract deploy block) |
| `FINALITY_BLOCKS` | Blocks to wait before treating a block as final (e.g. `20`) |
| `LOOP_INTERVAL_MS` | Sleep between scanner cycles (ms) |

### Bitcoin / Litecoin

| Variable | Description |
| --- | --- |
| `BTC_CHAIN_ID` | Chain ID for the BTC chain in the DB (must not collide with EVM chain ID) |
| `BTC_NODE_HOST` | Bitcoin node RPC URL |
| `BTC_NODE_USERNAME` | RPC username |
| `BTC_NODE_PASSWORD` | RPC password |
| `BTC_BLOCK_START` | First block to scan |
| `BTC_FINALITY_BLOCKS` | Blocks to wait before treating a BTC block as final (`1` for testnet, `6` for mainnet) |

### HTTP Server

| Variable | Default | Description |
| --- | --- | --- |
| `HTTP_PORT` | `80` | HTTP listen port |
| `HTTPS_PORT` | `443` | HTTPS listen port |

### Transfer Limits

| Variable | Description |
| --- | --- |
| `BTC_MAX_ALLOWED_TRANSFER` | Max allowed BTC payment in satoshis |
| `EVM_MAX_ALLOWED_TRANSFER` | Max allowed EVM token transfer |

## API

### `GET /history/:address`

Returns all positions and reservations associated with an EVM address, ordered by block number.

### `GET /reservation/:reservationId`

Returns a single reservation by ID (bytes32 hex), including its current state and any associated BTC payment.

### `GET /position/:positionId`

Returns a single position by ID (bytes32 hex), including its current state.

### `GET /btcBlockCount`

Returns the current highest indexed Bitcoin/Litecoin block number.

## Re-deploying Contracts

When redeploying the AMMExchange contract on the same chain:

1. Update `CONTRACT_ADDRESS`, `BLOCK_START`, and `BTC_BLOCK_START` in `.env`
2. Wipe reservation/position data from the DB (blocks can be kept)
3. Restart all services

## Logs

Runtime logs are written to `./data/app.log`. In production, PM2 per-process logs are at `/root/.pm2/logs/`.

## Testing

The live end-to-end test runs the full cross-chain flow against real testnets (Sepolia + LTC testnet via Tatum):

```sh
npx jest tests/live-e2e.test.ts --forceExit
```

Requires a funded LTC testnet UTXO. See the test file for required env vars (`TEST_EVM_PRIVATE_KEY`, `TEST_LTC_PRIVATE_KEY`, `TEST_LTC_UTXO_*`). Allow up to 2 hours — LTC testnet blocks are infrequent.
