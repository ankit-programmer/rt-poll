const uws = require('./uws/uws');
import WebSocket, { WebSocketServer } from 'ws';
const uwsPORT = 5000;

const app = uws./*SSL*/App().ws('/*', {
    /* Options */
    compression: uws.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    /* Handlers */
    open: (ws: any) => {
        console.log(JSON.stringify(ws));
        console.log('A WebSocket connected!');
    },
    message: (ws: any, message: any, isBinary: any) => {
        console.log(JSON.stringify(ws));
        /* Ok is false if backpressure was built up, wait for drain */
        let ok = ws.send(message, isBinary);


    },
    drain: (ws: any) => {
        console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
    },
    close: (ws: any, code: any, message: any) => {
        console.log('WebSocket closed');
    }
}).any('/*', (res: any, req: any) => {
    res.end('Nothing to see here!');
}).listen(uwsPORT, (token: any) => {
    if (token) {
        console.log('Listening to port ' + uwsPORT);
    } else {
        console.log('Failed to listen to port ' + uwsPORT);
    }
});

const wss = new WebSocketServer({
    port: 6000,
    perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages
        // should not be compressed if context takeover is disabled.
    }
});

wss.on('connection',(ws:any)=>{
    console.log("A WebSocket Connected!")
    ws.on('message',(data:any)=>{
        ws.send(data.toString());
    });
})

