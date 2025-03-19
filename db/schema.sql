-- Drop existing tables if they exist (order matters due to foreign keys)
DROP TABLE IF EXISTS reservation_status_events;
DROP TABLE IF EXISTS reservation_created_events;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS position_status_events;
DROP TABLE IF EXISTS position_created_events;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS blocks;

-- ============================
-- Table for Blocks
-- ============================
CREATE TABLE blocks (
    block_hash CHAR(66) PRIMARY KEY,  -- Unique id, hex string (32 bytes with 0x prefix)
    block_number INTEGER NOT NULL,
    finality TEXT NOT NULL            -- Finality status: 'UNKNOWN', 'FINAL', 'REVERTED'
);

-- ============================
-- Table for PositionCreatedEvents
-- (extends EventBase and Position)
-- ============================
CREATE TABLE position_created_events (
    event_id SERIAL PRIMARY KEY,
    position_id CHAR(66) NOT NULL,      -- Unique identifier for this position
    chain_id NUMERIC NOT NULL,
    status TEXT NOT NULL,
    owner_address CHAR(42) NOT NULL,
    token_address CHAR(42) NOT NULL,
    original_amount NUMERIC NOT NULL,
    bitcoin_address CHAR(66) NOT NULL,
    exchange_rate NUMERIC NOT NULL,
    block_number INTEGER NOT NULL,         -- from EventBase
    block_hash CHAR(66) NOT NULL           -- from EventBase
);

-- ============================
-- Table for PositionStatusEvents
-- (extends EventBase and includes only positionId and status)
-- ============================
CREATE TABLE position_status_events (
    event_id SERIAL PRIMARY KEY,
    position_id CHAR(66) NOT NULL,
    status TEXT NOT NULL,
    block_number INTEGER NOT NULL,         -- from EventBase
    block_hash CHAR(66) NOT NULL           -- from EventBase
);

-- ============================
-- Table for ReservationCreatedEvents
-- (extends EventBase and Reservation)
-- ============================
CREATE TABLE reservation_created_events (
    event_id SERIAL PRIMARY KEY,
    reservation_id CHAR(66) NOT NULL,
    owner_address CHAR(42) NOT NULL,
    status TEXT NOT NULL,
    position_id CHAR(66) NOT NULL,
    amount NUMERIC NOT NULL,
    created_at_block INTEGER NOT NULL,
    block_number INTEGER NOT NULL,         -- from EventBase
    block_hash CHAR(66) NOT NULL            -- from EventBase
);

-- ============================
-- Table for ReservationStatusEvents
-- (extends EventBase and includes only reservationId and status)
-- ============================
CREATE TABLE reservation_status_events (
    event_id SERIAL PRIMARY KEY,
    reservation_id CHAR(66) NOT NULL,
    status TEXT NOT NULL,
    block_number INTEGER NOT NULL,         -- from EventBase
    block_hash CHAR(66) NOT NULL           -- from EventBase
);
