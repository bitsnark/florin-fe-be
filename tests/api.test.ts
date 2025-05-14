import request from 'supertest';
import express from 'express';
import { setApi, indexGreeting } from '../src/api/api';
import { Finality, PositionState, ReservationState } from '../src/common/types';
import { createPosition, createReservation } from './utils';
import { HistoryRecord } from '../src/db/materialized-history';


const fakePositionId = `${Date.now()}`;

const mockPosition = {
    positionId: fakePositionId,
    chainId: 'chain1',
    ownerAddress: 'owner1',
    tokenAddress: 'token1',
    originalAmount: 100,
    bitcoinAddress: 'bitcoin1',
    exchangeRate: 1,
    state: PositionState.ACTIVE,
    finality: Finality.FINAL
};

const mockReservation = {
    positionId: fakePositionId,
    reservationId: '1',
    amount: 100,
    state: ReservationState.PENDING,
    isInscription: false,
    finality: Finality.FINAL
};

const app = express();
setApi(app);

describe('API Endpoints', () => {
    describe('GET /', () => {
        it('should return the greeting message', async () => {
            const response = await request(app).get('/');
            expect(response.status).toBe(200);
            expect(response.text).toBe(indexGreeting);
        });
    });



    describe('GET /position/:id', () => {

        beforeAll(async () => {
            await createPosition(mockPosition);
        });

        it('should return a position by ID', async () => {
            const response = await request(app).get(`/position/${fakePositionId}`);
            expect(response.status).toBe(200);
        });

        it('should return 404 if position is not found', async () => {

            const response = await request(app).get(`/position/foo`);
            expect(response.status).toBe(404);
            expect(response.text).toBe('Item not found');
        });
    });

    describe('GET /reservation/:id', () => {

        beforeAll(async () => {
            await createPosition(mockPosition);
            await createReservation(mockReservation);
        });

        it('should return a reservation by ID', async () => {
            const response = await request(app).get('/reservation/1');
            expect(response.status).toBe(200);
        });

        it('should return 404 if reservation is not found', async () => {
            const response = await request(app).get('/reservation/foo');
            expect(response.status).toBe(404);
            expect(response.text).toBe('Item not found');
        });
    });

    describe('POST /positions', () => {
        it('should return 500 for not implemented endpoint', async () => {
            const response = await request(app).post('/positions');
            expect(response.status).toBe(500);
            expect(response.text).toBe('Internal Server Error');
        });
    });

    describe('GET /history/:address', () => {
        it('should find users history', async () => {
            const response = await request(app).get('/history/0xevmOwnerAddress');
            expect(response.status).toBe(200);
            expect((response.text as unknown as HistoryRecord[]).length).toBeGreaterThan(0);
        });
    });

});
