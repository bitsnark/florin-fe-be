import { EventsDb } from '../src/db/events-db';
import { PositionCreatedEvent, PositionState, PositionStateEvent, ReservationCreatedEvent, ReservationState, ReservationStateEvent } from '../src/common/types';
import { describe, beforeEach, it, expect } from '@jest/globals';

describe('EventsDb', () => {
    let eventsDb: EventsDb;

    const fakePositionId = `${Date.now()}`;
    const fakeReservationId = `${Date.now()}`;

    beforeEach(() => {
        eventsDb = new EventsDb();
    });

    describe('positionCreated', () => {
        it('should execute the correct query with the provided event data', async () => {
            const event: Exclude<PositionCreatedEvent, 'eventId'> = {
                positionId: fakePositionId,
                chainId: 1,
                ownerAddress: '0xOwner',
                tokenAddress: '0xToken',
                originalAmount: 1000n,
                bitcoinAddress: '1BitcoinAddress',
                exchangeRate: 10n ** 10n,
                blockNumber: 12345,
                blockHash: '0xBlockHash',
            };

            const eventId = await eventsDb.positionCreated(event);
            expect(eventId).toBeTruthy();
        });
    });

    describe('positionStateChanged', () => {
        it('should execute the correct query and return the event ID', async () => {
            const event: Exclude<PositionStateEvent, 'eventId'> = {
                positionId: fakePositionId,
                state: PositionState.ACTIVE,
                blockNumber: 12345,
                blockHash: '0xBlockHash',
            };

            const eventId = await eventsDb.positionStateChanged(event);
            expect(eventId).toBeTruthy();
        });
    });

    describe('reservationCreated', () => {
        it('should execute the correct query with the provided event data', async () => {
            const event: Exclude<ReservationCreatedEvent, 'eventId'> = {
                reservationId: fakeReservationId,
                ownerAddress: '0xOwner',
                positionId: fakePositionId,
                amount: 500n,
                blockNumber: 12345,
                blockHash: '0xBlockHash',
            };

            const eventId = await eventsDb.reservationCreated(event);
            expect(eventId).toBeTruthy();
        });
    });

    describe('reservationStateChanged', () => {
        it('should execute the correct query and return the event ID', async () => {
            const event: Exclude<ReservationStateEvent, 'eventId'> = {
                reservationId: fakeReservationId,
                state: ReservationState.PENDING,
                blockNumber: 12345,
                blockHash: '0xBlockHash',
            };

            const eventId = await eventsDb.reservationStateChanged(event);
            expect(eventId).toBeTruthy();
        });
    });
});