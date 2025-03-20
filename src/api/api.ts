import { MaterializedPosition } from '../db/materlialized-position';
import { MaterializedReservation } from '../db/materialized-reservation';
import { Express } from 'express';

export const indexGreeting = 'This is the Florin API index';
export function setApi(app: Express) {

    const materializedPosition = new MaterializedPosition();
    const materializedReservation = new MaterializedReservation();

    // sanity
    app.get('/', (req, res): void => {
        res.send(indexGreeting);
    });

    app.get('/positions/owner/:id', async (req, res) => {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).send('ID is required');
                return;
            }
            const ret = await materializedPosition.getPositionsByOwner(id);
            if (ret) res.send(JSON.stringify(ret));
        } catch (e) {
            console.error(e);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/positions/active', async (req, res) => {
        try {
            const ret = await materializedPosition.getActivePositions();
            if (ret) res.send(JSON.stringify(ret));
        } catch (e) {
            console.error(e);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/positions/:id', async (req, res) => {
        const { id } = req.params;
        if (!id) {
            res.status(400).send('ID is required');
            return;
        }
        try {
            const item = await materializedPosition.getPositionById(id);
            if (item) {
                res.send(JSON.stringify(item));
            } else {
                res.status(404).send('Item not found');
            }
        } catch (error) {
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/reservations/owner/:id', async (req, res) => {
        const { id } = req.params;
        if (!id) {
            res.status(400).send('ID is required');
            return;
        }
        try {
            const ret = await materializedReservation.getReservationByOwner(id);
            if (ret) res.send(JSON.stringify(ret));
        } catch (error) {
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/reservations/:id', async (req, res) => {
        const { id } = req.params;
        if (!id) {
            res.status(400).send('ID is required');
            return;
        }
        try {
            const item = await materializedReservation.getReservationById(id);
            if (item) {
                res.send(JSON.stringify(item));
            } else {
                res.status(404).send('Item not found');
            }
        } catch (error) {
            res.status(500).send('Internal Server Error');
        }
    });
}
