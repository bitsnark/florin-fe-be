import * as https from 'https';
import * as fs from 'fs';
import { Express } from 'express';
import { setApi } from './api';

function initServer() {
    const app = Express();

    // Define endpoints
    setApi(app);

    // HTTPS server options
    const options = {
        // Server private key and certificate
        key: fs.readFileSync('server-key.pem'),
        cert: fs.readFileSync('server-cert.pem'),
        // Request client certificate and reject unauthorized clients
        requestCert: true,
        rejectUnauthorized: true
    };

    // Create HTTPS server with the Express app
    const port = 8443;
    https.createServer(options, app).listen(port, () => {
        console.log(`HTTPS server listening on port ${port}`);
    });
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    initServer();
}
