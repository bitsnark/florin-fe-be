import * as http from 'http';
import { Express } from 'express';
import { setApi } from './api';

export function initServer(): { server: http.Server; app: Express } {
    // Create an Express application
    const app = Express();

    // Define endpoints
    setApi(app);

    // HTTP server options
    const options = {};

    // Create HTTP server with the Express app
    const port = 8000;
    const server = http.createServer(options, app).listen(port, () => {
        console.log(`HTTP server listening on port ${port}`);
    });

    return { server, app };
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    initServer();
}
