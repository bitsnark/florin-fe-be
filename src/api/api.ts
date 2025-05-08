/**
 * Configures the API routes for the provided Express application.
 *
 * @param app - The Express application instance to configure.
 *
 * ### Routes:
 *
 * #### General
 * - `GET /` - Returns a greeting message for sanity check.
 *
 * #### Positions
 * - `GET /positions/owner/:id` - Retrieves positions by owner ID.
 *   - **Query Parameters**:
 *     - `finalityFlag` (optional): A boolean flag to filter results based on finality.
 *   - **Path Parameters**:
 *     - `id`: The owner ID (required).
 *   - **Responses**:
 *     - `200`: Returns the positions as JSON.
 *     - `400`: If the `id` is missing.
 *     - `500`: Internal server error.
 *
 * - `GET /positions/active` - Retrieves all active positions.
 *   - **Query Parameters**:
 *     - `finalityFlag` (optional): A boolean flag to filter results based on finality.
 *   - **Responses**:
 *     - `200`: Returns the active positions as JSON.
 *     - `500`: Internal server error.
 *
 * - `GET /positions/:id` - Retrieves a position by its ID.
 *   - **Query Parameters**:
 *     - `finalityFlag` (optional): A boolean flag to filter results based on finality.
 *   - **Path Parameters**:
 *     - `id`: The position ID (required).
 *   - **Responses**:
 *     - `200`: Returns the position as JSON.
 *     - `400`: If the `id` is missing.
 *     - `404`: If the position is not found.
 *     - `500`: Internal server error.
 *
 * - `POST /positions` - Creates a new position.
 *   - **Responses**:
 *     - `500`: Not implemented.
 *
 * #### Reservations
 * - `GET /reservations/owner/:id` - Retrieves reservations by owner ID.
 *   - **Query Parameters**:
 *     - `finalityFlag` (optional): A boolean flag to filter results based on finality.
 *   - **Path Parameters**:
 *     - `id`: The owner ID (required).
 *   - **Responses**:
 *     - `200`: Returns the reservations as JSON.
 *     - `400`: If the `id` is missing.
 *     - `500`: Internal server error.
 *
 * - `GET /reservations/active` - Retrieves all active reservations in the `PENDING` state.
 *   - **Query Parameters**:
 *     - `finalityFlag` (optional): A boolean flag to filter results based on finality.
 *   - **Responses**:
 *     - `200`: Returns the active reservations as JSON.
 *     - `500`: Internal server error.
 *
 * - `GET /reservations/:id` - Retrieves a reservation by its ID.
 *   - **Query Parameters**:
 *     - `finalityFlag` (optional): A boolean flag to filter results based on finality.
 *   - **Path Parameters**:
 *     - `id`: The reservation ID (required).
 *   - **Responses**:
 *     - `200`: Returns the reservation as JSON.
 *     - `400`: If the `id` is missing.
 *     - `404`: If the reservation is not found.
 *     - `500`: Internal server error.
 */

import { MaterializedPosition } from '../db/materlialized-position';
import { MaterializedReservation } from '../db/materialized-reservation';
import { MaterializedHistory } from '../db/materialized-history';
import { Express } from 'express';
import { ReservationState } from '../common/types';
import { jsonStringifyCustom } from '../common/json';
import { openPosition } from '../position-opener';
import { BitcoinNode } from '../btc-listener/bitcoin-node';


export const indexGreeting = 'This is the Florin API index';

export function setApi(app: Express) {

    const materializedPosition = new MaterializedPosition();
    const materializedReservation = new MaterializedReservation();
    const materializedHistory = new MaterializedHistory();
    const btcNode = new BitcoinNode();

    // sanity
    app.get('/', (req, res): void => {
        res.send(indexGreeting);
    });

    app.get('/positions/owner/:id', async (req, res) => {
        const finalityFlag = !!req.query.finalityFlag;
        const { id } = req.params;
        if (!id) {
            res.status(400).send('ID is required');
            return;
        }
        try {
            const ret = await materializedPosition.getPositionsByOwner(id, finalityFlag);
            if (ret) res.send(jsonStringifyCustom(ret));
        } catch (e) {
            console.error(e);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/positions/active', async (req, res) => {
        try {
            const finalityFlag = !!req.query.finalityFlag;
            const ret = await materializedPosition.getActivePositions(finalityFlag);
            if (ret) res.send(jsonStringifyCustom(ret));
        } catch (e) {
            console.error(e);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/positions/:id', async (req, res) => {
        const finalityFlag = !!req.query.finalityFlag;
        const { id } = req.params;
        if (!id) {
            res.status(400).send('ID is required');
            return;
        }
        try {
            const item = await materializedPosition.getPositionById(id, finalityFlag);
            if (item) {
                res.send(jsonStringifyCustom(item));
            } else {
                res.status(404).send('Item not found');
            }
        } catch (error) {
            console.log(error);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/reservations/owner/:id', async (req, res) => {
        const finalityFlag = !!req.query.finalityFlag;
        const { id } = req.params;
        if (!id) {
            res.status(400).send('ID is required');
            return;
        }
        try {
            const ret = await materializedReservation.getReservationByOwner(id, finalityFlag);
            if (ret) res.send(jsonStringifyCustom(ret));
        } catch (error) {
            console.log(error);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/reservations/active', async (req, res) => {
        try {
            const finalityFlag = !!req.query.finalityFlag;
            const ret = await materializedReservation.getReservationsByState(ReservationState.PENDING, finalityFlag);
            if (ret) res.send(jsonStringifyCustom(ret));
        } catch (error) {
            console.log(error);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/reservations/:id', async (req, res) => {
        const finalityFlag = !!req.query.finalityFlag;
        const { id } = req.params;
        if (!id) {
            res.status(400).send('ID is required');
            return;
        }
        try {
            const item = await materializedReservation.getReservationById(id, finalityFlag);
            if (item) {
                res.send(jsonStringifyCustom(item));
            } else {
                res.status(404).send('Item not found');
            }
        } catch (error) {
            console.log(error);
            res.status(500).send('Internal Server Error');
        }
    });

    app.post('/positions', async (req, res) => {
        try {
            throw new Error('Not implemented');
        } catch (error) {
            console.log(error);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/history/:address', async (req, res) => {
        const finalityFlag = !!req.query.finalityFlag;

        const { address } = req.params;
        if (!address) {
            res.status(400).send('address is required');
            return;
        }
        try {
            const history = await materializedHistory.getOwnerHistory(address.toLowerCase(), finalityFlag)
            if (history) res.send(jsonStringifyCustom(history));
        } catch (e) {
            console.error(e);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/btcBlockCount', async (req, res) => {
        try {
            const blockCount = await btcNode.getBlockCount();
            if (blockCount) res.send(jsonStringifyCustom({ blockCount }));
        } catch (e) {
            console.error(e);
            res.status(500).send('Internal Server Error');
        }
    });


    app.post('/position', async (req, res) => {
        try {
            const { forwardData } = req.body;
            if (!forwardData) {
                res.status(400).send('forwardData is required');
                return;
            }

            const posId = await openPosition(forwardData);


            if (posId) {
                res.json({ 'positionId': posId });
            } else {
                res.status(404).send('Item not found');
            }

        } catch (e) {
            console.error(e);
            res.status(500).send('Internal Server Error');
        }
    });

}
