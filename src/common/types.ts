
export enum Finality {
    UNKNOWN = 'UNKNOWN',
    FINAL = 'FINAL',
    REVERTED = 'REVERTED'
}

export interface Block {
    // Unique id, hex string
    blockHash: string;

    blockNumber: number;

    finality: Finality;
}

export interface EventBase {
    eventId?: number;
    blockNumber: number;
    blockHash: string; // hex string
}

export enum PositionStatus {
    NONE = 'NONE',
    ACTIVE = 'ACTIVE',
    PAUSED = 'PAUSED',
    CLOSED = 'CLOSED',
}

export interface Position {
    // Unique identifier for this position
    // 32 bytes, hex string
    positionId: string;

    chainId: number;

    status: PositionStatus;

    // EVM owner of this position
    // EVM address as hex string
    ownerAddress: string;

    // EVM address of the token as hex string
    tokenAddress: string;

    // Number of tokens originally sent to this position
    // 10^18 precision
    originalAmount: bigint;

    // Bitcoin address where BTC is to be sent
    // Tweaked public key, 32 bytes, hex string
    bitcoinAddress: string;

    // Rate of exchage
    // 10^10 * Satoshis per Wei
    // 1:1 ≡ 10^10
    exchangeRate: bigint;
}

export interface PositionCreatedEvent extends EventBase, Position { }

export interface PositionStatusEvent
    extends EventBase, Pick<Position, 'positionId' | 'status'> { }

export enum ReservationStatus {
    NONE = 'NONE',
    PENDING = 'PENDING',
    EXPIRED = 'EXPIRED',
    CANCELED = 'CANCELED',
    SETTLED = 'SETTLED',
}

export interface Reservation {
    // Unique identifier for this reservation
    // 32 bytes, hex string
    reservationId: string;

    status: ReservationStatus;

    // EVM owner of this reservation
    // EVM address as hex string
    ownerAddress: string;

    // Unique identifier for the position
    // 32 bytes, hex string
    positionId: string;

    // Number of tokens to hold
    // 10^18 precision
    amount: bigint;

    // Number of EVM block that this reservation was created
    createdAtBlock: number;
}

export interface ReservationCreatedEvent extends EventBase, Reservation { }

export interface ReservationStatusEvent
    extends EventBase, Pick<Reservation, 'reservationId' | 'status'> { }
