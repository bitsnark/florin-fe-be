import * as http from 'http';
import express from 'express';
import { setApi } from './api';
import { config } from '../common/config';

export function initServer() {
    // Create an Express application
    const app = express();

    // Define endpoints
    setApi(app);

    // HTTP server options
    const options = {};

    // Create HTTP server with the Express app
    const port = config.httpPort;
    const server = http.createServer(options, app).listen(port, () => {
        console.log(`HTTP server listening on port ${port}`);
    });
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    initServer();
}
