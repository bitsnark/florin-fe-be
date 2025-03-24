
export enum Finality {
    UNKNOWN = 'UNKNOWN',
    FINAL = 'FINAL',
    REVERTED = 'REVERTED'
}

export interface Block {
    // Unique id, hex string
    blockHash: string;

    chainId: number;

    blockNumber: number;

    finality: Finality;
}

export interface EventBase {
    eventId?: number;
    blockNumber: number;
    blockHash: string; // hex string
}

export enum PositionState {
    NONE = 'NONE',
    ACTIVE = 'ACTIVE',
    PAUSED = 'PAUSED',
    CLOSED = 'CLOSED',
}

export interface PositionCreatedEvent extends EventBase {
    // Unique identifier for this position
    // 32 bytes, hex string
    positionId: string;

    chainId: number;

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

export interface PositionStateEvent
    extends EventBase {

    positionId: string;
    state: PositionState;
}

export interface Position extends PositionCreatedEvent, PositionStateEvent, Pick<Block, 'finality'> { }

export enum ReservationState {
    NONE = 'NONE',
    PENDING = 'PENDING',
    EXPIRED = 'EXPIRED',
    CANCELED = 'CANCELED',
    SETTLED = 'SETTLED',
}

export interface ReservationCreatedEvent extends EventBase {
    // Unique identifier for this reservation
    // 32 bytes, hex string
    reservationId: string;

    // EVM owner of this reservation
    // EVM address as hex string
    ownerAddress: string;

    // Unique identifier for the position
    // 32 bytes, hex string
    positionId: string;

    // Number of tokens to hold
    // 10^18 precision
    amount: bigint;
}

export interface ReservationStateEvent
    extends EventBase {
    reservationId: string;
    state: ReservationState;
}

export interface Reservation extends ReservationCreatedEvent, ReservationStateEvent, Pick<Block, 'finality'> {
}

