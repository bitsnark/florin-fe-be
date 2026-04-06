# Architecture

## Overview

florin-fe-be is a read-only indexer and API for the Florin cross-chain exchange. It watches two chains simultaneously — an EVM chain (e.g. Sepolia) and a Bitcoin-compatible chain (e.g. Litecoin) — and stores a unified view of all exchange activity in PostgreSQL.

The system consists of three independent processes:

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│   EVM Scanner   │    │   BTC Scanner    │    │      API       │
│                 │    │                  │    │                │
│  Polls EVM RPC  │    │  Polls BTC node  │    │  Express HTTP  │
│  Parses events  │    │  Matches txs to  │    │  Serves UI     │
│  Writes to DB   │    │  reservations    │    │  queries       │
└────────┬────────┘    └────────┬─────────┘    └───────┬────────┘
         │                      │                       │
         └──────────────────────┴───────────────────────┘
                                │
                       ┌────────▼────────┐
                       │   PostgreSQL    │
                       └─────────────────┘
```

## Process: EVM Scanner

Entry point: `src/evm-scanner.ts` → `src/evm-listener/block-scanner.ts`

**Responsibilities:**
- Scans EVM blocks from `BLOCK_START` (or the last recorded block in DB) to the chain tip
- Fetches contract event logs for `AMMExchange` in batches of 500 blocks
- Decodes four event types: `PositionCreated`, `PositionStateChanged`, `ReservationCreated`, `ReservationStateChanged`
- Writes decoded events to PostgreSQL
- Tracks finality: a block is marked `FINAL` once `FINALITY_BLOCKS` subsequent blocks have been seen

**Key files:**
- `src/evm-listener/block-scanner.ts` — main scan loop, batch fetching, finality logic
- `src/evm-listener/block-provider.ts` — ethers.js wrapper: fetches blocks and filters logs
- `src/evm-listener/event-writer.ts` — decodes ABI-encoded events and inserts into DB

## Process: BTC Scanner

Entry point: `src/btc-scanner.ts` → `src/btc-listener/btc-block-scanner.ts`

**Responsibilities:**
- Scans Bitcoin/Litecoin blocks from `BTC_BLOCK_START` (or last recorded block) to chain tip
- For each block, checks whether any transaction outputs match a pending reservation address
- Supports two matching modes: by P2TR/P2WPKH address, and by inscription ID
- Records matched payment transactions in the `bitcoin_txs` table
- Respects an EVM timestamp safety margin: only scans BTC blocks whose timestamp is safely below the latest finalized EVM block timestamp, ensuring cross-chain ordering consistency

**Key files:**
- `src/btc-listener/btc-block-scanner.ts` — main scan loop, finality, timestamp gating
- `src/btc-listener/btc-tx-finder.ts` — fetches pending reservations, matches BTC outputs
- `src/btc-listener/bitcoin-node.ts` — Bitcoin JSON-RPC wrapper

**Address matching:**
Reservation bitcoin addresses are stored in the DB as bytes32 hex (encoded from the scriptPubKey). The BTC scanner decodes these back to scriptPubKey hex and compares against each transaction output's `scriptPubKey.hex` field directly — this is necessary because some node providers (e.g. Tatum) do not return the `address` field in block responses.

## Process: API

Entry point: `src/api/index.ts`

A simple Express HTTP server. All endpoints are read-only queries against the materialized views in PostgreSQL. Responses use a custom JSON serializer that handles `BigInt` values.

**Endpoints:**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/history/:address` | All positions and reservations for an EVM address |
| GET | `/reservation/:reservationId` | Single reservation with state and BTC payment info |
| GET | `/position/:positionId` | Single position with current state |
| GET | `/btcBlockCount` | Highest indexed BTC block number |

## Database Schema

All data lives in a single PostgreSQL database. The schema is in `db/schema.sql`.

### Core Tables

**`blocks`** — Every EVM and BTC block seen by the scanners, with finality status.

```
block_hash   (PK)
chain_id
block_number
finality     — "UNFINALIZED" | "FINAL"
block_timestamp
```

**`position_created_events`** — One row per `PositionCreated` EVM event.

```
position_id  (unique)
owner_address, token_address, bitcoin_address
original_amount, exchange_rate
partial_settlement
block_hash, block_number, chain_id, txhash
```

**`position_state_events`** — One row per `PositionStateChanged` EVM event.

```
position_id, state, txhash, block_hash, block_number
```

**`reservation_created_events`** — One row per `ReservationCreated` EVM event.

```
reservation_id (unique)
owner_address, position_id, bitcoin_address
amount, is_inscription
block_hash, block_number, chain_id, txhash
```

**`reservation_state_events`** — One row per `ReservationStateChanged` EVM event.

```
reservation_id, state, txhash, block_hash, block_number
```

**`bitcoin_txs`** — BTC transactions matched to reservations.

```
txid, block_hash  (composite PK)
block_height, target_chain_id
reservation_id, position_id
sat_amount, timestamp
```

**`liteforge_bridge_events`** / **`liteforge_reserved_events`** — Supplemental tables for the Liteforge bridge flow, tracking L2 recipient addresses for reservations made through the LiteforgeDepositor contract.

### Materialized Views (query layer)

The `src/db/materialized-*.ts` files join the raw event tables to produce the API response shapes:

- `materialized-position.ts` — joins `position_created_events` + latest `position_state_events`
- `materialized-reservation.ts` — joins `reservation_created_events` + latest `reservation_state_events` + `bitcoin_txs`
- `materialized-history.ts` — combines positions and reservations for a given owner address

All queries filter by finality: only blocks marked `FINAL` are included in API responses.

## Finality Model

Both scanners track finality independently using the `blocks` table.

- **EVM**: a block is `FINAL` once `FINALITY_BLOCKS` newer blocks have been recorded for that chain.
- **BTC**: a block is `FINAL` once `BTC_FINALITY_BLOCKS` newer blocks have been recorded.

The BTC scanner additionally gates on EVM block timestamps — it only processes BTC blocks with a timestamp earlier than `(latest EVM finalized block timestamp - EVM_TIMESTAMP_SAFETY_MARGIN_SEC)`. This prevents the BTC scanner from getting ahead of the EVM scanner in wall-clock time.

## Configuration

`src/common/config.ts` loads environment variables via `dotenv`, with priority order: `.env.test` → `.env.local` → `.env` (first definition wins). This means `.env.test` can override production values for local testing without modifying `.env`.

## Production Deployment

Three PM2 services run as `root` on the GCP instance, started with env vars sourced from `.env`:

```
api           — HTTP server (port 80)
evm-scanner   — EVM block scanner
btc-scanner   — BTC block scanner
```

See `CLAUDE.md` for deployment procedures.
