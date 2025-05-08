import * as http from 'http';
import express from 'express';
import { setApi } from './api';
import { config } from '../common/config';
import cors from 'cors'

export function initServer() {
    // Create an Express application
    const app = express();
    app.use(cors()); // <-- Enable CORS for cross-origin requests
    // app.use(bodyParser.json()); // <-- Parse incoming JSON requests
    // app.use(bodyParser.urlencoded({ extended: true })); // <-- Parse URL-encoded data


    // Define endpoints
    setApi(app);

    // HTTP server options
    const options = {

    };

    // Create HTTP server with the Express app
    const port = config.httpPort;
    const host = '0.0.0.0';
    const server = http.createServer(options, app).listen(port, host, () => {
        console.log(`HTTP server listening on port ${port}`);
    });
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    initServer();
}
