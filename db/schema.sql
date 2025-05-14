-- Drop existing tables if they exist (order matters due to foreign keys)
DROP TABLE IF EXISTS reservation_state_events;
DROP TABLE IF EXISTS reservation_created_events;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS position_state_events;
DROP TABLE IF EXISTS position_created_events;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS blocks;
DROP TABLE IF EXISTS bitcoin_txs;

-- ============================
-- Table for Blocks
-- ============================
CREATE TABLE blocks (
    block_hash CHARACTER VARYING PRIMARY KEY,  -- Unique id, hex string (32 bytes with 0x prefix)
    chain_id INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    finality TEXT NOT NULL,
    block_timestamp CHARACTER VARYING NOT NULL
);

CREATE INDEX idx_blocks_chain_id ON blocks (chain_id);
CREATE INDEX idx_blocks_block_number ON blocks (block_number);
CREATE INDEX idx_blocks_finality ON blocks (finality);
CREATE INDEX idx_blocks_block_timestamp ON blocks (block_timestamp);


-- ============================
-- Table for PositionCreatedEvents
-- (extends EventBase and Position)
-- ============================
CREATE TABLE position_created_events (
    event_id SERIAL PRIMARY KEY,
    position_id CHARACTER VARYING NOT NULL UNIQUE,      -- Unique identifier for this position
    chain_id INTEGER NOT NULL,
    txhash CHARACTER VARYING NOT NULL,               -- Transaction ID
    owner_address CHARACTER VARYING NOT NULL,
    token_address CHARACTER VARYING NOT NULL,
    original_amount BIGINT NOT NULL,
    bitcoin_address CHARACTER VARYING NOT NULL,
    exchange_rate BIGINT NOT NULL,
    partial_settlement BOOLEAN NOT NULL,
    block_number INTEGER NOT NULL,         -- from EventBase
    block_hash CHARACTER VARYING NOT NULL           -- from EventBase
);

CREATE INDEX idx_position_created_events_owner_address ON position_created_events (owner_address);
CREATE INDEX idx_position_created_events_chain_id ON position_created_events (chain_id);
CREATE INDEX idx_position_created_events_block_number ON position_created_events (block_number);
CREATE INDEX idx_position_created_events_block_hash ON position_created_events (block_hash);
CREATE INDEX idx_position_created_events_position_id ON position_created_events (position_id);
CREATE INDEX idx_position_created_events_partial_settlement ON position_created_events (partial_settlement);

-- ============================
-- Table for PositionStateEvents
-- (extends EventBase and includes only positionId and state)
-- ============================
CREATE TABLE position_state_events (
    event_id SERIAL PRIMARY KEY,
    txhash CHARACTER VARYING NOT NULL,               -- Transaction ID
    position_id CHARACTER VARYING NOT NULL,
    state TEXT NOT NULL,
    block_number INTEGER NOT NULL,         -- from EventBase
    block_hash CHARACTER VARYING NOT NULL,           -- from EventBase
    UNIQUE (position_id, state, txhash)
);


CREATE INDEX idx_position_state_events_position_id ON position_state_events (position_id);
CREATE INDEX idx_position_state_events_state ON position_state_events (state);
CREATE INDEX idx_position_state_events_block_number ON position_state_events (block_number);
CREATE INDEX idx_position_state_events_block_hash ON position_state_events (block_hash);

-- ============================
-- Table for ReservationCreatedEvents
-- (extends EventBase and Reservation)
-- ============================
CREATE TABLE reservation_created_events (
    event_id SERIAL PRIMARY KEY,
    txhash CHARACTER VARYING NOT NULL,               -- Transaction ID
    reservation_id CHARACTER VARYING NOT NULL UNIQUE,
    owner_address CHARACTER VARYING NOT NULL,
    position_id CHARACTER VARYING NOT NULL,
    bitcoin_address CHARACTER VARYING NOT NULL,
    amount BIGINT NOT NULL,
    is_inscription BOOLEAN NOT NULL,
    block_number INTEGER NOT NULL,         -- from EventBase
    block_hash CHARACTER VARYING NOT NULL            -- from EventBase
);

CREATE INDEX idx_reservation_created_events_owner_address ON reservation_created_events (owner_address);
CREATE INDEX idx_reservation_created_events_position_id ON reservation_created_events (position_id);
CREATE INDEX idx_reservation_created_events_block_number ON reservation_created_events (block_number);
CREATE INDEX idx_reservation_created_events_block_hash ON reservation_created_events (block_hash);
CREATE INDEX idx_reservation_created_events_reservation_id ON reservation_created_events (reservation_id);
CREATE INDEX idx_reservation_created_events_is_inscription ON reservation_created_events (is_inscription);

-- ============================
-- Table for ReservationStateEvents
-- (extends EventBase and includes only reservationId and state)
-- ============================
CREATE TABLE reservation_state_events (
    event_id SERIAL PRIMARY KEY,
    txhash CHARACTER VARYING NOT NULL,               -- Transaction ID
    reservation_id CHARACTER VARYING NOT NULL,
    state TEXT NOT NULL,
    block_number INTEGER NOT NULL,         -- from EventBase
    block_hash CHARACTER VARYING NOT NULL,
    UNIQUE (reservation_id, state, txhash)
);

CREATE INDEX idx_reservation_state_events_reservation_id ON reservation_state_events (reservation_id);
CREATE INDEX idx_reservation_state_events_state ON reservation_state_events (state);
CREATE INDEX idx_reservation_state_events_block_number ON reservation_state_events (block_number);
CREATE INDEX idx_reservation_state_events_block_hash ON reservation_state_events (block_hash);



-- ============================
-- Table of btc transactions (payment for reservations)
-- ============================

CREATE TABLE bitcoin_txs (
    txid CHARACTER VARYING NOT NULL,
    block_hash CHARACTER VARYING NOT NULL,
    block_height INTEGER NOT NULL,
    target_chain_id CHARACTER VARYING NOT NULL,
    reservation_id CHARACTER VARYING NOT NULL,
    position_id CHARACTER VARYING NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (txid, block_hash)
);

CREATE INDEX idx_bitcoin_txs_block_hash ON bitcoin_txs (block_hash);
CREATE INDEX idx_bitcoin_txs_block_height ON bitcoin_txs (block_height);
CREATE INDEX idx_bitcoin_txs_target_chain_id ON bitcoin_txs (target_chain_id);
CREATE INDEX idx_bitcoin_txs_reservation_id ON bitcoin_txs (reservation_id);
CREATE INDEX idx_bitcoin_txs_position_id ON bitcoin_txs (position_id);
CREATE INDEX idx_bitcoin_txs_timestamp ON bitcoin_txs (timestamp);
CREATE INDEX idx_bitcoin_txs_txid ON bitcoin_txs (txid);
CREATE INDEX idx_bitcoin_txs_reservation_id_block_hash ON bitcoin_txs (reservation_id, block_hash);


