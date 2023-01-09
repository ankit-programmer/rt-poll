/**
 * Migration from Socket.IO to uWebSocket
 * https://unetworkingab.medium.com/moving-from-socket-io-to-%C2%B5websockets-js-a85753b93a5a
 * 
 * Other Blogs from uWebSocket
 * https://unetworkingab.medium.com/
 */
import dotenv from 'dotenv';
dotenv.config();
import admin from './configs/firebase';
import uws from 'uWebSockets.js';
import { HttpRequest, HttpResponse, TemplatedApp, us_socket_context_t, WebSocket } from 'uWebSockets.js/index';
import client, { PubSub } from './configs/redis';
import logger from './logger';
import { StringDecoder } from 'string_decoder';
import { RedisClientType } from 'redis';
const decoder = new StringDecoder('utf-8');
const uwsPORT = 5000 || process.env.PORT;

type Event = {
    action: 'join' | 'leave',
    id: string,
    type: string
}

type UserData = {
    [key: string]: any
}



const app: TemplatedApp = uws./*SSL*/App().ws('/*', {
    /* Options */
    compression: uws.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 12,
    /* Handlers */
    open: async (ws: WebSocket<UserData>) => {
        ws.send(JSON.stringify({ status: 'connected' }));
        const userData: UserData = ws as any as UserData;
        const url = userData?.url; // i.e /poll/pollId
        const [baseUrl, type, id] = url?.split("/");
        // TODO: ANKIT: Validate and check for authorization
        // TODO: ANKIT: Centralize the key/topic creation process to reduce the chance of inconsistency
        const topic = `public:${type?.trim()}:${id?.trim()}`;
        console.log(topic);
        ws.subscribe(topic);

    },
    message: async (ws: WebSocket<UserData>, message: ArrayBuffer, isBinary: boolean) => {
        const msg: Event = JSON.parse(decoder.write(Buffer.from(message)));
        const key = `public:${msg?.type?.trim()}:${msg?.id?.trim()}`
        switch (msg?.action) {
            case 'join':
                ws.subscribe(key);
                break;
            case 'leave':
                ws.unsubscribe(key);
                break;
        }

    },

    subscription: async (ws: WebSocket<UserData>, topic: ArrayBuffer, newCount: number, oldCount: number) => {
        // Subscribe/ Unsubscribe to redis channels.
        const room = decoder.write(Buffer.from(topic));
        if (newCount > oldCount) {
            // New Subscriber added
            await pubSub.subscribe(room);
        } else {
            // Subscriber removed
            await pubSub.unSubscribe(room);
        }
    },
    upgrade: async (res: HttpResponse, req: HttpRequest, context: us_socket_context_t) => {
        const data = {
            secWebSocketKey: req.getHeader("sec-websocket-key"),
            secWebSocketProtocol: req.getHeader("sec-websocket-protocol"),
            secWebSocketExtensions: req.getHeader("sec-websocket-extensions"),
            context: context,
            aborted: false,
            res: res
        }
        res.onAborted(() => {
            data.aborted = true;
        });
        // Authenticate user and add important details for further use.
        const token = req.getHeader('Authorization') ? req.getHeader('Authorization')?.replace('Bearer ', '') : req.getQuery('token')?.toString();
        const url = req.getUrl();
        const user: any = await authenticate(token).catch(reason => {
            logger.info("User not authenticated!");
            data.res.writeStatus('401').write(reason?.message);
            data.res.end();
        });
        if (!user) return;
        if (!data.aborted) {
            user.url = url;
            data.res.upgrade(user as UserData, data.secWebSocketKey,
                data.secWebSocketProtocol,
                data.secWebSocketExtensions,
                data.context)
        } else {
            logger.info("Connection closed. Skipping upgrade to WebSocket!");
        }
    },
    drain: (ws: WebSocket<UserData>) => {
        console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
    },
    close: (ws: WebSocket<UserData>, code: number, message: ArrayBuffer) => {
        logger.info("Connection closed!");
    }
}).any('/*', (res: any, req: any) => {
    res.end('Nothing to see here!');
});


const pubSub = new PubSub(app, client as RedisClientType);
pubSub
    .on('ready', () => {
        app.listen(uwsPORT, (token: any) => {
            if (token) {
                console.log('Listening to port ' + uwsPORT);
            } else {
                console.log('Failed to listen to port ' + uwsPORT);
            }
        });
    })
    .on('error', (error) => {
        logger.error(error);
    })


function delay(time: number = 1000) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            return resolve(true);
        }, time);
    })
}

async function authenticate(token: string) {
    let user = null;
    if (token) {
        await admin.auth().verifyIdToken(token, false).then(async (payload: any) => {
            // res.locals is an object which can store intermediate values for the given request. http://expressjs.com/en/api.html#res.locals
            user = payload
        }).catch((error: any) => {
            logger.error(error.code);
            logger.error(error);
            switch (error.code) {
                case 'auth/id-token-expired':
                    throw new Error('Token has expired. Please try with a fresh token.');
                    break;

                default:
                    throw new Error('Authentication failed. Please authenticate yourself.');
                    break;
            }

        });

    } else {
        logger.error("Token not found");
    }
    return user;
}