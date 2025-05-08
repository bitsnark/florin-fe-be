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

    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        console.log("Query Params:", req.query);
        console.log("Body:", req.body);
        next(); // Pass control to the next middleware or route handler
    });

    // Define endpoints
    setApi(app);

    // HTTP server options
    const options = {

    };

    // Create HTTP server with the Express app
    const port = config.httpPort;
    const host = '0.0.0.0';
    const server = http.createServer(options, app).listen(port, host, () => {
        console.log(`HTTP server listening on port ${host}:${port}`);
    });
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    initServer();
}
