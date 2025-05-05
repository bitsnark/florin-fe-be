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
    finality TEXT NOT NULL            -- Finality status: 'UNKNOWN', 'FINAL', 'REVERTED'
);

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
    block_hash CHARACTER VARYING NOT NULL           -- from EventBase
);

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
    block_hash CHARACTER VARYING NOT NULL           -- from EventBase
);


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



